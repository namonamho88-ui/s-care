package demo.brain;
import org.springframework.stereotype.Service;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import jakarta.annotation.PreDestroy;
import java.util.*;
import java.util.concurrent.*;
import java.util.function.Supplier;
@Service
public class Harness {
 private final Store s;private final JevRouter jev;private final Ontology graph;private final RpcClient rpc;private final LocalSkillStore skills;private final EvidencePolicy policy;private final KnowledgeEngine knowledge;private final long delay;
 private final ExecutorService workers=Executors.newFixedThreadPool(4);
 public Harness(Store s,JevRouter jev,Ontology graph,RpcClient rpc,LocalSkillStore skills,EvidencePolicy policy,KnowledgeEngine knowledge,@Value("${brain.step-ms}") long delay){this.s=s;this.jev=jev;this.graph=graph;this.rpc=rpc;this.skills=skills;this.policy=policy;this.knowledge=knowledge;this.delay=delay;}
 @EventListener(ApplicationReadyEvent.class) public void recoverStartup(){for(var row:s.db.queryForList("SELECT id FROM incidents WHERE status IN ('REGISTERED','ANALYZING','RECOVERING')"))fail(row.get("id").toString(),"Application restarted; retry required");s.db.update("UPDATE evaluations SET status='FAILED' WHERE status='RUNNING'");try{graph.sync();}catch(Exception e){s.audit(null,"system","GRAPH_UNAVAILABLE",Map.of("reason",e.getMessage()));}}
 public synchronized String create(String scenarioId,String mode,String provider,String title,String asset,String observations,String owner){
  validateMode(mode,provider);if(s.db.queryForObject("SELECT COUNT(*) FROM incidents WHERE status IN ('REGISTERED','ANALYZING','NEEDS_REVIEW','WAITING_APPROVAL','RECOVERING')",Integer.class)>=4)throw new IllegalStateException("활성 장애는 최대 4개입니다. 기존 장애를 먼저 처리하세요.");
  if(scenarioId!=null){var sc=s.one("SELECT * FROM scenarios WHERE id=?",scenarioId);title=sc.get("title").toString();asset=sc.get("asset_id").toString();observations=sc.get("observations").toString();}
  text(title,200,"제목");text(observations,4000,"관측 내용");s.one("SELECT id FROM assets WHERE id=? AND kind<>'SYSTEM'",asset);s.one("SELECT id FROM operators WHERE id=?",owner);
  String id=Store.id("INC-");final String t=title,a=asset,o=observations;
  s.tx(()->{s.db.update("INSERT INTO incidents(id,title,asset_id,scenario_id,owner_id,type,severity,status,mode,provider,observations,created_at) VALUES (?,?,?,?,?,'PENDING','P2','REGISTERED',?,?,?,?)",id,t,a,scenarioId,owner,mode,provider,o,Store.now());String metrics=s.encode(Map.of("errorRate",12.5,"latencyMs",3200,"healthyDependencies",false));s.db.update("INSERT INTO simulated_metrics VALUES (?,?,?,FALSE)",id,metrics,metrics);s.event(id,"INCIDENT","COMPLETED","가상 장애 접수 및 DB 저장",Map.of("mode",mode,"requestedProvider",provider));s.audit(id,"admin","CREATE",Map.of("mode",mode,"requestedProvider",provider));return null;});run(id,()->analyze(id));return id;
 }
 public void validateMode(String mode,String provider){if(!List.of("DEMO","REAL").contains(mode)||!List.of("LOCAL","TYPESAFE","MOCK").contains(provider)||mode.equals("REAL")&&provider.equals("MOCK"))throw new IllegalArgumentException("Invalid mode/provider");if(mode.equals("REAL")&&provider.equals("TYPESAFE")&&!jev.cloudConfigured())throw new IllegalStateException("TypeSafe API 키가 설정되지 않았습니다.");}
 public static void text(String value,int max,String label){if(value==null||value.isBlank()||value.length()>max)throw new IllegalArgumentException(label+"을 1~"+max+"자로 입력하세요.");}
 private void run(String id,Runnable task){workers.submit(()->{try{task.run();}catch(Exception e){fail(id,String.valueOf(e.getMessage()));}});}
 private Object step(String id,String stage,String title,Supplier<Object> task){s.event(id,stage,"RUNNING",title,Map.of());for(int attempt=1;attempt<=2;attempt++)try{if(delay>0)Thread.sleep(delay);Object data=task.get();s.event(id,stage,"COMPLETED",title+" 완료",data);return data;}catch(Exception e){s.audit(id,"harness","STEP_ATTEMPT_FAILED",Map.of("stage",stage,"attempt",attempt,"reason",String.valueOf(e.getMessage())));if(attempt==2)throw new IllegalStateException(stage+": "+e.getMessage());}throw new IllegalStateException();}
 private void analyze(String id){s.transition(id,"REGISTERED","ANALYZING");var i=s.incident(id);s.event(id,"JEV","RUNNING","Jev 판단 요청",Map.of("provider",i.get("provider")));JevDecision d;
  try{d=jev.decide(i.get("observations").toString(),i.get("mode").toString(),i.get("provider").toString());}
  catch(IllegalArgumentException invalid){s.tx(()->{s.transition(id,"ANALYZING","NEEDS_REVIEW");s.event(id,"JEV","NEEDS_REVIEW",invalid.getMessage(),Map.of("schemaValid",false));s.audit(id,"harness","DECISION_REVIEW_REQUIRED",Map.of("reason",invalid.getMessage()));return null;});return;}
  d.validate();s.db.update("UPDATE incidents SET decision_json=?,type=?,severity=?,owner_id=(SELECT id FROM operators WHERE department=? ORDER BY id LIMIT 1) WHERE id=?",s.encode(d),d.type(),d.severity(),d.department(),id);s.event(id,"JEV","COMPLETED",d.fallback()?"로컬 연결 실패 · 시뮬레이션 결과로 전환":d.simulated()?"Mock 시뮬레이션 판단 완료":"실제 Jev 모델 판단 완료",d);s.audit(id,"jev","DECISION",d);
  if(d.needsReview()){s.transition(id,"ANALYZING","NEEDS_REVIEW");s.event(id,"REVIEW","WAITING","판단 신뢰도 또는 근거 부족 · 담당자 확인 필요",Map.of("confidence",d.confidence(),"evidenceScore",d.evidenceScore()));return;}continueAnalysis(id);
 }
 private void continueAnalysis(String id){var i=s.incident(id);Object impact=step(id,"ONTOLOGY","Ontology 영향 분석",()->graph.impact(i.get("asset_id").toString()));s.db.update("UPDATE incidents SET impact_json=? WHERE id=?",s.encode(impact),id);for(String agent:List.of("incident","diagnosis","impact"))agent(id,agent);step(id,"HERMES","Hermes Adapter · 승인 Skill 검색",()->agent(id,"knowledge"));
  var assessment=s.json.valueToTree(step(id,"HARNESS","Harness 근거 교차 검증",()->{
   var decision=decision(id);var approved=(List<?>)skills.search(decision.type()).get("skills");
   var task=s.one("SELECT result_json FROM agent_tasks WHERE incident_id=? AND agent='diagnosis' AND status='completed' ORDER BY created_at DESC LIMIT 1",id);
   var diagnosis=s.json.valueToTree(s.decode(task.get("result_json"))).path("artifacts").path(0).path("parts").path(0).path("data");
   var reviews=s.db.queryForList("SELECT data_json FROM audit WHERE incident_id=? AND action='REVIEW_DECISION' ORDER BY id DESC LIMIT 1",id);
   boolean reviewed=!reviews.isEmpty() && diagnosisFingerprint(diagnosis).equals(s.json.valueToTree(s.decode(reviews.get(0).get("data_json"))).path("reviewedDiagnosis").asText());
   var result=policy.check(decision,diagnosis,s.json.valueToTree(impact),i.get("asset_id").toString(),approved.size(),reviewed);
   s.audit(id,"harness",Boolean.TRUE.equals(result.get("passed"))?"POLICY_VALIDATED":"POLICY_REVIEW_REQUIRED",result);return result;
  }));
  if(assessment.path("blocked").asBoolean())throw new IllegalStateException("Harness blocked: "+assessment.path("blockReasons"));
  if(assessment.path("needsReview").asBoolean()){s.transition(id,"ANALYZING","NEEDS_REVIEW");s.event(id,"REVIEW","WAITING","분류·원인 후보 교차 검증: 담당자 확인 필요",s.decode(assessment.toString()));return;}
  s.transition(id,"ANALYZING","WAITING_APPROVAL");s.event(id,"APPROVAL","WAITING","가상 복구 대응 승인 대기",Map.of("actor","admin"));
 }
 private Object agent(String id,String name){var i=s.incident(id);Object result=rpc.agent(name,id,((Number)i.get("version")).longValue());if(!s.json.valueToTree(result).path("status").path("state").asText().equals("completed"))throw new IllegalStateException(name+" Agent failed");return result;}
 public JevDecision decision(String id){try{return s.json.readValue(s.incident(id).get("decision_json").toString(),JevDecision.class);}catch(Exception e){throw new IllegalStateException("Decision is missing");}}
 public synchronized void review(String id,String type,String severity,String department,String reason){text(reason,1000,"확인 사유");if(!JevDecision.TYPES.contains(type)||!List.of("P1","P2","P3").contains(severity)||!JevDecision.DEPARTMENTS.contains(department))throw new IllegalArgumentException("Invalid review classification");var i=s.incident(id);JevDecision d=i.get("decision_json")==null?new JevDecision(type,severity,Integer.parseInt(severity.substring(1)),department,false,0,0,"OPERATOR","manual-review",0,false,false,"",false,List.of(i.get("observations").toString(),reason),Map.of()):decision(id).reviewed(type,severity,department,reason);
  s.tx(()->{s.transition(id,"NEEDS_REVIEW","ANALYZING");s.db.update("UPDATE incidents SET decision_json=?,type=?,severity=?,owner_id=(SELECT id FROM operators WHERE department=? ORDER BY id LIMIT 1) WHERE id=?",s.encode(d),type,severity,department,id);s.audit(id,"admin","REVIEW_DECISION",Map.of("reason",reason,"decision",d,"reviewedDiagnosis",reviewedDiagnosis(id)));s.event(id,"REVIEW","COMPLETED","담당자 판단 확인 완료",d);return null;});run(id,()->continueAnalysis(id));
 }
 private String diagnosisFingerprint(com.fasterxml.jackson.databind.JsonNode d){return d.path("causeCode").asText()+"|"+d.path("relatedType").asText()+"|"+d.path("schemaValid").asBoolean();}
 private String reviewedDiagnosis(String id){var rows=s.db.queryForList("SELECT result_json FROM agent_tasks WHERE incident_id=? AND agent='diagnosis' AND status='completed' ORDER BY created_at DESC LIMIT 1",id);if(rows.isEmpty())return "";var data=s.json.valueToTree(s.decode(rows.get(0).get("result_json"))).path("artifacts").path(0).path("parts").path(0).path("data");return diagnosisFingerprint(data);}
 public synchronized void approve(String id,boolean approved,String reason){text(reason,1000,"승인/거부 사유");s.tx(()->{s.transition(id,"WAITING_APPROVAL",approved?"RECOVERING":"REJECTED");s.db.update("INSERT INTO approvals VALUES (?,?,?,?,?)",id,approved,"admin",reason,Store.now());s.audit(id,"admin",approved?"APPROVE":"REJECT",Map.of("reason",reason));s.event(id,"APPROVAL",approved?"COMPLETED":"REJECTED",reason,Map.of());return null;});if(approved)run(id,()->recover(id));}
 private void recover(String id){step(id,"RECOVERY","Recovery Agent 대응 가이드",()->agent(id,"recovery"));step(id,"MCP_ACTION","MCP 가상 복구 조치",()->rpc.tool("apply_simulated_recovery",id));Object proof=step(id,"VERIFY","가상 복구 지표 검증",()->rpc.tool("verify_simulated_recovery",id));s.db.update("UPDATE incidents SET notes=?,prevention=? WHERE id=?",s.encode(proof),"반복 장애 알림 기준 및 주간 가상 부하 테스트 강화",id);Object report=step(id,"REPORT","Report Agent 보고서 생성",()->agent(id,"report"));var draft=(Map<String,Object>)step(id,"SKILL_DRAFT","Hermes Skill 초안 생성",()->knowledge.draft(s.incident(id)));s.tx(()->{s.db.update("UPDATE incidents SET report_json=?,resolved_at=? WHERE id=?",s.encode(report),Store.now(),id);s.transition(id,"RECOVERING","RESOLVED");String skillId=skills.saveDraft(s.incident(id),draft);s.event(id,"HISTORY","COMPLETED","보고서·Skill 초안·장애 이력 저장 완료",Map.of("skillId",skillId,"persisted",true));s.audit(id,"harness","RESOLVED",Map.of("skillDraftId",skillId));return null;});}
 public synchronized void retry(String id){s.tx(()->{boolean approved=s.db.queryForObject("SELECT COUNT(*) FROM approvals WHERE incident_id=? AND approved=TRUE",Integer.class,id)>0;s.transition(id,"FAILED",approved?"RECOVERING":"REGISTERED");s.audit(id,"admin","RETRY",Map.of("resumeRecovery",approved));return null;});if(s.incident(id).get("status").equals("RECOVERING"))run(id,()->recover(id));else run(id,()->analyze(id));}
 private void fail(String id,String error){s.tx(()->{s.db.update("UPDATE incidents SET status='FAILED',version=version+1 WHERE id=?",id);s.event(id,"FAILURE","FAILED",error,Map.of());s.audit(id,"harness","FAILED",Map.of("reason",error));return null;});}
 @PreDestroy void shutdown(){workers.shutdownNow();}
}
