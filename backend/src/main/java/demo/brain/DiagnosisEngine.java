package demo.brain;

import com.fasterxml.jackson.databind.JsonNode;
import java.util.*;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

/** Observation-only cause questions; may reuse the joint Jev response and never receives benchmark answers. */
@Service
public class DiagnosisEngine {
  private record Cause(String type, String label, String criteria, List<String> signatures) {}
  private static final Map<String, Cause> CAUSES = new LinkedHashMap<>();
  static {
    CAUSES.put("RESOURCE_PRESSURE", new Cause("RESOURCE", "CPU·메모리 자원 포화", "CPU saturation, memory exhaustion or process queue pressure", List.of("cpu", "memory", "메모리", "자원 포화")));
    CAUSES.put("DB_POOL_EXHAUSTION", new Cause("DATABASE", "DB 연결 풀 고갈", "Database connection pool exhausted, connections unavailable", List.of("connection pool", "연결 풀")));
    CAUSES.put("DB_LOCK_CONTENTION", new Cause("DATABASE", "DB 잠금 경합", "Database lock wait or query deadlock", List.of("lock timeout", "deadlock", "잠금")));
    CAUSES.put("DNS_FAILURE", new Cause("NETWORK", "DNS 이름 해석 실패", "DNS resolution failure or timeout", List.of("dns")));
    CAUSES.put("PACKET_LOSS", new Cause("NETWORK", "네트워크 패킷 손실", "Network packet loss or gateway unreachable", List.of("packet loss", "gateway", "패킷")));
    CAUSES.put("DEPLOYMENT_REGRESSION", new Cause("APPLICATION", "배포 후 애플리케이션 회귀", "HTTP 500 exceptions after deployment, regression", List.of("http 500", "regression", "배포")));
    CAUSES.put("AUTH_ANOMALY", new Cause("SECURITY", "인증·접근 이상", "Suspicious authentication or blocked access attempts", List.of("authentication", "suspicious", "인증")));
    CAUSES.put("UNKNOWN", new Cause("UNKNOWN", "원인 미확정", "Insufficient observations for any specific cause", List.of()));
  }

  private final Store s;
  private final JevHttpClient http;
  private final String localUrl, localKey, cloudUrl, cloudKey;

  public DiagnosisEngine(Store s, JevHttpClient http,
      @Value("${brain.jev.local-url}") String localUrl, @Value("${brain.jev.local-key}") String localKey,
      @Value("${brain.jev.typesafe-url}") String cloudUrl, @Value("${brain.jev.typesafe-key}") String cloudKey) {
    this.s=s; this.http=http; this.localUrl=localUrl; this.localKey=localKey; this.cloudUrl=cloudUrl; this.cloudKey=cloudKey;
  }

  public Map<String,Object> assess(Map<String,Object> incident) {
    String observations=incident.get("observations").toString();
    var primary=s.json.valueToTree(s.decode(incident.get("decision_json")));
    if ("DEMO".equals(incident.get("mode"))) return mock(observations, "MOCK", "", 0);
    if (primary.path("fallback").asBoolean()) return mock(observations, "MOCK_FALLBACK", "Primary Jev used fallback; diagnosis remains simulated", 0);
    boolean cloud="TYPESAFE".equals(incident.get("provider"));
    String provider=cloud ? "TYPESAFE_JEV" : "LOCAL_JEV";
    if(primary.path("answers").path("_combinedInference").asBoolean(false)) {
      try {
        var joint=s.json.createObjectNode();joint.put("model",primary.path("model").asText("unknown"));joint.set("answers",primary.path("answers"));
        var result=parse(new JevHttpClient.ModelReply(joint,0),provider,observations);
        result.put("inferenceReused",true);result.put("sharedInferenceLatencyMs",primary.path("latencyMs").asLong());
        result.put("execution",reusedExecution(primary));return result;
      } catch(IllegalArgumentException invalid) {
        var result=invalid(provider,observations,0);result.put("inferenceReused",true);result.put("execution",reusedExecution(primary));return result;
      }
    }
    if (cloud && cloudKey.isBlank()) throw new IllegalStateException("TypeSafe key is not configured");
    long start=System.nanoTime();
    for (int attempt=1; attempt<=2; attempt++) {
      if(attempt>1)PerformanceTrace.retry();
      try {
        var response=http.query(provider, cloud ? cloudUrl : localUrl, cloud ? cloudKey : localKey, request(observations));
        return parse(response, provider, observations);
      } catch (JevHttpClient.Unavailable failure) {
        if (cloud) throw failure;
        if (attempt==2) return mock(observations, "MOCK_FALLBACK", failure.getMessage(), (System.nanoTime()-start)/1_000_000);
      } catch (IllegalArgumentException invalid) {
        return invalid(provider,observations,(System.nanoTime()-start)/1_000_000);
      }
    }
    throw new IllegalStateException("Unreachable diagnosis state");
  }

  Map<String,Object> request(String observations) {
    return Map.of("model", "jev-latest", "state", observations, "questions", questions());
  }

