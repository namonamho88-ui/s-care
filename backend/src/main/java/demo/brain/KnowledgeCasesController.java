package demo.brain;
import org.springframework.web.bind.annotation.*;
import java.util.Map;
@RestController @RequestMapping("/api")
public class KnowledgeCasesController {
 private final KnowledgeCases cases;private final Store s;public KnowledgeCasesController(KnowledgeCases cases,Store s){this.cases=cases;this.s=s;}
 @PostMapping("/skills") public Object create(@RequestBody Map<String,Object> b){return cases.create(b);}
 @PostMapping("/skills/{id}/submit") public Object submit(@PathVariable String id,@RequestBody Map<String,Object> b){return cases.submit(id,b);}
 @GetMapping("/assets/{id}/context") public Object context(@PathVariable String id){return cases.assetContext(id);}
 @GetMapping("/incidents/{id}/knowledge") public Object recommendations(@PathVariable String id){var incident=s.incident(id);if(incident.get("deleted_at")!=null&&!Access.current().admin())throw Access.denied();return cases.search(incident);}
}
