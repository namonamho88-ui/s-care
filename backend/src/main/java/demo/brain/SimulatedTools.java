package demo.brain;
import org.springframework.stereotype.Service;
import java.util.*;
@Service
public class SimulatedTools {
 private final Store s;public SimulatedTools(Store s){this.s=s;}
 private void approval(String id){if(!s.incident(id).get("status").equals("RECOVERING")||s.db.queryForObject("SELECT COUNT(*) FROM approvals WHERE incident_id=? AND approved=TRUE",Integer.class,id)!=1)throw new IllegalStateException("Recovery requires an approved RECOVERING incident");}
 public Object apply(String id){return s.active(id,()->{approval(id);var normalized=Map.of("errorRate",0.02,"latencyMs",120,"healthyDependencies",true);s.db.update("UPDATE simulated_metrics SET current_json=?,applied=TRUE WHERE incident_id=?",s.encode(normalized),id);s.audit(id,"mcp","SIMULATED_RECOVERY",Map.of("metrics",normalized,"realChanges",false));return Map.of("applied",true,"provider","SIMULATED_METRICS","realChanges",false);});}
 public Object verify(String id){return s.active(id,()->{approval(id);var row=s.one("SELECT * FROM simulated_metrics WHERE incident_id=?",id);var metrics=s.json.valueToTree(s.decode(row.get("current_json")));boolean passed=Boolean.TRUE.equals(row.get("applied"))&&metrics.path("errorRate").asDouble(100)<0.1&&metrics.path("latencyMs").asDouble(10000)<500&&metrics.path("healthyDependencies").asBoolean();var result=Map.of("passed",passed,"provider","SIMULATED_METRICS","before",s.decode(row.get("before_json")),"after",s.decode(row.get("current_json")),"realChanges",false);s.audit(id,"mcp","RECOVERY_VERIFICATION",result);if(!passed)throw new IllegalStateException("Recovery verification failed; incident cannot be resolved");return result;});}
}
