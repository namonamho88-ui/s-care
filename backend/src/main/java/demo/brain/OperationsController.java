package demo.brain;
import org.springframework.web.bind.annotation.*;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.scheduling.annotation.Scheduled;
import java.util.*;
import java.sql.Timestamp;
@RestController
@RequestMapping("/api")
public class OperationsController {
 @org.springframework.beans.factory.annotation.Autowired private KnowledgeCases cases;
 @org.springframework.beans.factory.annotation.Autowired(required=false) private BackgroundActivity activity;
 private final Store s;private final SimilarIncidents similar;private final SkillEditing editing;private final int minutes;
 public OperationsController(Store s,SimilarIncidents similar,SkillEditing editing,@Value("${brain.sla-minutes:15}") int minutes){this.s=s;this.similar=similar;this.editing=editing;this.minutes=Math.max(1,minutes);}
 @GetMapping("/incidents/{id}/similar") public Object similar(@PathVariable String id){var i=s.incident(id);if(i.get("deleted_at")!=null&&!Access.current().admin())throw Access.denied();return Map.of("items",similar.find(i),"note","텍스트·유형·자산 기준 유사도이며 원인 확률이 아닙니다. 최대 최근 종료 1,000건 비교.");}
 @PatchMapping("/skills/{id}") public Object edit(@PathVariable String id,@RequestBody Map<String,Object> body){return "MANUAL_ENTRY".equals(s.one("SELECT source_kind FROM skills WHERE id=?",id).get("source_kind"))?cases.edit(id,body):editing.edit(id,body,false);}
 @PostMapping("/skills/{id}/regenerate") public Object regenerate(@PathVariable String id,@RequestBody Map<String,Object> body){return editing.edit(id,body,true);}
 @GetMapping("/skills/{id}/revisions") public Object revisions(@PathVariable String id){return cases.revisions(id);}
 @PostMapping("/notifications/{id}/ack") public Object acknowledge(@PathVariable String id){Access.admin();s.tx(()->{var n=s.one("SELECT * FROM notifications WHERE id=? FOR UPDATE",id);if(n.get("acknowledged_at")==null){s.db.update("UPDATE notifications SET acknowledged_at=?,acknowledged_by=? WHERE id=?",Store.now(),Access.actor(),id);s.audit(n.get("incident_id").toString(),Access.actor(),"NOTIFICATION_ACK",Map.of("notificationId",id));}return null;});return Map.of("acknowledged",true);}
 @GetMapping("/operations") public Object overview(){Access.admin();var active=s.db.queryForList("SELECT id,title,status,phase_started_at FROM incidents WHERE deleted_at IS NULL AND status NOT IN ('CLOSED','CANCELLED','REJECTED','RESOLVED') ORDER BY phase_started_at");
  for(var i:active){long age=Math.max(0,(System.currentTimeMillis()-((Timestamp)i.get("phase_started_at")).getTime())/60000);i.put("elapsedMinutes",age);i.put("targetMinutes",minutes);i.put("overdue",age>=minutes);}
  var response=s.db.queryForList("SELECT created_at,first_response_at,resolved_at,status FROM incidents WHERE deleted_at IS NULL");double mtta=0,mttr=0;int a=0,r=0;
  for(var i:response){long start=((Timestamp)i.get("created_at")).getTime();if(i.get("first_response_at")!=null){mtta+=(((Timestamp)i.get("first_response_at")).getTime()-start)/60000.0;a++;}if(i.get("resolved_at")!=null&&!"CANCELLED".equals(i.get("status"))){mttr+=(((Timestamp)i.get("resolved_at")).getTime()-start)/60000.0;r++;}}
  return Map.of("stages",active,"mttaMinutes",a==0?0:Math.round(mtta/a*10)/10.0,"mttaSamples",a,"mttrMinutes",r==0?0:Math.round(mttr/r*10)/10.0,"mttrSamples",r,"notifications",s.db.queryForList("SELECT n.* FROM notifications n JOIN incidents i ON i.id=n.incident_id WHERE i.deleted_at IS NULL ORDER BY n.created_at DESC LIMIT 200"),"jobs",s.db.queryForList("SELECT id,incident_id,phase,status,attempts,error,created_at FROM work_jobs ORDER BY created_at DESC LIMIT 100"),"channel","SIMULATED_WEBHOOK","externalDelivery",false);
 }
 @Scheduled(fixedDelay=30000,initialDelay=5000) public void alerts(){
  // SLA time still uses persisted timestamps; overdue alerts catch up on the next active visit.
  if(activity!=null&&activity.idle())return;
  for(var i:s.db.queryForList("SELECT id,status,phase_started_at FROM incidents WHERE deleted_at IS NULL AND status NOT IN ('CLOSED','CANCELLED','REJECTED','RESOLVED')")){
   String id=i.get("id").toString(),state=i.get("status").toString();long age=(System.currentTimeMillis()-((Timestamp)i.get("phase_started_at")).getTime())/60000;
   if(state.equals("WAITING_APPROVAL"))notify(id,"APPROVAL_REQUEST",state+"-"+i.get("phase_started_at"),"대응 승인 요청: "+id);
   if(age>=minutes)notify(id,"SLA_ESCALATION",state+"-"+i.get("phase_started_at"),"단계 대기시간 초과 · 관리자 확인 요청: "+id+" / "+state+" / 기준 "+minutes+"분");
  }
 }
 private void notify(String id,String kind,String key,String message){boolean created=s.tx(()->{var incident=s.one("SELECT deleted_at,status FROM incidents WHERE id=? FOR UPDATE",id);if(incident.get("deleted_at")!=null||List.of("CANCELLED","CLOSED","REJECTED","RESOLVED").contains(incident.get("status")))return false;String dedupe=id+kind+key;if(s.db.queryForObject("SELECT COUNT(*) FROM notifications WHERE dedupe_key=?",Integer.class,dedupe)>0)return false;s.db.update("INSERT INTO notifications(id,incident_id,kind,dedupe_key,message,channel,status,created_at) VALUES (?,?,?,?,?,'SIMULATED_WEBHOOK','QUEUED',?)",Store.id("NTF-"),id,kind,dedupe,message,Store.now());s.audit(id,"sla","SIMULATED_NOTIFICATION",Map.of("kind",kind,"externalDelivery",false));return true;});if(created&&activity!=null)activity.notificationQueued();}
}
