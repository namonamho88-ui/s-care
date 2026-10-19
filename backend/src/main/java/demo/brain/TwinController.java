package demo.brain;

import java.util.*;
import org.springframework.web.bind.annotation.*;
import org.springframework.http.*;

@RestController
@RequestMapping("/api/twin")
public class TwinController {
 private final TwinLab lab;private final Store s;
 public TwinController(TwinLab lab,Store s){this.lab=lab;this.s=s;}
 @GetMapping("/catalog") public Object catalog(){return lab.catalog();}
 @GetMapping("/runs") public Object list(){return lab.list();}
 @PostMapping("/runs") public Object create(@RequestBody Map<String,Object> body){Access.admin();Object seed=body.getOrDefault("seed",42);if(!(seed instanceof Number n))throw new IllegalArgumentException("숫자 시드 필요");return lab.create(n.longValue());}
 @GetMapping("/runs/{id}") public Object get(@PathVariable String id){return lab.get(id);}
 @PostMapping("/runs/{id}/{op}") public Object command(@PathVariable String id,@PathVariable String op,@RequestBody Map<String,Object> body){return lab.command(id,op,body);}
 @GetMapping("/runs/{id}/report") public ResponseEntity<byte[]> report(@PathVariable String id){return ResponseEntity.ok().contentType(MediaType.APPLICATION_JSON).header("Content-Disposition","attachment; filename=\""+id+".json\"").body(s.encode(lab.get(id)).getBytes(java.nio.charset.StandardCharsets.UTF_8));}
 @GetMapping("/evaluations") public Object evaluations(){Access.admin();return lab.evaluations();}
 @PostMapping("/evaluations") public Object evaluate(@RequestBody Map<String,String> body){return lab.evaluate(body.getOrDefault("mode","DEMO"),body.getOrDefault("provider","LOCAL"));}
}