  static Map<String,Object> questions() {
    var criteria=new LinkedHashMap<String,String>();
    CAUSES.forEach((key,value)->criteria.put(key,value.criteria()));
    return Map.of(
        "cause", Map.of("type", "choice", "instructions", "Select the best supported cause hypothesis using only the fictional observations. Choose UNKNOWN when evidence is insufficient. A hypothesis is not a confirmed root cause.", "criteria", criteria),
        "support", Map.of("type", "noul", "instructions", "Do the observations contain concrete technical evidence supporting a specific cause hypothesis?"));
  }

  private Map<String,Object> parse(JevHttpClient.ModelReply response, String provider, String observations) {
    var answers=response.body().path("answers");
    String cause=answers.path("cause").path("choice").asText();
    if (!CAUSES.containsKey(cause)) throw new IllegalArgumentException("Unknown cause");
    double confidence=probability(answers.path("cause").path("confidence"));
    double support=probability(answers.path("support").path("noul"));
    // Preserve the diagnosis artifact shape even when classification questions shared this request.
    var diagnosisAnswers=s.json.createObjectNode();diagnosisAnswers.set("cause",answers.path("cause"));diagnosisAnswers.set("support",answers.path("support"));
    @SuppressWarnings("unchecked") var raw=(Map<String,Object>)s.decode(diagnosisAnswers.toString());
    var result=result(cause,confidence,support,provider,response.body().path("model").asText("unknown"),response.latencyMs(),false,"",observations,raw);
    if(!response.execution().isEmpty())result.put("execution",response.execution());
    var probabilities=answers.path("cause").path("probabilities");
    if (probabilities.isObject()) {
      var ranked=new ArrayList<Map<String,Object>>();
      probabilities.fields().forEachRemaining(e->{
        if (!CAUSES.containsKey(e.getKey())) throw new IllegalArgumentException("Unexpected candidate");
        ranked.add(Map.of("code",e.getKey(),"label",CAUSES.get(e.getKey()).label(),"probability",probability(e.getValue())));
      });
      ranked.sort(Comparator.comparingDouble((Map<String,Object> c)->((Number)c.get("probability")).doubleValue()).reversed());
      result.put("candidates",ranked.stream().limit(3).toList());
    }
    return result;
  }

  private Map<String,Object> invalid(String provider,String observations,long elapsed) {
    var result=result("UNKNOWN",0,0,provider,"invalid-response",elapsed,false,"",observations,Map.of());
    result.put("schemaValid",false);result.put("reviewReason","원인 분석 응답의 형식 또는 확률이 유효하지 않습니다.");return result;
  }

  private Map<String,Object> reusedExecution(JsonNode primary) {
    var execution=new LinkedHashMap<String,Object>();String now=java.time.Instant.now().toString();
    execution.put("startedAt",now);execution.put("endedAt",now);execution.put("durationMs",0);
    execution.put("httpElapsedMs",0);execution.put("modelInferenceMs",null);execution.put("networkWaitMs",null);
    execution.put("retryCount",0);execution.put("requestCount",0);execution.put("modelCallAttempted",false);execution.put("actualModelCall",false);
    execution.put("inferenceReused",true);execution.put("sourceStage","JEV");execution.put("category","REAL_AI");
    execution.put("sourceExecution",s.decode(primary.path("answers").path("_execution").toString()));return execution;
  }

  private static double probability(JsonNode value) {
    if (!value.isNumber() || !Double.isFinite(value.asDouble()) || value.asDouble()<0 || value.asDouble()>1)
      throw new IllegalArgumentException("Invalid probability");
    return value.asDouble();
  }

  private Map<String,Object> mock(String observations, String provider, String reason, long elapsed) {
    String lower=observations.toLowerCase(Locale.ROOT);
    String code=CAUSES.entrySet().stream().filter(e->e.getValue().signatures().stream().anyMatch(lower::contains)).map(Map.Entry::getKey).findFirst().orElse("UNKNOWN");
    return result(code,code.equals("UNKNOWN") ? .25 : .9,code.equals("UNKNOWN") ? .2 : .9,provider,"deterministic-diagnosis-300",elapsed,true,reason,observations,Map.of("matchedSignature",code));
  }

  private Map<String,Object> result(String code,double confidence,double support,String provider,String model,long elapsed,boolean simulated,String reason,String observations,Map<String,Object> answers) {
    var cause=CAUSES.get(code);
    var result=new LinkedHashMap<String,Object>();
    result.put("causeCode",code); result.put("causeLabel",cause.label()); result.put("relatedType",cause.type());
    result.put("confidence",confidence); result.put("evidenceScore",support); result.put("provider",provider);
    result.put("model",model); result.put("latencyMs",elapsed); result.put("simulated",simulated);
    result.put("fallback",provider.equals("MOCK_FALLBACK")); result.put("fallbackReason",reason);
    result.put("schemaValid",true); result.put("needsReview",code.equals("UNKNOWN") || confidence<.65 || support<.65);
    result.put("evidence",List.of(observations)); result.put("answers",answers);
    result.put("scope","CAUSE_HYPOTHESIS_NOT_CONFIRMED_ROOT_CAUSE");
    result.put("candidates",List.of(Map.of("code",code,"label",cause.label())));
    return result;
  }
}
