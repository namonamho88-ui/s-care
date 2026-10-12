package demo.brain;

import org.springframework.stereotype.Service;
import java.util.*;

/** Logical removal preserves evidence and references. Row locks serialize worker writes. */
@Service
public class IncidentLifecycle {
 private final Store s;
 public IncidentLifecycle(Store s){this.s=s;}
 public void manage(String id,String action,String reason,String confirmation){
  Access.admin();Harness.text(reason,1000,"처리 사유");
  if(!id.equals(confirmation))throw new IllegalArgumentException("확인란에 장애 번호를 정확히 입력하세요.");
  s.tx(()->{
   var i=s.one("SELECT * FROM incidents WHERE id=? FOR UPDATE",id);
   boolean deleted=i.get("deleted_at")!=null;
   if(action.equals("restore")){
    if(!deleted)throw new IllegalStateException("삭제된 장애만 복원할 수 있습니다.");
    s.db.update("UPDATE incidents SET deleted_at=NULL,version=version+1 WHERE id=?",id);
   }else{
    if(deleted)throw new IllegalStateException("이미 삭제된 장애입니다.");
    boolean terminal=List.of("CLOSED","REJECTED","CANCELLED").contains(i.get("status"));
    if(action.equals("stop")&&terminal)throw new IllegalStateException("이미 종료 또는 중단된 장애입니다.");
    if(!terminal){
     s.db.update("UPDATE incidents SET status='CANCELLED',stop_reason=?,stopped_at=?,version=version+1 WHERE id=?",reason,Store.now(),id);
     for(var task:s.db.queryForList("SELECT id,result_json FROM agent_tasks WHERE incident_id=? AND status IN ('working','submitted')",id)){
      var result=s.json.convertValue(s.decode(task.get("result_json")),java.util.LinkedHashMap.class);
      result.put("status",Map.of("state","canceled","timestamp",java.time.Instant.now().toString()));result.remove("artifacts");
      s.db.update("UPDATE agent_tasks SET status='canceled',result_json=?,updated_at=? WHERE id=?",s.encode(result),Store.now(),task.get("id"));
     }
     s.event(id,"FORCE_STOP","COMPLETED","관리자가 장애 처리를 강제 종료했습니다. 복구 완료가 아닙니다.",Map.of("reason",reason,"previousStatus",i.get("status")));
    }
    if(action.equals("delete"))s.db.update("UPDATE incidents SET deleted_at=?,version=version+1 WHERE id=?",Store.now(),id);
   }
   s.audit(id,Access.actor(),"INCIDENT_"+action.toUpperCase(Locale.ROOT),Map.of("reason",reason,"previousStatus",i.get("status"),"recoverable",true));
   s.event(id,"MANAGEMENT","COMPLETED",action.equals("restore")?"삭제한 장애를 복원했습니다. 중단된 작업은 재개되지 않습니다.":action.equals("delete")?"장애를 목록에서 삭제했습니다. 관리자 복원이 가능합니다.":"강제 종료 사유를 저장했습니다.",Map.of("action",action,"reason",reason));
   return null;
  });
 }
}
