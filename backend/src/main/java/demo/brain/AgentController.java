package demo.brain;
import org.springframework.web.bind.annotation.*;
import org.springframework.beans.factory.annotation.Value;
import com.fasterxml.jackson.databind.JsonNode;
import java.util.*;
import java.time.Instant;
@RestController
public class AgentController {
 public static final List<String> AGENTS=List.of("incident","diagnosis","knowledge","impact","recovery","report");
 private final Store s;private final LocalSkillStore skills;private final DiagnosisEngine diagnosis;private final KnowledgeEngine knowledge;private final String base;
 public AgentController(Store s,LocalSkillStore skills,DiagnosisEngine diagnosis,KnowledgeEngine knowledge,@Value("${brain.agent-base-url:${brain.internal-url}}") String base){this.s=s;this.skills=skills;this.diagnosis=diagnosis;this.knowledge=knowledge;this.base=base.replaceAll("/+$","");}
 @GetMapping("/agents/{agent}/.well-known/agent-card.json") public Object card(@PathVariable String agent){check(agent);return Map.ofEntries(Map.entry("protocolVersion","0.3.0"),Map.entry("name",agent+" Agent"),Map.entry("description","Fictional incident specialist with persisted tasks"),Map.entry("url",base+"/a2a/"+agent),Map.entry("version","3.0.0"),Map.entry("preferredTransport","JSONRPC"),Map.entry("capabilities",Map.of("streaming",false,"pushNotifications",false)),Map.entry("defaultInputModes",List.of("application/json")),Map.entry("defaultOutputModes",List.of("application/json")),Map.entry("securitySchemes",Map.of("bearer",Map.of("type","http","scheme","bearer"))),Map.entry("security",List.of(Map.of("bearer",List.of()))),Map.entry("skills",List.of(Map.of("id",agent,"name",agent,"description","Analyze fictional incidents","tags",List.of("incident")))));}
 private void check(String agent){if(!AGENTS.contains(agent))throw new IllegalArgumentException("Unknown agent");}
 @PostMapping("/a2a/{agent}") public Object rpc(@PathVariable String agent,@RequestBody JsonNode request){Object id=request.has("id")?s.decode(request.get("id").toString()):null;
  try{check(agent);if(!"2.0".equals(request.path("jsonrpc").asText())||id==null)return Rpc.error(id,-32600,"Invalid request");String method=request.path("method").asText();var p=request.path("params");
   if(method.equals("tasks/get")||method.equals("tasks/cancel")){var rows=s.db.queryForList("SELECT * FROM agent_tasks WHERE id=? AND agent=?",p.path("id").asText(),agent);if(rows.isEmpty())return Rpc.error(id,-32001,"Task not found");if(method.equals("tasks/cancel"))return Rpc.error(id,-32002,"Terminal synchronous task cannot be canceled");return Rpc.result(id,s.decode(rows.get(0).get("result_json")));}
   if(!method.equals("message/send"))return Rpc.error(id,-32601,"Method not found");
   var m=p.path("message");if(!m.path("kind").asText().equals("message")||!m.path("role").asText().equals("user")||m.path("messageId").asText().isBlank()||!m.path("parts").isArray()||!m.path("parts").path(0).path("kind").asText().equals("data"))return Rpc.error(id,-32602,"Message with incidentId DataPart required");
   String incident=m.path("parts").path(0).path("data").path("incidentId").asText(),messageId=m.path("messageId").asText();if(messageId.length()>100)return Rpc.error(id,-32602,"messageId exceeds 100 characters");
   var i=s.incident(incident);String taskId=Store.id("TASK-");
   synchronized(this){
    var old=s.db.queryForList("SELECT * FROM agent_tasks WHERE agent=? AND message_id=?",agent,messageId);if(!old.isEmpty()){if(!old.get(0).get("incident_id").equals(incident))return Rpc.error(id,-32602,"messageId reused with different incident");return Rpc.result(id,s.decode(old.get(0).get("result_json")));}
    Object working=task(taskId,incident,"working",null);s.db.update("INSERT INTO agent_tasks VALUES (?,?,?,?,?,?,?,?,?)",taskId,agent,incident,messageId,"working",request.toString(),s.encode(working),Store.now(),Store.now());s.event(incident,"AGENT_"+agent.toUpperCase(Locale.ROOT),"RUNNING",agent+" Agent 작업 시작",Map.of("taskId",taskId));
   }
   Object result;try{Object data=work(agent,i);result=task(taskId,incident,"completed",data);s.audit(incident,agent,"AGENT_RESULT",data);}catch(Exception e){result=task(taskId,incident,"failed",Map.of("error",String.valueOf(e.getMessage())));s.audit(incident,agent,"AGENT_FAILED",Map.of("error",String.valueOf(e.getMessage())));}
   String state=s.json.valueToTree(result).path("status").path("state").asText();s.db.update("UPDATE agent_tasks SET status=?,result_json=?,updated_at=? WHERE id=?",state,s.encode(result),Store.now(),taskId);s.event(incident,"AGENT_"+agent.toUpperCase(Locale.ROOT),state.toUpperCase(Locale.ROOT),agent+" Agent 작업 "+state,Map.of("taskId",taskId));return Rpc.result(id,result);
  }catch(Exception e){return Rpc.error(id,-32602,String.valueOf(e.getMessage()));}
 }
 private Object task(String id,String context,String state,Object data){Map<String,Object> t=new LinkedHashMap<>();t.put("kind","task");t.put("id",id);t.put("contextId",context);t.put("status",Map.of("state",state,"timestamp",Instant.now().toString()));if(data!=null)t.put("artifacts",List.of(Map.of("artifactId",id+"-result","parts",List.of(Map.of("kind","data","data",data)))));return t;}
 private Object work(String agent,Map<String,Object> i){String type=i.get("type").toString();return switch(agent){
  case "incident"->Map.of("incidentId",i.get("id"),"plan",AGENTS,"scope","FICTIONAL_ONLY");
  case "diagnosis"->{var result=diagnosis.assess(i);result.put("similarIncidents",s.db.queryForList("SELECT id,title,notes FROM incidents WHERE type=? AND status='CLOSED' AND id<>? ORDER BY created_at DESC LIMIT 3",type,i.get("id")));yield result;}
  case "knowledge"->knowledge.search(i);
  case "impact"->{if(i.get("impact_json")==null)throw new IllegalStateException("Ontology analysis required");yield s.decode(i.get("impact_json"));}
  case "recovery"->{if(!i.get("status").equals("RECOVERING"))throw new IllegalStateException("Approval required");var approved=skills.search(type);yield Map.of("guideSource","APPROVED_SKILLS","approvedSkills",approved.get("skills"),"manuals",approved.get("manuals"),"tools",List.of("apply_simulated_recovery","verify_simulated_recovery"),"realChanges",false);}
  case "report"->Map.of("title",i.get("title"),"summary","가상 장애의 판단·영향 분석·승인·복구 검증을 완료했습니다.","decision",s.decode(i.get("decision_json")),"impact",s.decode(i.get("impact_json")),"verification",i.get("notes"),"fictional",true,"agentResults",s.db.queryForList("SELECT agent,status,result_json FROM agent_tasks WHERE incident_id=? AND agent<>'report' ORDER BY created_at",i.get("id")),"approvals",s.db.queryForList("SELECT * FROM approvals WHERE incident_id=?",i.get("id")));
  default->throw new IllegalArgumentException("Unknown agent");};}
}
