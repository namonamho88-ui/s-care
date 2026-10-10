package demo.brain;
import com.fasterxml.jackson.databind.JsonNode;
import org.springframework.stereotype.Component;
import org.springframework.beans.factory.annotation.Value;
import java.net.URI;
import java.net.http.*;
import java.time.Duration;
import java.util.*;
@Component
public class JevHttpClient {
 public static class Unavailable extends RuntimeException{public Unavailable(String message){super(message);}}
 private final Store s;private final HttpClient http;private final int timeout;
 public JevHttpClient(Store s,@Value("${brain.jev.timeout-seconds}") int timeout){this.s=s;this.timeout=timeout;http=HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(3)).build();}
 public Map<String,Object> request(String observations){
  var q=new LinkedHashMap<String,Object>();
  q.put("type",choice("Classify this fictional IT incident using its observed symptoms.",Map.of("RESOURCE","CPU or memory exhaustion","DATABASE","Database locks or exhausted connection pool","NETWORK","DNS failure or packet loss","APPLICATION","Application exceptions after deployment","SECURITY","Suspicious authentication or access attempts")));
  q.put("severity",choice("Choose urgency based on availability, not the incident type.",Map.of("P1","Customer outage; service unavailable","P2","Degraded performance but service remains available","P3","Minor issue without performance or availability impact")));
  q.put("department",choice("Choose the team responsible for the observed failure.",Map.of("PLATFORM","CPU memory process capacity","DATABASE","Database locks queries connection pool","NETWORK","DNS packet loss gateway","APPLICATION","Code deployment HTTP exceptions","SECURITY","Authentication suspicious access")));
  q.put("recurrence",Map.of("type","noul","instructions","Does the text explicitly report a repeated incident signature in the last seven days?"));
  q.put("evidence",Map.of("type","noul","instructions","Does the text contain concrete technical observations supporting an incident diagnosis, rather than only an unspecified problem?"));
  return Map.of("model","jev-latest","state",observations,"questions",q);
 }
 private Object choice(String instructions,Map<String,String> criteria){return Map.of("type","choice","instructions",instructions,"criteria",criteria);}
 public record ModelReply(JsonNode body,long latencyMs) {}
 public ModelReply query(String provider,String url,String key,Map<String,Object> payload){
  long start=System.nanoTime();HttpResponse<String> response;
  try{var builder=HttpRequest.newBuilder(URI.create(url)).timeout(Duration.ofSeconds(timeout)).header("Content-Type","application/json");if(!key.isBlank())builder.header("Authorization","Bearer "+key);response=http.send(builder.POST(HttpRequest.BodyPublishers.ofString(s.encode(payload))).build(),HttpResponse.BodyHandlers.ofString());}
  catch(InterruptedException e){Thread.currentThread().interrupt();throw new Unavailable(provider+" interrupted");}catch(Exception e){throw new Unavailable(provider+" connection/timeout failure");}
  if(response.statusCode()!=200)throw new Unavailable(provider+" HTTP "+response.statusCode());
  try{JsonNode body=s.json.readTree(response.body());if(body==null||!body.isObject())throw new IllegalArgumentException();return new ModelReply(body,(System.nanoTime()-start)/1_000_000);}catch(Exception e){throw new IllegalArgumentException(provider+" returned invalid JSON");}
 }
 public JevDecision call(String provider,String url,String key,String observations){
  var reply=query(provider,url,key,request(observations));
  try{JsonNode root=reply.body(),a=root.path("answers");String type=readChoice(a,"type"),severity=readChoice(a,"severity"),department=readChoice(a,"department");double confidence=Math.min(conf(a,"type"),Math.min(conf(a,"severity"),conf(a,"department"))),recurrence=prob(a,"recurrence"),evidence=prob(a,"evidence");
   @SuppressWarnings("unchecked") Map<String,Object> answers=(Map<String,Object>)s.decode(a.toString());
   JevDecision result=new JevDecision(type,severity,List.of("P1","P2","P3").indexOf(severity)+1,department,recurrence>=0.5,confidence,evidence,provider,root.path("model").asText("unknown"),reply.latencyMs(),false,false,"",confidence<0.65||evidence<0.65,List.of(observations,"Choice/noul probabilities are model evidence; causal explanation is not returned by Jev."),answers);result.validate();return result;
  }catch(Exception e){throw new IllegalArgumentException(provider+" returned an invalid response schema");}
 }
 private String readChoice(JsonNode a,String field){String value=a.path(field).path("choice").asText();if(value.isBlank())throw new IllegalArgumentException();return value;}
 private double conf(JsonNode a,String field){return number(a.path(field).path("confidence"));}
 private double prob(JsonNode a,String field){return number(a.path(field).path("noul"));}
 private double number(JsonNode value){if(!value.isNumber())throw new IllegalArgumentException();double x=value.asDouble();if(!Double.isFinite(x)||x<0||x>1)throw new IllegalArgumentException();return x;}
}
