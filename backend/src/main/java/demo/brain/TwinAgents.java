package demo.brain;

import java.util.*;
import org.springframework.stereotype.Service;
import org.springframework.beans.factory.annotation.Value;

/** Bounded role specialists. The simulation and policy specialists are deterministic, not LLMs. */
@Service
public class TwinAgents {
 private final Store store;private final JevHttpClient jev;private final HttpHermesAdapter hermes;
 private final String localUrl,localKey,cloudUrl,cloudKey;
 public TwinAgents(Store store,JevHttpClient jev,HttpHermesAdapter hermes,@Value("${brain.jev.local-url}") String localUrl,@Value("${brain.jev.local-key}") String localKey,@Value("${brain.jev.typesafe-url}") String cloudUrl,@Value("${brain.jev.typesafe-key}") String cloudKey){this.store=store;this.jev=jev;this.hermes=hermes;this.localUrl=localUrl;this.localKey=localKey;this.cloudUrl=cloudUrl;this.cloudKey=cloudKey;}
 public Map<String,Object> analyze(TwinEngine.Snapshot s,String mode,String provider){
  long started=System.nanoTime();String cause=ruleCause(s),source="RULE_BASELINE",reason="규칙 기반 분석 선택",model="none",target=s.nodes().stream().max(Comparator.comparingDouble(n->n.errorRate()+n.cpu()+n.memory())).orElseThrow().id();boolean attempted=false,actual=false;Double confidence=null;Map<String,Object> execution=Map.of();
  if(mode.equals("REAL"))try{
   boolean cloud=provider.equals("TYPESAFE");if(cloud&&cloudKey.isBlank())throw new IllegalStateException("TYPESAFE_API_KEY 미설정");
   var causes=new LinkedHashMap<String,String>();for(var t:TwinEngine.FaultType.values())causes.put(t.name(),t.name().replace('_',' '));causes.put("UNKNOWN","Insufficient evidence");
   var targets=new LinkedHashMap<String,String>();s.nodes().forEach(n->targets.put(n.id(),n.name()));attempted=true;
   var reply=jev.query(cloud?"TYPESAFE_JEV":"LOCAL_JEV",cloud?cloudUrl:localUrl,cloud?cloudKey:localKey,Map.of("model","jev-latest","state",observations(s),"questions",Map.of("cause",Map.of("type","choice","instructions","Choose a cause hypothesis from synthetic node observations only; do not claim a proven cause.","criteria",causes),"target",Map.of("type","choice","instructions","Which component is the likely origin?","criteria",targets))));
   var a=reply.body().path("answers");String c=a.path("cause").path("choice").asText(),t=a.path("target").path("choice").asText();if(!causes.containsKey(c)||!targets.containsKey(t))throw new IllegalArgumentException("Jev 응답 스키마 불일치");
   double causeConfidence=a.path("cause").path("confidence").asDouble(Double.NaN),targetConfidence=a.path("target").path("confidence").asDouble(Double.NaN);if(!Double.isFinite(causeConfidence)||!Double.isFinite(targetConfidence)||causeConfidence<0||causeConfidence>1||targetConfidence<0||targetConfidence>1)throw new IllegalArgumentException("Jev 신뢰도 스키마 불일치");confidence=Math.min(causeConfidence,targetConfidence);execution=reply.execution();
   cause=c;target=t;source=cloud?"TYPESAFE_JEV":"LOCAL_JEV";model=reply.body().path("model").asText("unknown");actual=true;reason="Jev choice 판단 · 근본 원인 확정 아님";
  }catch(Exception e){source="RULE_FALLBACK";reason="모델 사용 불가 또는 응답 검증 실패: "+e.getMessage();}
  var result=new LinkedHashMap<String,Object>();result.put("requestedProvider",mode.equals("REAL")?provider:"NONE");result.put("actualProvider",source);result.put("confidence",confidence);result.put("needsReview",confidence==null||confidence<.65);result.put("execution",execution);result.put("cause",cause);result.put("target",target);result.put("source",source);result.put("model",model);result.put("actualModelCall",actual);result.put("modelCallAttempted",attempted);result.put("reason",reason);result.put("latencyMs",(System.nanoTime()-started)/1_000_000);result.put("evidence",s.nodes().stream().filter(n->!n.status().equals("HEALTHY")).toList());result.put("affected",s.nodes().stream().filter(n->n.errorRate()>0).map(TwinEngine.Node::id).toList());result.put("priority",TwinEngine.node(s,"external-api").availability()<50?"P1":"P2");return result;
 }
 // Neither hidden benchmark answers nor injected fault types are passed to model or baseline.
 public String observations(TwinEngine.Snapshot s){return store.encode(Map.of("scope","Synthetic Data only","nodes",s.nodes(),"dependencies",s.edges()));}
 static String ruleCause(TwinEngine.Snapshot s){
  var p=TwinEngine.node(s,"db-primary");if(p.availability()==0)return "DB_PRIMARY";
  if(TwinEngine.node(s,"redis").availability()==0)return "REDIS_FAILURE";if(TwinEngine.node(s,"mq").availability()==0)return "QUEUE_FAILURE";
  if(s.nodes().stream().anyMatch(n->n.memory()>85))return "MEMORY_PRESSURE";if(s.nodes().stream().anyMatch(n->n.cpu()>85))return "CPU_OVERLOAD";
  if(s.nodes().stream().anyMatch(n->n.availability()==0))return "SERVER_DOWN";
  if(s.nodes().stream().anyMatch(n->n.latency()>800))return "NETWORK_LATENCY";return "UNKNOWN";
 }
 public Map<String,Object> generate(TwinEngine.Snapshot snapshot,String mode,Map<String,Object> analysis){
  List<TwinEngine.Strategy> strategies=TwinEngine.strategies(snapshot);String source="RULE_BASELINE",reason="허용 액션 기반 규칙 전략",model="none";boolean actual=false,attempted=false;int rejected=0,proposedActions=0,unsafeActions=0;boolean modelResponded=false;long start=System.nanoTime();
  if(mode.equals("REAL"))try{
   attempted=hermes.configured();var response=hermes.generate("twin",Map.of("observations",store.decode(observations(snapshot)),"analysis",analysis,"allowedActions",TwinEngine.ActionType.values(),"referenceStrategies",strategies));
   modelResponded=true;var content=store.json.valueToTree(response.get("content")).path("strategies");if(!content.isArray()||content.size()<3||content.size()>5)throw new IllegalArgumentException("3~5개 전략 필요");
   var parsed=new ArrayList<TwinEngine.Strategy>();var ids=new HashSet<String>();
   for(var row:content)for(var action:row.path("actions")){proposedActions++;try{var a=new TwinEngine.Action(TwinEngine.ActionType.valueOf(action.path("type").asText()),action.path("target").asText());TwinEngine.validate(new TwinEngine.Strategy("policy","정책 검사","","","","","","",List.of(a)),snapshot);}catch(Exception denied){unsafeActions++;}}
   if(unsafeActions>0)throw new IllegalArgumentException("허용되지 않은 액션 또는 대상 제안 "+unsafeActions+"건");
   for(var row:content){for(String field:List.of("id","name","goal","preconditions","expectedEffect","risk","consistency","rollback"))if(!row.path(field).isTextual()||row.path(field).asText().isBlank()||row.path(field).asText().length()>2000)throw new IllegalArgumentException("전략 설명 필드 누락 또는 길이 초과: "+field);var strategy=store.json.readerFor(TwinEngine.Strategy.class).with(com.fasterxml.jackson.databind.DeserializationFeature.FAIL_ON_UNKNOWN_PROPERTIES).readValue(row);TwinEngine.Strategy st=(TwinEngine.Strategy)strategy;TwinEngine.validate(st,snapshot);if(!st.id().matches("[A-Za-z0-9_-]{1,40}")||!ids.add(st.id()))throw new IllegalArgumentException("전략 ID 오류");parsed.add(st);}
   strategies=List.copyOf(parsed);source="HERMES_AGENT";model=Objects.toString(response.get("model"));actual=true;reason="Hermes 제안 → 로컬 액션 스키마·화이트리스트 검증 통과";
  }catch(Exception e){source="RULE_FALLBACK";rejected=1;reason="Hermes 응답 미채택: "+e.getMessage();}
  var out=new LinkedHashMap<String,Object>();out.put("strategies",strategies);out.put("source",source);out.put("model",model);out.put("actualModelCall",actual);out.put("modelCallAttempted",attempted);out.put("modelResponded",modelResponded);out.put("reason",reason);out.put("rejectedResponses",rejected);out.put("proposedActions",proposedActions);out.put("unsafeActions",unsafeActions);out.put("latencyMs",(System.nanoTime()-start)/1_000_000);return out;
 }
}
