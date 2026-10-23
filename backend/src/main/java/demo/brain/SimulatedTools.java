package demo.brain;
import org.springframework.stereotype.Service;
import java.util.*;
@Service
public class SimulatedTools {
 private final Store s;
 private final RecoveryPlans plans;
 public SimulatedTools(Store s){this.s=s;this.plans=new RecoveryPlans(s);}
 private void approval(String id){if(!s.incident(id).get("status").equals("RECOVERING")||s.db.queryForObject("SELECT COUNT(*) FROM approvals WHERE incident_id=? AND approved=TRUE",Integer.class,id)!=1)throw new IllegalStateException("Recovery requires an approved RECOVERING incident");}
 @SuppressWarnings("unchecked")
 public Object apply(String id){return s.active(id,()->{
  approval(id);var row=s.one("SELECT * FROM simulated_metrics WHERE incident_id=?",id);
  if(Boolean.TRUE.equals(row.get("applied"))){var saved=s.json.valueToTree(s.decode(row.get("current_json")));return saved.has("execution")?s.decode(saved.path("execution").toString()):Map.of("applied",true,"provider","SIMULATED_METRICS","realChanges",false,"reused",true);}
  var plan=plans.latest(id);if(plan==null)plan=plans.prepare(id,null);
  var execution=RecoverySimulation.execute(plan);
  var after=new LinkedHashMap<String,Object>((Map<String,Object>)execution.get("after"));after.put("execution",execution);
  s.db.update("UPDATE simulated_metrics SET before_json=?,current_json=?,applied=TRUE WHERE incident_id=?",s.encode(execution.get("before")),s.encode(after),id);
  s.audit(id,"mcp","SIMULATED_RECOVERY",execution);
  for(var step:(List<Map<String,Object>>)execution.get("steps"))s.event(id,"RECOVERY_ACTION",Boolean.TRUE.equals(step.get("passed"))?"COMPLETED":"FAILED","가상 조치 · "+step.get("label"),step);
  return execution;
 });}
 @SuppressWarnings("unchecked")
 public Object verify(String id){var verification=s.active(id,()->{
  approval(id);var row=s.one("SELECT * FROM simulated_metrics WHERE incident_id=?",id);
  var current=(Map<String,Object>)s.decode(row.get("current_json"));var execution=(Map<String,Object>)current.get("execution");Map<String,Object> result;
  if(execution!=null){
   var plan=(Map<String,Object>)execution.get("plan");var after=new LinkedHashMap<>(current);after.remove("execution");
   var checks=RecoverySimulation.checks(after,Boolean.TRUE.equals(plan.get("batch")));
   boolean passed=Boolean.TRUE.equals(row.get("applied"))&&checks.stream().allMatch(c->Boolean.TRUE.equals(c.get("passed")))&&((List<Map<String,Object>>)execution.get("steps")).stream().allMatch(c->Boolean.TRUE.equals(c.get("passed")));
   result=new LinkedHashMap<>(execution);result.put("after",after);result.put("checks",checks);result.put("passed",passed);result.put("applied",row.get("applied"));
  }else{
   var metrics=s.json.valueToTree(current);boolean passed=Boolean.TRUE.equals(row.get("applied"))&&metrics.path("errorRate").asDouble(100)<0.1&&metrics.path("latencyMs").asDouble(10000)<500&&metrics.path("healthyDependencies").asBoolean();
   result=new LinkedHashMap<>(Map.of("passed",passed,"provider","SIMULATED_METRICS","before",s.decode(row.get("before_json")),"after",current,"realChanges",false,"legacy",true));
  }
  s.audit(id,"mcp","RECOVERY_VERIFICATION",result);s.event(id,"RECOVERY_CHECKS",Boolean.TRUE.equals(result.get("passed"))?"COMPLETED":"FAILED","가상 조치 후 항목별 검증",result);
  return result;
 });if(!Boolean.TRUE.equals(verification.get("passed")))throw new IllegalStateException("Recovery verification failed; incident cannot be resolved");return verification;}
}
