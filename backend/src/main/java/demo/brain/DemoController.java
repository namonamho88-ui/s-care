package demo.brain;
import org.springframework.web.bind.annotation.*;
import java.util.Map;
@RestController
@RequestMapping("/api/demo")
public class DemoController {
 private final DemoAccess demo;public DemoController(DemoAccess demo){this.demo=demo;}
 @PostMapping("/session") public Object issue(){return demo.issue();}
 @GetMapping("/control") public Object status(){return demo.status();}
 @PostMapping("/control") public Object toggle(@RequestBody Map<String,Object> body){if(!(body.get("enabled") instanceof Boolean enabled))throw new IllegalArgumentException("enabled boolean required");return demo.toggle(enabled,java.util.Objects.toString(body.get("actor"),""));}
}
