package demo.brain;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.*;

/** Admin initiated only. Reservations survive restarts and are committed before model HTTP requests. */
@Service
public class ModelWarmup {
 private static final List<String> TARGETS=List.of("JEV_LOCAL","JEV_TYPESAFE","HERMES");
 private final Store s;private final LocalJevProvider local;private final TypeSafeJevProvider cloud;private final HttpHermesAdapter hermes;
 private final long cooldownSeconds,leaseSeconds;private final int maxPerHour;private final Map<String,Double> cost;
 public ModelWarmup(Store s,LocalJevProvider local,TypeSafeJevProvider cloud,HttpHermesAdapter hermes,
  @Value("${brain.warmup.cooldown-seconds:60}") long cooldownSeconds,@Value("${brain.warmup.max-per-hour:4}") int maxPerHour,
  @Value("${brain.jev.timeout-seconds:30}") long jevTimeout,@Value("${brain.hermes-timeout-seconds:90}") long hermesTimeout,
  @Value("${brain.warmup.local-estimated-usd:-1}") double localCost,@Value("${brain.warmup.typesafe-estimated-usd:-1}") double cloudCost,@Value("${brain.warmup.hermes-estimated-usd:-1}") double hermesCost){
  this.s=s;this.local=local;this.cloud=cloud;this.hermes=hermes;this.cooldownSeconds=Math.max(30,cooldownSeconds);this.maxPerHour=Math.max(1,Math.min(6,maxPerHour));
  this.leaseSeconds=Math.max(jevTimeout,hermesTimeout)+30;this.cost=Map.of("JEV_LOCAL",localCost,"JEV_TYPESAFE",cloudCost,"HERMES",hermesCost);
 }
 private void authorize(){Access.admin();if("DEMO".equals(Access.current().kind()))throw Access.denied();}
 public Map<String,Object> status(){
  authorize();var targets=new ArrayList<Map<String,Object>>();
  for(String target:TARGETS)targets.add(describe(target,s.one("SELECT * FROM model_warmup_limits WHERE target=?",target)));
  return Map.of("fictional",true,"actualModelCall",false,"modelCallAttempted",false,"targets",targets);
 }
 private Map<String,Object> describe(String target,Map<String,Object> row){
  var result=new LinkedHashMap<String,Object>();Instant now=Instant.now();
  result.put("target",target);result.put("configured",configured(target));result.put("maxInferenceCalls",1);result.put("cooldownSeconds",cooldownSeconds);result.put("maxPerHour",maxPerHour);
  boolean current=((Timestamp)row.get("window_started_at")).toInstant().plusSeconds(3600).isAfter(now);
  result.put("remainingThisHour",current?Math.max(0,maxPerHour-((Number)row.get("calls_in_window")).intValue()):maxPerHour);
  result.put("inFlight",future(row.get("in_flight_until"),now));result.put("retryAfterMs",retryAfter(row,now));result.put("lastResult",s.decode(row.get("last_result_json")));
  addCost(result,target,false);return result;
 }
 private boolean configured(String target){return switch(target){case "JEV_TYPESAFE"->cloud.configured();case "HERMES"->hermes.configured();default->true;};}
 private void addCost(Map<String,Object> result,String target,boolean noCall){
  double estimate=cost.get(target);boolean known=Double.isFinite(estimate)&&estimate>=0;
  result.put("estimatedCostUsd",null);if(noCall)result.put("estimatedCostUsd",0.0);else if(known)result.put("estimatedCostUsd",estimate);result.put("estimateKnown",noCall||known);
  result.put("costEstimateSource",noCall?"NO_MODEL_CALL":known?"OPERATOR_CONFIGURED_ESTIMATE_NOT_BILL":"UNKNOWN_PROVIDER_BILLING");
 }
 private static boolean future(Object value,Instant now){return value instanceof Timestamp t&&t.toInstant().isAfter(now);}
 private long retryAfter(Map<String,Object> row,Instant now){
  long delay=0;for(String key:List.of("next_allowed_at","in_flight_until"))if(row.get(key) instanceof Timestamp time)delay=Math.max(delay,time.getTime()-now.toEpochMilli());
  if(((Number)row.get("calls_in_window")).intValue()>=maxPerHour)delay=Math.max(delay,((Timestamp)row.get("window_started_at")).getTime()+3_600_000-now.toEpochMilli());
  return Math.max(0,delay);
 }
 public Map<String,Object> run(String target,String mode,boolean performInference){
  authorize();if(!TARGETS.contains(target)||!List.of("REAL","DEMO").contains(mode))throw new IllegalArgumentException("워밍업 대상과 AI 모드를 확인하세요.");
  var result=new LinkedHashMap<String,Object>();result.put("target",target);result.put("mode",mode);result.put("fictional",true);result.put("modelCallAttempted",false);result.put("actualModelCall",false);result.put("modelReady",false);result.put("maxInferenceCalls",1);
  boolean noCall=!performInference||mode.equals("DEMO");addCost(result,target,noCall);
  if(noCall){result.put("status","NOT_CALLED");result.put("reason",mode.equals("DEMO")?"DEMO_NO_EXTERNAL_CALL":"EXPLICIT_INFERENCE_REQUIRED");return result;}
  if(!configured(target)){result.put("status","NOT_CALLED");result.put("reason","PROVIDER_NOT_CONFIGURED");return result;}
  String reservation=UUID.randomUUID().toString();
  Map<String,Object> blocked=s.tx(()->{
   var row=s.one("SELECT * FROM model_warmup_limits WHERE target=? FOR UPDATE",target);Instant now=Instant.now();
   if(retryAfter(row,now)>0){var denied=new LinkedHashMap<>(result);denied.put("status","BLOCKED");denied.put("reason",future(row.get("in_flight_until"),now)?"IN_FLIGHT":"COOLDOWN_OR_HOURLY_LIMIT");denied.put("retryAfterMs",retryAfter(row,now));return denied;}
   boolean reset=!((Timestamp)row.get("window_started_at")).toInstant().plusSeconds(3600).isAfter(now);
   s.db.update("UPDATE model_warmup_limits SET window_started_at=?,calls_in_window=?,next_allowed_at=?,in_flight_until=?,in_flight_token=? WHERE target=?",reset?Timestamp.from(now):row.get("window_started_at"),reset?1:((Number)row.get("calls_in_window")).intValue()+1,Timestamp.from(now.plusSeconds(cooldownSeconds)),Timestamp.from(now.plusSeconds(leaseSeconds)),reservation,target);
   s.audit(null,Access.actor(),"MODEL_WARMUP_STARTED",Map.of("target",target,"reservation",reservation,"fictional",true,"maxInferenceCalls",1));return null;
  });
  if(blocked!=null)return blocked;
  long started=System.nanoTime();result.put("startedAt",Instant.now().toString());
  try{
   if(target.equals("HERMES"))result.putAll(hermes.warmup());
   else{
    result.put("modelCallAttempted",true);
    JevDecision decision=(target.equals("JEV_LOCAL")?local:cloud).decide("가상 워밍업: CPU 98%, 메모리 94%, 응답 지연 증가. 실제 장애나 운영 시스템이 아님.");
    result.put("actualModelCall",!decision.simulated());result.put("modelReady",!decision.simulated());result.put("provider",decision.provider());result.put("model",decision.model());result.put("needsReview",decision.needsReview());result.put("status",decision.simulated()?"FAILED":"READY");result.put("reason",decision.simulated()?"SIMULATED_RESPONSE_IS_NOT_MODEL_READINESS":"");
    if(decision.answers().containsKey("_execution"))result.put("execution",decision.answers().get("_execution"));
   }
  }catch(Exception e){result.put("status","FAILED");result.put("reason",e instanceof JevHttpClient.Unavailable||e instanceof IllegalArgumentException?e.getMessage():e.getClass().getSimpleName());}
  result.put("latencyMs",(System.nanoTime()-started)/1_000_000);result.put("endedAt",Instant.now().toString());result.put("retryCount",0);result.put("accuracyMeasured",false);
  s.tx(()->{if(s.db.update("UPDATE model_warmup_limits SET in_flight_until=NULL,in_flight_token=NULL,last_result_json=? WHERE target=? AND in_flight_token=?",s.encode(result),target,reservation)!=1)throw new IllegalStateException("Warmup reservation expired");s.audit(null,Access.actor(),"MODEL_WARMUP_FINISHED",result);return null;});
  return result;
 }
}
