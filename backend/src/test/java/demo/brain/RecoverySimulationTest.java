package demo.brain;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import java.util.*;
import static org.assertj.core.api.Assertions.*;
class RecoverySimulationTest {
 @ParameterizedTest @CsvSource({"FILE,입력 파일 누락","PERMISSION,Permission denied","LOCK,ORA-00060 deadlock detected","CONNECTION,ORA-12541 connection refused","MEMORY,Java heap space","DISK,No space left on device","DUPLICATE,ORA-00001 unique constraint","DATA,금액 불일치","DEPENDENCY,선행 작업 미완료","TIMEOUT,execution timeout","DATA,금액불일치","DATA,S0C7","MEMORY,S80A","DISK,SB37","TIMEOUT,S322"})
 @SuppressWarnings("unchecked")
 void batchCauseSelectsExecutableActionsWithBusinessChecks(String code,String text){
  var p=RecoverySimulation.plan(text,"APPLICATION",true);assertThat(p).containsEntry("profile",code).containsEntry("supported",true);
  var result=RecoverySimulation.execute(p);var after=(Map<String,Object>)result.get("after");
  assertThat(after).containsEntry("jobStatus","END_OK").containsEntry("processedCount",1000).containsEntry("duplicateCount",0);
  assertThat(((Number)after.get("processedAmount")).longValue()).isEqualTo(10000000L);
  assertThat(RecoverySimulation.checks(after,true)).allMatch(c->Boolean.TRUE.equals(c.get("passed")));
  var steps=(List<Map<String,Object>>)result.get("steps");assertThat(steps).hasSize(4);assertThat(steps.get(1).get("before")).isNotEqualTo(steps.get(1).get("after"));
 }
 @Test void messageStatusAndBusinessNameAreNotRootCauseEvidence(){
  for(String status:List.of("ABEND","DELAY_END")){
   var p=RecoverySimulation.plan("문자에서 추출한 관측값 (KST).\n배치명: 해외접수금액 불일치\n알림 상태: "+status,"APPLICATION",true);
   assertThat(p).containsEntry("supported",false).containsEntry("profile","UNKNOWN");assertThatThrownBy(()->RecoverySimulation.execute(p)).isInstanceOf(IllegalStateException.class);
  }
 }
 @Test void independentErrorsAreHeldButLockTimeoutIsOneCause(){assertThat(RecoverySimulation.plan("file not found and permission denied","APPLICATION",true)).containsEntry("profile","AMBIGUOUS").containsEntry("supported",false);assertThat(RecoverySimulation.plan("lock wait timeout","DATABASE",true)).containsEntry("profile","LOCK").containsEntry("supported",true);}
 @Test @SuppressWarnings("unchecked") void missingPrecheckAndCorruptedBusinessStateCannotPass(){
  var plan=RecoverySimulation.plan("ORA-00060","DATABASE",true);var actions=new ArrayList<>((List<Map<String,Object>>)plan.get("actions"));actions.remove(0);plan.put("actions",actions);
  var result=RecoverySimulation.execute(plan);assertThat((List<Map<String,Object>>)result.get("steps")).hasSize(1).allMatch(s->Boolean.FALSE.equals(s.get("passed")));
  assertThat(RecoverySimulation.checks((Map<String,Object>)result.get("after"),true)).anyMatch(c->Boolean.FALSE.equals(c.get("passed")));
  var healthy=(Map<String,Object>)RecoverySimulation.execute(RecoverySimulation.plan("금액 불일치","APPLICATION",true)).get("after");var corrupt=new LinkedHashMap<>(healthy);corrupt.put("processedAmount",1);assertThat(RecoverySimulation.checks(corrupt,true)).anyMatch(c->c.get("label").equals("처리 금액 일치")&&Boolean.FALSE.equals(c.get("passed")));
 }
 @ParameterizedTest @CsvSource({"RESOURCE,memoryUsedPercent","DATABASE,dbConnected","NETWORK,routeAvailable","APPLICATION,releaseHealthy","SECURITY,unauthorizedSessions"}) @SuppressWarnings("unchecked")
 void nonBatchTypesHaveDifferentStateEffects(String type,String key){var result=RecoverySimulation.execute(RecoverySimulation.plan("가상 관측",type,false));var before=(Map<String,Object>)result.get("before");var after=(Map<String,Object>)result.get("after");assertThat(before.get(key)).isNotEqualTo(after.get(key));assertThat(RecoverySimulation.checks(after,false)).allMatch(c->Boolean.TRUE.equals(c.get("passed")));}
}
