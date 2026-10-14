package demo.brain;
import org.springframework.stereotype.Service;
import java.time.Instant;
import java.util.*;
@Service
public class JevRouter {
 private final MockJevProvider mock;private final LocalJevProvider local;private final TypeSafeJevProvider cloud;
 public JevRouter(MockJevProvider mock,LocalJevProvider local,TypeSafeJevProvider cloud){this.mock=mock;this.local=local;this.cloud=cloud;}
 public JevDecision decide(String observations,String mode,String provider){
  long start=System.nanoTime();Instant startedAt=Instant.now();var attempts=new ArrayList<Map<String,Object>>();
  if(mode.equals("DEMO"))return measured(mock.decide(observations),provider,startedAt,start,attempts);
  if(!mode.equals("REAL"))throw new IllegalArgumentException("Invalid mode");
  if(provider.equals("TYPESAFE"))return measured(cloud.decide(observations),provider,startedAt,start,attempts);
  if(!provider.equals("LOCAL"))throw new IllegalArgumentException("Invalid provider");
  String reason="";for(int i=0;i<2;i++) {
   if(i>0)PerformanceTrace.retry();
   try{return measured(local.decide(observations),provider,startedAt,start,attempts);}
   catch(JevHttpClient.Unavailable e){reason=e.getMessage();attempts.add(e.execution());}
  }
  return measured(mock.decide(observations).asFallback(reason,(System.nanoTime()-start)/1_000_000),provider,startedAt,start,attempts);
 }
 @SuppressWarnings("unchecked")
 private JevDecision measured(JevDecision result,String requested,Instant startedAt,long start,List<Map<String,Object>> attempts){
  Object previous=result.answers().get("_execution");
  var timing=previous instanceof Map<?,?>?new LinkedHashMap<>((Map<String,Object>)previous):new LinkedHashMap<String,Object>();
  if(!result.simulated())attempts.add(timing);
  long elapsed=(System.nanoTime()-start)/1_000_000,httpMs=0,inferenceMs=0;boolean inferenceKnown=!attempts.isEmpty();
  for(var attempt:attempts){httpMs+=number(attempt.get("httpElapsedMs"));if(attempt.get("modelInferenceMs") instanceof Number n)inferenceMs+=n.longValue();else inferenceKnown=false;}
  timing.put("startedAt",startedAt.toString());timing.put("endedAt",Instant.now().toString());timing.put("durationMs",elapsed);timing.put("httpElapsedMs",httpMs);
  timing.put("modelInferenceMs",inferenceKnown?inferenceMs:null);timing.put("networkWaitMs",null);timing.put("requestCount",attempts.size());timing.put("retryCount",Math.max(0,attempts.size()-1));
  timing.put("modelTimingSource",inferenceKnown?"SERVER_TIMING_INFERENCE":"UNAVAILABLE");timing.put("networkTimingSource","UNAVAILABLE_HTTP_INCLUDES_SERVER_WORK");
  timing.put("requestedProvider",requested);timing.put("actualProvider",result.provider());timing.put("modelCallAttempted",!attempts.isEmpty());timing.put("actualModelCall",!result.simulated());
  timing.put("category",result.fallback()?"MOCK_FALLBACK":result.simulated()?"DEMO_MOCK":"REAL_AI");
  return result.withExecution(timing,elapsed);
 }
 private long number(Object value){return value instanceof Number n?n.longValue():0;}
 public boolean cloudConfigured(){return cloud.configured();}
}
