package demo.brain;
import com.fasterxml.jackson.databind.JsonNode;
import org.springframework.stereotype.Component;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import java.net.URI;
import java.net.http.*;
import java.time.Duration;
import java.time.Instant;
import java.util.*;
import java.util.regex.Pattern;
@Component
public class JevHttpClient {
 public static class Unavailable extends RuntimeException {
  private final Map<String,Object> execution;
  public Unavailable(String message){this(message,Map.of());}
  public Unavailable(String message,Map<String,Object> execution){super(message);this.execution=execution;}
  public Map<String,Object> execution(){return execution;}
 }
 private static final Pattern INFERENCE_TIMING=Pattern.compile("(?:^|,)\\s*inference\\s*;\\s*dur=([0-9]+(?:\\.[0-9]+)?)",Pattern.CASE_INSENSITIVE);
 private final Store s;private final HttpClient http;private final int timeout;private final boolean combinedAnalysis;
 public JevHttpClient(Store s,int timeout){this(s,timeout,true);}
 @Autowired
 public JevHttpClient(Store s,@Value("${brain.jev.timeout-seconds}") int timeout,@Value("${brain.jev.combined-analysis:true}") boolean combinedAnalysis){this.s=s;this.timeout=timeout;this.combinedAnalysis=combinedAnalysis;http=HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(3)).build();}
 public Map<String,Object> request(String observations){
  var q=new LinkedHashMap<String,Object>();
  q.put("type",choice("Classify this fictional IT incident using its observed symptoms.",Map.of("RESOURCE","CPU or memory exhaustion","DATABASE","Database locks or exhausted connection pool","NETWORK","DNS failure or packet loss","APPLICATION","Application exceptions after deployment","SECURITY","Suspicious authentication or access attempts")));
  q.put("severity",choice("Choose urgency based on availability, not the incident type.",Map.of("P1","Customer outage; service unavailable","P2","Degraded performance but service remains available","P3","Minor issue without performance or availability impact")));
  q.put("department",choice("Choose the team responsible for the observed failure.",Map.of("PLATFORM","CPU memory process capacity","DATABASE","Database locks queries connection pool","NETWORK","DNS packet loss gateway","APPLICATION","Code deployment HTTP exceptions","SECURITY","Authentication suspicious access")));
  q.put("recurrence",Map.of("type","noul","instructions","Does the text explicitly report a repeated incident signature in the last seven days?"));
  q.put("evidence",Map.of("type","noul","instructions","Does the text contain concrete technical observations supporting an incident diagnosis, rather than only an unspecified problem?"));
  if(combinedAnalysis)q.putAll(DiagnosisEngine.questions());
  return Map.of("model","jev-latest","state",observations,"questions",q);
 }
 private Object choice(String instructions,Map<String,String> criteria){return Map.of("type","choice","instructions",instructions,"criteria",criteria);}
 public record ModelReply(JsonNode body,long latencyMs,Map<String,Object> execution) {
  public ModelReply(JsonNode body,long latencyMs){this(body,latencyMs,Map.of());}
 }
 public ModelReply query(String provider,String url,String key,Map<String,Object> payload){
  long start=System.nanoTime();Instant startedAt=Instant.now();Long inferenceMs=null;
  try {
   HttpResponse<String> response;
   try {
    var builder=HttpRequest.newBuilder(URI.create(url)).timeout(Duration.ofSeconds(timeout)).header("Content-Type","application/json");
    if(!key.isBlank())builder.header("Authorization","Bearer "+key);
    response=http.send(builder.POST(HttpRequest.BodyPublishers.ofString(s.encode(payload))).build(),HttpResponse.BodyHandlers.ofString());
   } catch(InterruptedException e){Thread.currentThread().interrupt();throw new Unavailable(provider+" interrupted",execution(startedAt,start,null));}
   catch(Exception e){throw new Unavailable(provider+" connection/timeout failure",execution(startedAt,start,null));}
   inferenceMs=reportedInference(response);
   if(response.statusCode()!=200)throw new Unavailable(provider+" HTTP "+response.statusCode(),execution(startedAt,start,inferenceMs));
   try {
    JsonNode body=s.json.readTree(response.body());if(body==null||!body.isObject())throw new IllegalArgumentException();
    var timing=execution(startedAt,start,inferenceMs);return new ModelReply(body,((Number)timing.get("durationMs")).longValue(),timing);
   }catch(Exception e){throw new IllegalArgumentException(provider+" returned invalid JSON");}
  } finally {PerformanceTrace.recordHttp("JEV",elapsed(start),inferenceMs);}
 }
 static Long reportedInference(HttpResponse<?> response){
  // Only an explicitly named server metric is inference time. Round trip includes server work.
  var match=INFERENCE_TIMING.matcher(response.headers().firstValue("Server-Timing").orElse(""));if(!match.find())return null;
  try{double value=Double.parseDouble(match.group(1));return Double.isFinite(value)&&value>=0&&value<=Long.MAX_VALUE?Math.round(value):null;}catch(NumberFormatException invalid){return null;}
 }
 private static long elapsed(long start){return (System.nanoTime()-start)/1_000_000;}
 static Map<String,Object> execution(Instant startedAt,long start,Long inferenceMs){
  var result=new LinkedHashMap<String,Object>();long elapsed=elapsed(start);
  result.put("startedAt",startedAt.toString());result.put("endedAt",Instant.now().toString());result.put("durationMs",elapsed);result.put("httpElapsedMs",elapsed);
  result.put("modelInferenceMs",inferenceMs);result.put("networkWaitMs",null);result.put("modelTimingSource",inferenceMs==null?"UNAVAILABLE":"SERVER_TIMING_INFERENCE");
  result.put("networkTimingSource","UNAVAILABLE_HTTP_INCLUDES_SERVER_WORK");result.put("retryCount",0);result.put("requestCount",1);result.put("modelCallAttempted",true);return result;
 }
 public JevDecision call(String provider,String url,String key,String observations){
  var reply=query(provider,url,key,request(observations));
  try{JsonNode root=reply.body(),a=root.path("answers");String type=readChoice(a,"type"),severity=readChoice(a,"severity"),department=readChoice(a,"department");double confidence=Math.min(conf(a,"type"),Math.min(conf(a,"severity"),conf(a,"department"))),recurrence=prob(a,"recurrence"),evidence=prob(a,"evidence");
   @SuppressWarnings("unchecked") Map<String,Object> answers=new LinkedHashMap<>((Map<String,Object>)s.decode(a.toString()));
   // This locally written marker also makes missing cause/support require review, not another call.
   answers.put("_combinedInference",combinedAnalysis);
   var execution=new LinkedHashMap<>(reply.execution());execution.put("combinedInference",combinedAnalysis);execution.put("requestedProvider",provider);execution.put("actualProvider",provider);execution.put("actualModelCall",true);execution.put("category","REAL_AI");answers.put("_execution",execution);
   JevDecision result=new JevDecision(type,severity,List.of("P1","P2","P3").indexOf(severity)+1,department,recurrence>=0.5,confidence,evidence,provider,root.path("model").asText("unknown"),reply.latencyMs(),false,false,"",confidence<0.65||evidence<0.65,List.of(observations,"Choice/noul probabilities are model evidence; causal explanation is not returned by Jev."),answers);result.validate();return result;
  }catch(Exception e){throw new IllegalArgumentException(provider+" returned an invalid response schema");}
 }
 private String readChoice(JsonNode a,String field){String value=a.path(field).path("choice").asText();if(value.isBlank())throw new IllegalArgumentException();return value;}
 private double conf(JsonNode a,String field){return number(a.path(field).path("confidence"));}
 private double prob(JsonNode a,String field){return number(a.path(field).path("noul"));}
 private double number(JsonNode value){if(!value.isNumber())throw new IllegalArgumentException();double x=value.asDouble();if(!Double.isFinite(x)||x<0||x>1)throw new IllegalArgumentException();return x;}
}
