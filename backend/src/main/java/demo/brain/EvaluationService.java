package demo.brain;
import org.springframework.stereotype.Service;
import jakarta.annotation.PreDestroy;
import java.util.*;
import java.util.concurrent.*;
import java.util.concurrent.atomic.AtomicBoolean;
@Service
public class EvaluationService {
 private final Store s;private final JevRouter router;private final Harness harness;private final ExecutorService worker=Executors.newSingleThreadExecutor();private final AtomicBoolean active=new AtomicBoolean();
 @org.springframework.beans.factory.annotation.Autowired(required=false) private BackgroundActivity activity;
 public EvaluationService(Store s,JevRouter router,Harness harness){this.s=s;this.router=router;this.harness=harness;}
 public String start(String mode,String provider){
  harness.validateMode(mode,provider);if(!active.compareAndSet(false,true))throw new IllegalStateException("평가가 이미 실행 중입니다.");
  String id=Store.id("EVAL-");boolean inserted=false;if(activity!=null)activity.jobStarted();
  try{
   s.db.update("INSERT INTO evaluations VALUES (?,?,?,'RUNNING',NULL,?)",id,mode,provider,Store.now());inserted=true;
   worker.submit(()->{try{Object result=evaluate(mode,provider);s.db.update("UPDATE evaluations SET status='COMPLETED',result_json=? WHERE id=?",s.encode(result),id);s.audit(null,"harness","EVALUATION_COMPLETED",Map.of("id",id));}catch(Exception e){s.db.update("UPDATE evaluations SET status='FAILED',result_json=? WHERE id=?",s.encode(Map.of("error",e.getClass().getSimpleName())),id);}finally{active.set(false);if(activity!=null)activity.jobFinished();}});return id;
  }catch(RuntimeException e){
   active.set(false);if(activity!=null)activity.jobFinished();
   if(inserted)try{s.db.update("UPDATE evaluations SET status='FAILED',result_json=? WHERE id=?",s.encode(Map.of("error",e.getClass().getSimpleName())),id);}catch(RuntimeException storeError){e.addSuppressed(storeError);}
   throw e;
  }
 }
 private boolean field(Map<String,Object> expected,String key,Object actual){return expected.get("expected_"+key)==null||expected.get("expected_"+key).equals(actual);}
 private boolean passes(Map<String,Object> expected,JevDecision d){if(Boolean.TRUE.equals(expected.get("expected_review")))return d.needsReview();return !d.needsReview()&&field(expected,"type",d.type())&&field(expected,"severity",d.severity())&&field(expected,"department",d.department())&&field(expected,"recurrence",d.recurrence());}
 public Map<String,Object> evaluate(String mode,String provider){var rows=s.db.queryForList("SELECT * FROM evaluation_cases ORDER BY id");var results=new ArrayList<Object>();var groups=new TreeMap<String,int[]>();int passed=0,baselinePassed=0,actualAi=0,actualAiPassed=0,errors=0,fallbacks=0,reviews=0,typeCorrect=0,severityCorrect=0,departmentCorrect=0,recurrenceCorrect=0;var denominators=new HashMap<String,Integer>();
  for(var sc:rows){var result=new LinkedHashMap<String,Object>();result.put("scenarioId",sc.get("id"));result.put("category",sc.get("category"));var group=groups.computeIfAbsent(sc.get("category").toString(),k->new int[3]);group[0]++;
   var expected=new LinkedHashMap<String,Object>();for(String key:List.of("type","severity","department","recurrence","review","eligible"))expected.put(key,sc.get("expected_"+key));result.put("expected",expected);result.put("rationale",sc.get("rationale"));
   for(String key:List.of("type","severity","department","recurrence"))if(sc.get("expected_"+key)!=null)denominators.merge(key,1,Integer::sum);
   try{String input=sc.get("observations").toString();boolean eligible=true;if(sc.get("raw_message")!=null){var parsed=new SmsParser().parse(sc.get("raw_message").toString());eligible=parsed.eligible();input=parsed.observations();result.put("intake",Map.of("kind",parsed.kind(),"status",parsed.status(),"eligible",eligible));}
    boolean correctIntake=eligible==(Boolean)sc.get("expected_eligible");boolean success,baseSuccess;
    if(!eligible){success=baseSuccess=correctIntake;result.put("modelCalled",false);}
    else{var baseline=new LegacyKeywordBaseline().decide(input);baseSuccess=correctIntake&&passes(sc,baseline);result.put("baselinePassed",baseSuccess);if(baseSuccess){baselinePassed++;group[2]++;}result.put("baseline",baseline);var d=router.decide(input,mode,provider);d.validate();success=correctIntake&&passes(sc,d);result.put("actual",d);result.put("baseline",baseline);result.put("modelCalled",true);if(!d.simulated()&&!d.fallback()){actualAi++;if(success)actualAiPassed++;}if(d.fallback())fallbacks++;if(d.needsReview())reviews++;
     if(sc.get("expected_type")!=null&&field(sc,"type",d.type()))typeCorrect++;if(sc.get("expected_severity")!=null&&field(sc,"severity",d.severity()))severityCorrect++;if(sc.get("expected_department")!=null&&field(sc,"department",d.department()))departmentCorrect++;if(sc.get("expected_recurrence")!=null&&field(sc,"recurrence",d.recurrence()))recurrenceCorrect++;
    }if(success){passed++;group[1]++;}if(baseSuccess&&!eligible){baselinePassed++;group[2]++;}result.put("passed",success);result.put("baselinePassed",baseSuccess);
   }catch(Exception e){errors++;result.put("passed",false);result.put("error",e.getClass().getSimpleName());}results.add(result);
  }
  return Map.ofEntries(Map.entry("datasetVersion",rows.isEmpty()?"unknown":rows.get(0).get("dataset_version")),Map.entry("total",rows.size()),Map.entry("passed",passed),Map.entry("accuracy",passed/(double)Math.max(1,rows.size())),Map.entry("baselinePassed",baselinePassed),Map.entry("actualAiCount",actualAi),Map.entry("actualAiPassed",actualAiPassed),Map.entry("errors",errors),Map.entry("fallbacks",fallbacks),Map.entry("reviews",reviews),Map.entry("typeCorrect",typeCorrect),Map.entry("severityCorrect",severityCorrect),Map.entry("departmentCorrect",departmentCorrect),Map.entry("recurrenceCorrect",recurrenceCorrect),Map.entry("denominators",denominators),Map.entry("groups",groups),Map.entry("results",results),Map.entry("note","가상 한국어 100건: 기술 관측 60·경계 20·문자 변형 20(4개 형식 계열). 전문가 독립 검증 전이며 실운영 성능이 아닙니다. 정답 없는 항목은 채점 제외. 검토 필요·정상 제외를 별도 채점하며 Mock 대체는 실제 AI 점수에 포함하지 않습니다."));
 }
 @PreDestroy void stop(){worker.shutdownNow();}
}
