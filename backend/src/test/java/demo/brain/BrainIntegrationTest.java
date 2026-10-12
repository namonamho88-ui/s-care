package demo.brain;
import org.junit.jupiter.api.*;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.client.TestRestTemplate;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.*;
import java.util.*;
import static org.assertj.core.api.Assertions.*;
@SpringBootTest(webEnvironment=SpringBootTest.WebEnvironment.DEFINED_PORT,properties={"server.port=18080","spring.datasource.url=${TEST_DB_URL:jdbc:h2:mem:brain_test;MODE=PostgreSQL;DATABASE_TO_LOWER=TRUE;DB_CLOSE_DELAY=-1}","spring.datasource.username=${TEST_DB_USER:sa}","spring.datasource.password=${TEST_DB_PASSWORD:}","brain.neo4j-uri=${TEST_NEO4J_URI:disabled}","brain.graph-required=false","brain.step-ms=0","brain.internal-url=http://localhost:18080","brain.jev.local-url=http://127.0.0.1:19998/v1/systemone"})
@TestMethodOrder(MethodOrderer.OrderAnnotation.class)
@org.springframework.test.context.TestPropertySource(properties="brain.sse-timeout-ms=1200")
class BrainIntegrationTest {
 @Autowired Store s;@Autowired TestRestTemplate http;@Autowired SimulatedTools tools;@Autowired Ontology graph;
 @org.springframework.beans.factory.annotation.Value("${brain.admin-token}") String token;
 HttpHeaders headers(){var h=new HttpHeaders();h.setBearerAuth(token);return h;}
 ResponseEntity<Map> post(String path,Object body){return http.exchange(path,HttpMethod.POST,new HttpEntity<>(body,headers()),Map.class);}
 ResponseEntity<Map> get(String path){return http.exchange(path,HttpMethod.GET,new HttpEntity<>(headers()),Map.class);}
 @Test @Order(1) void exactSeedCountsAndForeignKeyIntegrity(){assertThat(s.db.queryForObject("SELECT COUNT(*) FROM assets WHERE kind='SYSTEM'",Integer.class)).isEqualTo(12);assertThat(s.db.queryForObject("SELECT COUNT(*) FROM assets WHERE kind<>'SYSTEM'",Integer.class)).isEqualTo(40);for(var e:Map.of("operators",15,"incidents",200,"manuals",30,"skills",20,"dependencies",80,"scenarios",50).entrySet())assertThat(s.db.queryForObject("SELECT COUNT(*) FROM "+e.getKey(),Integer.class)).isEqualTo(e.getValue());assertThat(s.db.queryForObject("SELECT COUNT(*) FROM incidents i JOIN scenarios c ON c.id=i.scenario_id WHERE i.asset_id<>c.asset_id OR i.type<>c.expected_type",Integer.class)).isZero();assertThatThrownBy(()->s.db.update("INSERT INTO dependencies VALUES ('missing','CMP-01')")).isInstanceOf(org.springframework.dao.DataIntegrityViolationException.class);}
 @Test @Order(2) void authAndUnsafeToolDenial(){assertThat(http.getForEntity("/api/config",String.class).getStatusCode().value()).isEqualTo(401);var result=post("/mcp",Map.of("jsonrpc","2.0","id",1,"method","tools/call","params",Map.of("name","restart_production_server","arguments",Map.of()))).getBody();assertThat(s.json.valueToTree(result).path("result").path("isError").asBoolean()).isTrue();assertThat(post("/api/simulate",Map.of("mode","OTHER")).getStatusCode().value()).isEqualTo(400);}
 @Test @Order(3) void workflowApprovalReportsSkillAndPersistedHistory()throws Exception{
  int before=s.db.queryForObject("SELECT COUNT(*) FROM incidents",Integer.class);String id=create("DEMO");waitFor(id,"WAITING_APPROVAL");assertThat(s.incident(id).get("resolved_at")).isNull();assertThatThrownBy(()->tools.apply(id)).hasMessageContaining("approved");assertThat(post("/api/incidents/"+id+"/close",Map.of()).getStatusCode().is4xxClientError()).isTrue();assertThat(s.db.queryForObject("SELECT COUNT(*) FROM agent_tasks WHERE incident_id=?",Integer.class,id)).isEqualTo(4);
  var approval=Map.of("approved",true,"reason","가상 영향 범위와 대응 가이드 확인");assertThat(post("/api/incidents/"+id+"/approval",approval).getStatusCode().value()).isEqualTo(200);assertThat(post("/api/incidents/"+id+"/approval",approval).getStatusCode().value()).isEqualTo(409);waitFor(id,"RESOLVED");assertThat(s.db.queryForObject("SELECT COUNT(*) FROM incidents",Integer.class)).isEqualTo(before+1);assertThat(s.db.queryForObject("SELECT COUNT(*) FROM agent_tasks WHERE incident_id=?",Integer.class,id)).isEqualTo(6);assertThat(s.db.queryForObject("SELECT COUNT(*) FROM audit WHERE incident_id=? AND action='RECOVERY_VERIFICATION'",Integer.class,id)).isEqualTo(1);
  var draft=s.one("SELECT * FROM skills WHERE incident_id=?",id);assertThat(draft.get("status")).isEqualTo("DRAFT");assertThat(s.db.queryForObject("SELECT COUNT(*) FROM skills WHERE incident_id=? AND status='APPROVED'",Integer.class,id)).isZero();assertThat(post("/api/skills/"+draft.get("id")+"/review",Map.of("status","APPROVED")).getStatusCode().value()).isEqualTo(200);
  byte[] pdf=http.exchange("/api/incidents/"+id+"/report/pdf",HttpMethod.GET,new HttpEntity<>(headers()),byte[].class).getBody();try(var doc=org.apache.pdfbox.Loader.loadPDF(pdf)){assertThat(new org.apache.pdfbox.text.PDFTextStripper().getText(doc)).contains("장애 보고서","가상",id);}
  byte[] xlsx=http.exchange("/api/incidents/"+id+"/report/xlsx",HttpMethod.GET,new HttpEntity<>(headers()),byte[].class).getBody();try(var book=new org.apache.poi.xssf.usermodel.XSSFWorkbook(new java.io.ByteArrayInputStream(xlsx))){assertThat(book.getNumberOfSheets()).isEqualTo(4);}
  assertThat(post("/api/incidents/"+id+"/close",Map.of()).getStatusCode().value()).isEqualTo(200);assertThat(s.incident(id).get("status")).isEqualTo("CLOSED");
 }
 @Test @Order(4) void localFailureRecordedAsFallbackAndRejectionPreventsRecovery()throws Exception{String id=create("REAL");waitFor(id,"WAITING_APPROVAL");var d=s.json.readTree(s.incident(id).get("decision_json").toString());assertThat(d.path("provider").asText()).isEqualTo("MOCK_FALLBACK");assertThat(d.path("simulated").asBoolean()).isTrue();assertThat(post("/api/incidents/"+id+"/approval",Map.of("approved",false,"reason","시연 거부 테스트")).getStatusCode().value()).isEqualTo(200);assertThat(s.incident(id).get("status")).isEqualTo("REJECTED");assertThat(s.db.queryForObject("SELECT applied FROM simulated_metrics WHERE incident_id=?",Boolean.class,id)).isFalse();}
 @Test @Order(5) void insufficientEvidencePausesUntilHumanReview()throws Exception{var result=post("/api/incidents",Map.of("title","가상 불명확 관측","assetId","CMP-01","observations","Something happened but no technical evidence","mode","DEMO","provider","MOCK"));String id=result.getBody().get("id").toString();waitFor(id,"NEEDS_REVIEW");assertThat(s.db.queryForObject("SELECT COUNT(*) FROM agent_tasks WHERE incident_id=?",Integer.class,id)).isZero();assertThat(post("/api/incidents/"+id+"/review",Map.of("type","RESOURCE","severity","P2","department","PLATFORM","reason","가상 관측 추가 확인: CPU 자원 문제로 판단")).getStatusCode().value()).isEqualTo(200);waitFor(id,"NEEDS_REVIEW");assertThat(post("/api/incidents/"+id+"/review",Map.of("type","RESOURCE","severity","P2","department","PLATFORM","reason","원인 미확정 가설을 확인하고 가상 대응 검증을 승인 요청함")).getStatusCode().value()).isEqualTo(200);waitFor(id,"WAITING_APPROVAL");assertThat(post("/api/incidents/"+id+"/approval",Map.of("approved",false,"reason","검토 경로 테스트 종료")).getStatusCode().value()).isEqualTo(200);}
 @Test @Order(6) void a2aInteroperableShapesAndIdempotentMessage(){var card=http.getForEntity("/agents/diagnosis/.well-known/agent-card.json",Map.class).getBody();assertThat(card).containsEntry("protocolVersion","0.3.0");String id=s.one("SELECT id FROM incidents WHERE status='CLOSED' AND id NOT LIKE 'INC-SEED%' LIMIT 1").get("id").toString();var req=Map.of("jsonrpc","2.0","id",7,"method","message/send","params",Map.of("message",Map.of("kind","message","messageId","test-idempotence","role","user","parts",List.of(Map.of("kind","data","data",Map.of("incidentId",id))))));var first=post("/a2a/diagnosis",req).getBody();var second=post("/a2a/diagnosis",req).getBody();assertThat(first).isEqualTo(second);String taskId=s.json.valueToTree(first).path("result").path("id").asText();var lookup=post("/a2a/diagnosis",Map.of("jsonrpc","2.0","id",8,"method","tasks/get","params",Map.of("id",taskId))).getBody();assertThat(lookup.get("result")).isEqualTo(first.get("result"));assertThat(post("/a2a/diagnosis",Map.of("jsonrpc","2.0","id",9,"method","tasks/cancel","params",Map.of("id",taskId))).getBody()).containsKey("error");}
 @Test @Order(7) void ontologyTraversesReverseDependencies(){var impact=graph.impact("CMP-01");assertThat((Collection<String>)impact.get("affected")).contains("CMP-01","SYS-01");assertThat(((Collection<?>)impact.get("affected")).size()).isGreaterThan(1);}
 @Test @Order(8) void evaluationPersistsActualPerScenarioResults()throws Exception{String id=post("/api/evaluations",Map.of("mode","DEMO","provider","MOCK")).getBody().get("id").toString();long end=System.nanoTime()+5_000_000_000L;while(System.nanoTime()<end){var row=s.one("SELECT * FROM evaluations WHERE id=?",id);if(row.get("status").equals("COMPLETED")){var r=s.json.readTree(row.get("result_json").toString());assertThat(r.path("passed").asInt()).isEqualTo(50);assertThat(r.path("results").size()).isEqualTo(50);return;}Thread.sleep(30);}fail("Evaluation timeout");}
 @Test @Order(9) void sseCanReplayFromLastEventId()throws Exception{String id=s.one("SELECT incident_id FROM events ORDER BY id DESC LIMIT 1").get("incident_id").toString();long cursor=s.db.queryForObject("SELECT MIN(id) FROM events WHERE incident_id=?",Long.class,id);var request=java.net.http.HttpRequest.newBuilder(java.net.URI.create("http://localhost:18080/api/incidents/"+id+"/events")).header("Authorization","Bearer "+token).header("Last-Event-ID",String.valueOf(cursor)).build();var response=java.net.http.HttpClient.newHttpClient().sendAsync(request,java.net.http.HttpResponse.BodyHandlers.ofString()).get(10,java.util.concurrent.TimeUnit.SECONDS);assertThat(response.statusCode()).isEqualTo(200);assertThat(response.body()).startsWith("id:");String first=response.body().lines().filter(line->line.startsWith("id:")).findFirst().orElseThrow();assertThat(Long.parseLong(first.substring(3))).isGreaterThan(cursor);long last=s.db.queryForObject("SELECT MAX(id) FROM events WHERE incident_id=?",Long.class,id);s.event(id,"PORTABILITY","COMPLETED","가상 재접속 테스트",Map.of());var resumed=java.net.http.HttpRequest.newBuilder(request.uri()).header("Authorization","Bearer "+token).header("Last-Event-ID",String.valueOf(last)).build();String body=java.net.http.HttpClient.newHttpClient().sendAsync(resumed,java.net.http.HttpResponse.BodyHandlers.ofString()).get(10,java.util.concurrent.TimeUnit.SECONDS).body();assertThat(body).contains("가상 재접속 테스트").doesNotContain("가상 장애 접수");}
 @Test @Order(10) void skillSyncPagesAllApprovedKnowledgeWithoutPublishingDrafts(@org.junit.jupiter.api.io.TempDir java.nio.file.Path directory)throws Exception{
  var publisher=new HermesSkillPublisher(s,directory.toString(),"filesystem","","");
  var expected=s.db.queryForList("SELECT id FROM skills WHERE status='APPROVED' ORDER BY id",String.class);
  var published=new ArrayList<String>();String cursor="";
  do{
   var page=publisher.sync(cursor,5);
   var results=(List<Map<String,Object>>)page.get("results");assertThat(results).hasSizeLessThanOrEqualTo(5);
   for(var result:results){assertThat(result).containsEntry("status","EXPORTED");published.add(result.get("skillId").toString());}
   String next=page.get("nextCursor").toString();if((Boolean)page.get("hasMore"))assertThat(next).isGreaterThan(cursor);
   cursor=next;
  }while(!cursor.isEmpty());
  assertThat(published).containsExactlyElementsOf(expected);
  for(String draft:s.db.queryForList("SELECT id FROM skills WHERE status<>'APPROVED'",String.class))
   assertThat(java.nio.file.Files.exists(directory.resolve("incident-brain-"+draft.toLowerCase(Locale.ROOT)))).isFalse();
  assertThat(post("/api/hermes/sync?limit=6",Map.of()).getStatusCode().value()).isEqualTo(400);
  assertThatThrownBy(()->publisher.sync("../draft",5)).isInstanceOf(IllegalArgumentException.class);
 }
 @Test @Order(11) void personalAccountInvitationSessionsAndRevocation(){new AccountChecks(s,http,token).invitationAndSessionLifecycle();}
 @Test @Order(12) void userCannotBypassServerRolesOrOwnership()throws Exception{new AccountChecks(s,http,token).rolesAndOwnership();}
 @Test @Order(13) void accountAdminActionsRecordIndividualIdentity()throws Exception{new AccountChecks(s,http,token).adminIdentityAndRecovery();}
 @Test @Order(14) void expiredInvitationsResetAndPersistentLockout(){new AccountChecks(s,http,token).resetsAndLockout();}
 @Test @Order(15) void normalSmsPreviewCannotCreateIncidentOrEvents(){
  int before=s.db.queryForObject("SELECT COUNT(*) FROM incidents",Integer.class),events=s.db.queryForObject("SELECT COUNT(*) FROM events",Integer.class);
  var preview=post("/api/message-intake/preview",Map.of("message",SmsParserTest.NORMAL));assertThat(preview.getStatusCode().value()).isEqualTo(200);assertThat(s.json.valueToTree(preview.getBody()).path("parsed").path("eligible").asBoolean()).isFalse();
  assertThat(post("/api/message-intake/register",Map.of("message",SmsParserTest.NORMAL,"assetId","CMP-01","eligible","true")).getStatusCode().value()).isEqualTo(400);
  assertThat(s.db.queryForObject("SELECT COUNT(*) FROM incidents",Integer.class)).isEqualTo(before);assertThat(s.db.queryForObject("SELECT COUNT(*) FROM events",Integer.class)).isEqualTo(events);
 }
 @Test @Order(16) void smsRegistrationPersistsOnceAndSuggestsOnlyConfirmedAsset()throws Exception{
  var before=post("/api/message-intake/preview",Map.of("message",SmsParserTest.ABEND)).getBody();assertThat(before).containsEntry("suggestedAssetId","");
  int count=s.db.queryForObject("SELECT COUNT(*) FROM incidents",Integer.class);
  var body=Map.of("message",SmsParserTest.ABEND,"assetId","CMP-01","mode","DEMO","provider","MOCK");
  var futures=java.util.stream.IntStream.range(0,4).mapToObj(n->java.util.concurrent.CompletableFuture.supplyAsync(()->post("/api/message-intake/register",body))).toList();
  var replies=new ArrayList<Map>();for(var future:futures){var r=future.get(15,java.util.concurrent.TimeUnit.SECONDS);assertThat(r.getStatusCode().value()).isEqualTo(200);replies.add(r.getBody());}
  assertThat(replies.stream().map(r->r.get("id")).distinct().count()).isEqualTo(1);assertThat(replies.stream().filter(r->Boolean.FALSE.equals(r.get("duplicate"))).count()).isEqualTo(1);
  String id=replies.get(0).get("id").toString();waitFor(id,"NEEDS_REVIEW");
  assertThat(s.db.queryForObject("SELECT COUNT(*) FROM incidents",Integer.class)).isEqualTo(count+1);assertThat(s.one("SELECT * FROM message_intakes WHERE incident_id=?",id)).containsEntry("created_by","bootstrap-admin");
  assertThat(s.db.queryForObject("SELECT COUNT(*) FROM events WHERE incident_id=? AND stage='MESSAGE_INTAKE'",Integer.class,id)).isEqualTo(1);
  assertThat(post("/api/message-intake/preview",Map.of("message",SmsParserTest.ABEND)).getBody()).containsEntry("existingIncidentId",id).containsEntry("suggestedAssetId","CMP-01");
 }
 @Test @Order(17) void userCanRegisterTmsAndNoRawRecipientsReachStoredEvidence()throws Exception{
  var accounts=new AccountChecks(s,http,token);var inv=accounts.invite("fictional.sms","USER","OP-15");String personal=accounts.activate("fictional.sms",inv.get("inviteCode")).get("token").toString();
  assertThat(accounts.post(personal,"/api/message-intake/preview",Map.of("message",SmsParserTest.TMS)).getStatusCode().value()).isEqualTo(200);
  assertThat(accounts.post(null,"/api/message-intake/preview",Map.of("message",SmsParserTest.TMS)).getStatusCode().value()).isEqualTo(401);
  var response=accounts.post(personal,"/api/message-intake/register",Map.of("message",SmsParserTest.TMS,"assetId","CMP-02","mode","DEMO","provider","MOCK","ownerId","OP-01"));assertThat(response.getStatusCode().value()).isEqualTo(200);
  String id=response.getBody().get("id").toString();waitFor(id,"NEEDS_REVIEW");
  assertThat(s.one("SELECT * FROM message_intakes WHERE incident_id=?",id)).containsEntry("created_by",inv.get("id"));
  assertThat(s.incident(id).get("observations").toString()).contains("95.65","0.65%p","[개인]").doesNotContain("가상수신자","가상금융회사");
  assertThat(s.encode(get("/api/incidents/"+id).getBody())).doesNotContain("가상수신자","가상금융회사","[Web발신]");
 }
 @Test @Order(18) void historyPagesReachPastLegacyLimitsAndEnforcePermissions(){
  for(int n=0;n<25;n++)s.db.update("INSERT INTO evaluations(id,mode,provider,status,result_json,created_at) VALUES (?,'DEMO','MOCK',?,'{}',TIMESTAMP '2001-01-01 00:00:00')",String.format("EVAL-PAGE-%02d",n),n==0?"RUNNING":"COMPLETED");
  for(int n=0;n<305;n++)s.audit(null,"fictional-pagination","PAGING_FIXTURE",Map.of("index",n));
  for(String resource:List.of("evaluations","audit")){
   int total=s.db.queryForObject("SELECT COUNT(*) FROM "+resource,Integer.class);var found=new ArrayList<Object>();
   for(int page=1;page<=(int)Math.ceil(total/10.0);page++){
    var response=get("/api/"+resource+"?page="+page);assertThat(response.getStatusCode().value()).isEqualTo(200);var data=response.getBody();
    assertThat(data).containsEntry("total",total).containsEntry("page",page).containsEntry("pageSize",10);
    var items=(List<Map<String,Object>>)data.get("items");assertThat(items).hasSize(Math.min(10,total-found.size()));items.forEach(item->found.add(item.get("id")));
    if(resource.equals("evaluations"))assertThat(data).containsEntry("running",true);
   }
   assertThat(new HashSet<>(found)).hasSize(total);assertThat(get("/api/"+resource+"?page=999999").getBody()).containsEntry("page",(int)Math.ceil(total/10.0));
   assertThat(get("/api/"+resource+"?page=0").getStatusCode().value()).isEqualTo(400);
   assertThat(http.getForEntity("/api/"+resource+"?page=1",String.class).getStatusCode().value()).isEqualTo(401);
  }
  var account=new AccountChecks(s,http,token);String user=account.login("fictional.sms",AccountChecks.PASSWORD);
  for(String resource:List.of("evaluations","audit"))assertThat(account.get(user,"/api/"+resource+"?page=2").getStatusCode().value()).isEqualTo(403);
 }
 String create(String mode){var response=post("/api/simulate",Map.of("scenarioId","SCN-01","mode",mode,"provider","LOCAL"));assertThat(response.getStatusCode().value()).isEqualTo(200);return response.getBody().get("id").toString();}
 void waitFor(String id,String expected)throws Exception{long end=System.nanoTime()+15_000_000_000L;while(System.nanoTime()<end){String state=s.incident(id).get("status").toString();if(state.equals(expected))return;if(state.equals("FAILED"))fail(s.db.queryForList("SELECT * FROM events WHERE incident_id=?",id).toString());Thread.sleep(30);}fail("Timeout waiting for "+expected);}
}
