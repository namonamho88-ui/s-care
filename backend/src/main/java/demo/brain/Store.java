package demo.brain;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.http.HttpStatus;
import java.util.*;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.function.Supplier;
@Component
public class Store {
 public final JdbcTemplate db;public final ObjectMapper json;private final TransactionTemplate transaction;
 public Store(JdbcTemplate db,ObjectMapper json,PlatformTransactionManager manager){this.db=db;this.json=json;transaction=new TransactionTemplate(manager);}
 public <T>T tx(Supplier<T> work){return transaction.execute(status->work.get());}
 public void ensureActive(String id){checkLease(false);checkActive(one("SELECT status,deleted_at FROM incidents WHERE id=?",id));}
 private void checkActive(Map<String,Object> row){if("CANCELLED".equals(row.get("status"))||row.get("deleted_at")!=null)throw new java.util.concurrent.CancellationException("관리자가 중단 또는 삭제한 장애입니다.");}
 public <T>T active(String id,Supplier<T> work){return tx(()->{checkLease(true);checkActive(one("SELECT status,deleted_at FROM incidents WHERE id=? FOR UPDATE",id));return work.get();});}
 public void checkLease(boolean lock){var lease=WorkContext.get();if(lease==null)return;var row=one("SELECT token,status,lease_until FROM work_jobs WHERE id=?"+(lock?" FOR UPDATE":""),lease.id());if(!lease.token().equals(row.get("token"))||!"RUNNING".equals(row.get("status"))||row.get("lease_until")==null||((Timestamp)row.get("lease_until")).before(now()))throw new java.util.concurrent.CancellationException("작업 임대가 만료되어 결과 저장을 중단했습니다.");}
 public String encode(Object v){try{return json.writeValueAsString(v);}catch(Exception e){throw new IllegalArgumentException(e);}}
 public Object decode(Object v){if(v==null)return null;try{return json.readValue(v.toString(),Object.class);}catch(Exception e){throw new IllegalArgumentException(e);}}
 public Map<String,Object> one(String sql,Object...args){var rows=db.queryForList(sql,args);if(rows.isEmpty())throw new ResponseStatusException(HttpStatus.NOT_FOUND,"Record not found");return rows.get(0);}
 public Map<String,Object> incident(String id){return one("SELECT i.*,a.name asset_name,s.name system_name,o.name owner_name,o.department FROM incidents i JOIN assets a ON a.id=i.asset_id LEFT JOIN assets s ON s.id=a.system_id JOIN operators o ON o.id=i.owner_id WHERE i.id=?",id);}
 public void event(String id,String stage,String state,String message,Object data){db.update("INSERT INTO events(incident_id,stage,state,message,data_json,created_at) VALUES (?,?,?,?,?,?)",id,stage,state,message,encode(data),now());}
 public void audit(String id,String actor,String action,Object data){if(id!=null&&Set.of("REVIEW_DECISION","APPROVE","REJECT","EDIT","CLOSE","INCIDENT_STOP","NOTIFICATION_ACK").contains(action))db.update("UPDATE incidents SET first_response_at=COALESCE(first_response_at,?) WHERE id=?",now(),id);db.update("INSERT INTO audit(incident_id,actor,action,data_json,created_at) VALUES (?,?,?,?,?)",id,actor,action,encode(data),now());}
 public void transition(String id,String from,String to){if(db.update("UPDATE incidents SET status=?,phase_started_at=CURRENT_TIMESTAMP,version=version+1 WHERE id=? AND status=?",to,id,from)!=1)throw new IllegalStateException("상태가 변경되었습니다. 새로고침 후 다시 시도하세요.");var lease=WorkContext.get();if(lease!=null&&Set.of("NEEDS_REVIEW","WAITING_APPROVAL","RESOLVED").contains(to))db.update("UPDATE work_jobs SET status='COMPLETED' WHERE id=? AND token=?",lease.id(),lease.token());}
 public static Timestamp now(){return Timestamp.from(Instant.now());}
 public static String id(String prefix){return prefix+UUID.randomUUID().toString().substring(0,16);}
}
