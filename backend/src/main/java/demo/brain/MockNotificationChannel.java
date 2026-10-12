package demo.brain;
import org.springframework.web.bind.annotation.*;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.beans.factory.annotation.Value;
import java.net.URI;
import java.net.http.*;
import java.time.Duration;
import java.util.*;
/** Calls our authenticated mock receiver only. Never posts to Slack/Teams. */
@RestController
public class MockNotificationChannel {
 private final Store s;private final String base,token;private final HttpClient client=HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(1)).build();
 public MockNotificationChannel(Store s,@Value("${brain.internal-url}") String base,@Value("${brain.admin-token}") String token){this.s=s;this.base=base;this.token=token;}
 @Scheduled(fixedDelay=5000,initialDelay=10000) public void deliver(){
  for(var n:s.db.queryForList("SELECT n.id,n.message FROM notifications n JOIN incidents i ON i.id=n.incident_id WHERE n.status='QUEUED' AND n.attempts<3 AND i.deleted_at IS NULL AND i.status NOT IN ('CANCELLED','CLOSED','REJECTED','RESOLVED') ORDER BY n.created_at LIMIT 5"))try{
   var payload=Map.of("notificationId",n.get("id"),"text","[S-CARE 가상 알림] "+n.get("message"),"fictional",true,"format","SLACK_TEXT_MOCK");
   var req=HttpRequest.newBuilder(URI.create(base+"/api/internal/mock-notifications")).timeout(Duration.ofSeconds(2)).header("Authorization","Bearer "+token).header("Content-Type","application/json").POST(HttpRequest.BodyPublishers.ofString(s.encode(payload))).build();var response=client.send(req,HttpResponse.BodyHandlers.discarding());if(response.statusCode()!=200)throw new IllegalStateException("Mock receiver unavailable");
  }catch(Exception e){s.db.update("UPDATE notifications SET attempts=attempts+1,status=CASE WHEN attempts>=2 THEN 'FAILED' ELSE 'QUEUED' END WHERE id=? AND status='QUEUED'",n.get("id"));}
 }
 @PostMapping("/api/internal/mock-notifications") public Object receive(@RequestBody Map<String,Object> payload){if(!Access.current().kind().equals("BOOTSTRAP"))throw Access.denied();String id=Objects.toString(payload.get("notificationId"),"");if(!Boolean.TRUE.equals(payload.get("fictional"))||!"SLACK_TEXT_MOCK".equals(payload.get("format")))throw new IllegalArgumentException("가상 알림 형식만 허용합니다.");return s.tx(()->{var n=s.one("SELECT * FROM notifications WHERE id=? FOR UPDATE",id);var i=s.incident(n.get("incident_id").toString());if(i.get("deleted_at")!=null||List.of("CANCELLED","CLOSED","REJECTED","RESOLVED").contains(i.get("status")))throw new IllegalStateException("종료된 장애의 알림입니다.");if(!Objects.equals(payload.get("text"),"[S-CARE 가상 알림] "+n.get("message")))throw new IllegalArgumentException("등록된 알림 내용과 다릅니다.");if(s.db.queryForObject("SELECT COUNT(*) FROM notification_deliveries WHERE notification_id=?",Integer.class,id)==0){s.db.update("INSERT INTO notification_deliveries(notification_id,payload_json,received_at) VALUES (?,?,?)",id,s.encode(payload),Store.now());s.db.update("UPDATE notifications SET status='SIMULATED',attempts=attempts+1 WHERE id=?",id);s.audit(n.get("incident_id").toString(),"notification","MOCK_WEBHOOK_RECEIVED",Map.of("notificationId",id,"externalDelivery",false));}return Map.of("received",true,"simulated",true,"externalDelivery",false);});}
}
