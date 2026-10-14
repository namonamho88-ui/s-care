package demo.brain;

import org.springframework.web.bind.annotation.*;
import java.util.Map;

@RestController
@RequestMapping("/api/admin/models/warmup")
public class ModelWarmupController {
 private final ModelWarmup warmup;public ModelWarmupController(ModelWarmup warmup){this.warmup=warmup;}
 @GetMapping public Object status(){return warmup.status();}
 @PostMapping public Object run(@RequestBody Map<String,Object> body){
  if(body.containsKey("performInference")&&!(body.get("performInference") instanceof Boolean))throw new IllegalArgumentException("performInference boolean required");
  return warmup.run(body.getOrDefault("target","JEV_LOCAL").toString(),body.getOrDefault("mode","DEMO").toString(),Boolean.TRUE.equals(body.get("performInference")));
 }
}
