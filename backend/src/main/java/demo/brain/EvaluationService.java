package demo.brain;
import org.springframework.stereotype.Service;
import jakarta.annotation.PreDestroy;
import java.util.*;
import java.util.concurrent.*;
import java.util.concurrent.atomic.AtomicBoolean;
@Service
public class EvaluationService {
 private final Store s;private final JevRouter router;private final Harness harness;private final ExecutorService worker=Executors.newSingleThreadExecutor();private final AtomicBoolean active=new AtomicBoolean();
 public EvaluationService(Store s,JevRouter router,Harness harness){this.s=s;this.router=router;this.harness=harness;}
 public String start(String mode,String provider){harness.validateMode(mode,provider);if(!active.compareAndSet(false,true))throw new IllegalStateException("평가가 이미 실행 중입니다.");String id=Store.id("EVAL-");s.db.update("INSERT INTO evaluations VALUES (?,?,?,'RUNNING',NULL,?)",id,mode,provider,Store.now());worker.submit(()->{try{Object result=evaluate(mode,provider);s.db.update("UPDATE evaluations SET status='COMPLETED',result_json=? WHERE id=?",s.encode(result),id);s.audit(null,"harness","EVALUATION_COMPLETED",Map.of("id",id));}catch(Exception e){s.db.update("UPDATE evaluations SET status='FAILED',result_json=? WHERE id=?",s.encode(Map.of("error",String.valueOf(e.getMessage()))),id);}finally{active.set(false);}});return id;}
 public Map<String,Object> evaluate(String mode,String provider){List<Object> results=new ArrayList<>();int exact=0,typeCorrect=0,severityCorrect=0,departmentCorrect=0,recurrenceCorrect=0,reviews=0,fallbacks=0;for(var sc:s.db.queryForList("SELECT * FROM scenarios ORDER BY id")){
  try{JevDecision d=router.decide(sc.get("observations").toString(),mode,provider);d.validate();boolean t=d.type().equals(sc.get("expected_type")),v=d.severity().equals(sc.get("expected_severity")),dept=d.department().equals(sc.get("expected_department")),r=d.recurrence()==(Boolean)sc.get("expected_recurrence");if(t)typeCorrect++;if(v)severityCorrect++;if(dept)departmentCorrect++;if(r)recurrenceCorrect++;if(t&&v&&dept&&r)exact++;if(d.needsReview())reviews++;if(d.fallback())fallbacks++;results.add(Map.of("scenarioId",sc.get("id"),"passed",t&&v&&dept&&r,"actual",d,"expected",Map.of("type",sc.get("expected_type"),"severity",sc.get("expected_severity"),"department",sc.get("expected_department"),"recurrence",sc.get("expected_recurrence"))));}catch(Exception e){results.add(Map.of("scenarioId",sc.get("id"),"passed",false,"error",String.valueOf(e.getMessage())));}
 }return Map.ofEntries(Map.entry("total",results.size()),Map.entry("passed",exact),Map.entry("accuracy",exact/(double)results.size()),Map.entry("typeCorrect",typeCorrect),Map.entry("severityCorrect",severityCorrect),Map.entry("departmentCorrect",departmentCorrect),Map.entry("recurrenceCorrect",recurrenceCorrect),Map.entry("reviews",reviews),Map.entry("fallbacks",fallbacks),Map.entry("results",results),Map.entry("note","Synthetic benchmark only; fallback results are not actual AI performance."));}
 @PreDestroy void stop(){worker.shutdownNow();}
}
