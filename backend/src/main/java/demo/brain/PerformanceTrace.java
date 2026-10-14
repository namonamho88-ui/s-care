package demo.brain;

import org.springframework.stereotype.Component;
import java.sql.Timestamp;
import java.util.*;
import java.util.function.Supplier;

/** Persisted spans. Nested A2A and transport durations overlap; never sum them as end-to-end time. */
@Component
public class PerformanceTrace {
 private final Store s;
 private static final ThreadLocal<Span> CURRENT=new ThreadLocal<>();
 public PerformanceTrace(Store s){this.s=s;}

 public static void recordHttp(String kind,long elapsedMs,Long providerInferenceMs){
  var span=CURRENT.get();if(span==null)return;
  span.httpMs+=Math.max(0,elapsedMs);span.calls++;
  if(providerInferenceMs!=null&&providerInferenceMs>=0){span.inferenceMs+=providerInferenceMs;span.knownInferenceCalls++;}
 }
 public static void retry(){var span=CURRENT.get();if(span!=null)span.retries++;}
 public Span start(String incident,String stage){return new Span(incident,stage);}
 public <T>T measure(String incident,String stage,Supplier<T> work){
  try(var span=start(incident,stage)){
   try{T result=work.get();span.complete(result);return result;}
   catch(RuntimeException e){span.failed(e);throw e;}
  }
 }
 public final class Span implements AutoCloseable {
  private final String id=Store.id("PERF-"),incident,stage;
  private final long start=System.nanoTime();private final Timestamp started=Store.now();
  private final Span previous;
  private long httpMs,inferenceMs;private int calls,knownInferenceCalls,retries;
  private String state="FAILED",category="LOCAL",provider="";private boolean done;
  private Span(String incident,String stage){
   this.incident=incident;this.stage=stage;previous=CURRENT.get();
   var lease=WorkContext.get();
   s.active(incident,()->{s.db.update("INSERT INTO analysis_stage_metrics(id,incident_id,job_id,stage,state,started_at,category,timing_source) VALUES (?,?,?,?,'RUNNING',?,'PENDING','NOT_YET_MEASURED')",id,incident,lease==null?null:lease.id(),stage,started);return null;});
   CURRENT.set(this);
  }
  public void complete(Object result){
   state="COMPLETED";var node=s.json.valueToTree(result);
   if(node.has("artifacts"))node=node.path("artifacts").path(0).path("parts").path(0).path("data");
   provider=node.path("provider").asText("");
   category=node.path("fallback").asBoolean()||provider.contains("FALLBACK")?"MOCK_FALLBACK":
    node.path("simulated").asBoolean()||provider.startsWith("MOCK")?"DEMO_MOCK":
    Set.of("LOCAL_JEV","TYPESAFE_JEV","HERMES_AGENT").contains(provider)?"REAL_AI":"LOCAL";
  }
  public void failed(RuntimeException e){state=e instanceof java.util.concurrent.CancellationException?"CANCELLED":"FAILED";category="UNAVAILABLE";}
  @Override public void close(){
   if(done)return;done=true;CURRENT.set(previous);if(previous==null)CURRENT.remove();
   long duration=(System.nanoTime()-start)/1_000_000;Timestamp ended=Store.now();
   Long model=null;if(calls==0)model=0L;else if(knownInferenceCalls==calls)model=inferenceMs;
   final Long measuredModel=model;
   // Neither HTTP wall time nor HTTP minus inference isolates network/queue/server overhead.
   String source=calls==0?"NO_HTTP_CALLS":model==null?"HTTP_ROUND_TRIP_ONLY":"PROVIDER_REPORTED_INFERENCE";
   var data=new LinkedHashMap<String,Object>();data.put("id",id);data.put("stage",stage);data.put("state",state);data.put("startedAt",started.toInstant().toString());data.put("endedAt",ended.toInstant().toString());data.put("durationMs",duration);data.put("httpElapsedMs",httpMs);data.put("modelInferenceMs",model);data.put("networkWaitMs",null);data.put("retryCount",retries);data.put("httpCalls",calls);data.put("category",category);data.put("provider",provider);data.put("timingSource",source);
   try{s.active(incident,()->{persist(duration,ended,measuredModel,source);s.event(incident,"PERFORMANCE",state,stage+" 실행 시간",data);return null;});}
   catch(java.util.concurrent.CancellationException stopped){
    // Only close this diagnostic row; never write events/results or revive a fenced incident.
    state="CANCELLED";s.tx(()->{persist(duration,ended,measuredModel,source);return null;});
   }
  }
  private void persist(long duration,Timestamp ended,Long model,String source){s.db.update("UPDATE analysis_stage_metrics SET state=?,ended_at=?,duration_ms=?,http_elapsed_ms=?,model_inference_ms=?,network_wait_ms=NULL,retry_count=?,http_calls=?,category=?,provider=?,timing_source=? WHERE id=?",state,ended,duration,httpMs,model,retries,calls,category,provider,source,id);}
 }
 public Map<String,Object> snapshot(String incident){
  var stages=new ArrayList<Map<String,Object>>();var categories=new TreeSet<String>();
  for(var row:s.db.queryForList("SELECT * FROM analysis_stage_metrics WHERE incident_id=? ORDER BY started_at,id",incident)){
   var item=new LinkedHashMap<String,Object>();
   for(String key:List.of("id","stage","state","category","provider"))item.put(key,row.get(key));
   item.put("startedAt",((Timestamp)row.get("started_at")).toInstant().toString());item.put("endedAt",row.get("ended_at")==null?null:((Timestamp)row.get("ended_at")).toInstant().toString());
   item.put("durationMs",row.get("duration_ms"));item.put("httpElapsedMs",row.get("http_elapsed_ms"));item.put("modelInferenceMs",row.get("model_inference_ms"));item.put("networkWaitMs",row.get("network_wait_ms"));item.put("retryCount",row.get("retry_count"));item.put("httpCalls",row.get("http_calls"));item.put("timingSource",row.get("timing_source"));stages.add(item);categories.add(row.get("category").toString());
  }
  return Map.of("stages",stages,"categories",categories,"timingsAreAdditive",false,"networkTimingAvailable",false);
 }
}
