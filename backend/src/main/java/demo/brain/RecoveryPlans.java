package demo.brain;
import org.springframework.stereotype.Service;
import java.util.*;

@Service
public class RecoveryPlans {
 private final Store s;
 public RecoveryPlans(Store s){this.s=s;}
 @SuppressWarnings("unchecked")
 public Map<String,Object> latest(String id){
  var rows=s.db.queryForList("SELECT data_json FROM events WHERE incident_id=? AND stage='RECOVERY_PLAN' AND state='COMPLETED' ORDER BY id DESC LIMIT 1",id);
  return rows.isEmpty()?null:(Map<String,Object>)s.decode(rows.get(0).get("data_json"));
 }
 public Map<String,Object> prepare(String id,String evidence){
  var i=s.incident(id);boolean batch="BATCH".equals(s.one("SELECT kind FROM assets WHERE id=?",i.get("asset_id")).get("kind"))||!s.db.queryForList("SELECT incident_id FROM message_intakes WHERE incident_id=? AND source_key LIKE 'BATCH:%'",id).isEmpty();
  String observations=i.get("observations").toString();
  if(evidence!=null&&!evidence.isBlank())observations+="\n추가 오류 근거: "+evidence;
  var plan=RecoverySimulation.plan(observations,i.get("type").toString(),batch);
  plan.put("id",Store.id("PLAN-"));plan.put("createdAt",java.time.Instant.now().toString());
  s.event(id,"RECOVERY_PLAN","COMPLETED","장애 유형별 가상 조치 계획 · "+plan.get("label"),plan);
  return plan;
 }
 public void evidence(String id,String evidence,String reason){
  Access.admin();Harness.text(evidence,1000,"추가 오류 근거");Harness.text(reason,1000,"확인 사유");
  s.active(id,()->{
   if(!"WAITING_APPROVAL".equals(s.incident(id).get("status")))throw new IllegalStateException("대응 승인 대기 중에만 오류 근거를 보완할 수 있습니다.");
   var plan=prepare(id,evidence.replaceAll("[\\r\\n]+"," "));
   s.audit(id,Access.actor(),"RECOVERY_EVIDENCE",Map.of("evidence",evidence,"reason",reason,"planId",plan.get("id")));return null;
  });
 }
 public void requireExecutable(String id){
  var plan=latest(id);if(plan!=null&&!Boolean.TRUE.equals(plan.get("supported")))throw new IllegalStateException("배치 오류 코드·실패 단계 등 추가 오류 근거가 필요합니다. 복합 오류는 담당자 검토가 필요합니다.");
 }
}
