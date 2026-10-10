package demo.brain;
import org.springframework.web.bind.annotation.*;
import org.springframework.http.ResponseEntity;
import com.fasterxml.jackson.databind.JsonNode;
import java.util.*;
@RestController
public class McpController {
 private final Store s;private final SimulatedTools tools;private final LocalSkillStore skills;
 public McpController(Store s,SimulatedTools tools,LocalSkillStore skills){this.s=s;this.tools=tools;this.skills=skills;}
 @GetMapping("/mcp") public ResponseEntity<?> noStream(){return ResponseEntity.status(405).build();}
 @PostMapping("/mcp") public Object rpc(@RequestBody JsonNode req){Object id=req.has("id")?s.decode(req.get("id").toString()):null;String method=req.path("method").asText();
  if(!req.path("jsonrpc").asText().equals("2.0"))return Rpc.error(id,-32600,"Invalid request");
  if(id==null)return ResponseEntity.accepted().build();
  try{Object result;
   switch(method){
    case "initialize" -> result=Map.of("protocolVersion","2025-03-26","capabilities",Map.of("tools",Map.of("listChanged",false)),"serverInfo",Map.of("name","incident-brain-tools","version","3.0.0"));
    case "ping" -> result=Map.of();
    case "tools/list" -> result=Map.of("tools",List.of(tool("incident_lookup","incidentId",true),tool("skill_search","type",true),tool("apply_simulated_recovery","incidentId",false),tool("verify_simulated_recovery","incidentId",true)));
    case "tools/call" -> {var p=req.path("params");String name=p.path("name").asText();var args=p.path("arguments");try{Object output=switch(name){case "incident_lookup"->s.incident(args.path("incidentId").asText());case "skill_search"->skills.search(args.path("type").asText());case "apply_simulated_recovery"->tools.apply(args.path("incidentId").asText());case "verify_simulated_recovery"->tools.verify(args.path("incidentId").asText());default->throw new IllegalArgumentException("Tool denied by Harness allowlist: "+name);};result=Map.of("content",List.of(Map.of("type","text","text",s.encode(output))),"isError",false);}catch(Exception e){s.audit(null,"mcp","TOOL_DENIED_OR_FAILED",Map.of("tool",name,"reason",String.valueOf(e.getMessage())));result=Map.of("content",List.of(Map.of("type","text","text",String.valueOf(e.getMessage()))),"isError",true);}}
    default -> {return Rpc.error(id,-32601,"Method not found");}
   }return Rpc.result(id,result);
  }catch(Exception e){return Rpc.error(id,-32602,"Invalid parameters");}
 }
 private Object tool(String name,String key,boolean readOnly){return Map.of("name",name,"description","Fictional incident data only. No operating-system commands.","inputSchema",Map.of("type","object","properties",Map.of(key,Map.of("type","string")),"required",List.of(key),"additionalProperties",false),"annotations",Map.of("readOnlyHint",readOnly,"destructiveHint",false,"idempotentHint",true));}
}
