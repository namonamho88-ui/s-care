package demo.brain;
import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.client.TestRestTemplate;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.*;
import java.util.*;
import static org.assertj.core.api.Assertions.*;
@SpringBootTest(webEnvironment=SpringBootTest.WebEnvironment.RANDOM_PORT,properties={"spring.datasource.url=${TEST_DB_URL:jdbc:h2:mem:twin_test;MODE=PostgreSQL;DATABASE_TO_LOWER=TRUE;DB_CLOSE_DELAY=-1}","spring.datasource.username=${TEST_DB_USER:sa}","spring.datasource.password=${TEST_DB_PASSWORD:}","brain.neo4j-uri=disabled","brain.graph-required=false","brain.step-ms=0","brain.jev.local-url=http://127.0.0.1:19998/v1/systemone"})
class TwinLabIntegrationTest {
 @Autowired TwinLab lab;
 @Autowired TestRestTemplate http;@Autowired Store store;
 @org.springframework.beans.factory.annotation.Value("${brain.admin-token}") String token;
 HttpHeaders headers(){var h=new HttpHeaders();h.setBearerAuth(token);return h;}
 ResponseEntity<Map> post(String path,Object body){return http.exchange(path,HttpMethod.POST,new HttpEntity<>(body,headers()),Map.class);}
 Map run(){return post("/api/twin/runs",Map.of("seed",42)).getBody();}
 Map command(Map r,String op,Map<String,Object> body){var input=new LinkedHashMap<>(body);input.put("version",r.get("version"));var response=post("/api/twin/runs/"+r.get("id")+"/"+op,input);assertThat(response.getStatusCode().is2xxSuccessful()).as(response.toString()).isTrue();return response.getBody();}
 Map compared(){Map r=run();r=command(r,"inject",Map.of("faults",List.of(Map.of("type","DB_PRIMARY","target","db-primary","intensity",1,"duration",300,"start",0))));r=command(r,"analyze",Map.of("mode","DEMO"));r=command(r,"strategies",Map.of());return command(r,"simulate",Map.of());}
 @Test void persistedWorkflowRequiresExplicitApprovalAndRejectsStaleVersion(){var r=compared();assertThat(r.get("status")).isEqualTo("COMPARED");var before=store.json.valueToTree(r.get("current"));assertThat(before.path("writer").asText()).isEqualTo("db-primary");assertThat(post("/api/twin/runs/"+r.get("id")+"/decision",Map.of("version",r.get("version"),"approved",true,"reason","검증")).getStatusCode().is4xxClientError()).isTrue();var waiting=command(r,"request",Map.of("strategyId","failover"));assertThat(post("/api/twin/runs/"+r.get("id")+"/reset",Map.of("version",r.get("version"))).getStatusCode().is4xxClientError()).isTrue();var approved=command(waiting,"decision",Map.of("approved",true,"reason","가상 Replica 상태와 지연 검토"));assertThat(approved.get("status")).isEqualTo("APPROVED");assertThat(store.json.valueToTree(approved.get("current")).path("writer").asText()).isEqualTo("db-replica");assertThat((List)approved.get("approvals")).hasSize(1);var response=http.exchange("/api/twin/runs/"+r.get("id")+"/report",HttpMethod.GET,new HttpEntity<>(headers()),String.class);assertThat(response.getBody()).contains("synthetic-twin-v1","가상 Replica");}
 @Test void rejectedStrategyNeverChangesLiveSnapshotAndSeparateRunsAreIsolated(){var a=compared();var b=run();a=command(a,"request",Map.of("strategyId","protect"));var original=a.get("current");a=command(a,"decision",Map.of("approved",false,"reason","쓰기 기능 제한 재검토"));assertThat(a.get("current")).isEqualTo(original);assertThat(store.json.valueToTree(b.get("current")).path("faults").size()).isZero();}
 @Test void failedStrategyCannotBeApproved(){var r=command(compared(),"request",Map.of("strategyId","restart"));assertThat(post("/api/twin/runs/"+r.get("id")+"/decision",Map.of("version",r.get("version"),"approved",true,"reason","실패 결과 승인 시도")).getStatusCode().is4xxClientError()).isTrue();}
 @Test void mcpOffersIsolatedSimulationAndDeniesCommands(){var r=compared();var result=post("/mcp",Map.of("jsonrpc","2.0","id","twin-test","method","tools/call","params",Map.of("name","twin_simulate","arguments",Map.of("runId",r.get("id")))));assertThat(store.json.valueToTree(result.getBody()).path("result").path("isError").asBoolean()).isFalse();assertThat(http.exchange("/api/twin/catalog",HttpMethod.GET,HttpEntity.EMPTY,Map.class).getStatusCode().value()).isEqualTo(401);}
 @Test void baselineEvaluationPersistsOnlyExecutedCases()throws Exception{var response=post("/api/twin/evaluations",Map.of("mode","DEMO","provider","LOCAL"));String id=response.getBody().get("id").toString();long end=System.nanoTime()+10_000_000_000L;while(System.nanoTime()<end){var report=store.json.valueToTree(store.decode(store.one("SELECT result_json FROM twin_evaluations WHERE id=?",id).get("result_json")));if(report.path("status").asText().equals("COMPLETED")){assertThat(report.path("rows").size()).isEqualTo(6);assertThat(report.path("actualAiCount").asInt()).isZero();assertThat(report.path("simulationCount").asInt()).isEqualTo(18);return;}Thread.sleep(30);}fail("Evaluation did not complete");}
 @Test void progressListSkipsSnapshotsAndStartupOnlyRecoversRunningRows(){
  String done=Store.id("TEVAL-"),running=Store.id("TEVAL-");
  store.db.update("INSERT INTO twin_evaluations(id,owner_id,result_json,created_at,status,completed) VALUES (?,?,?,?,?,?)",done,"bootstrap-admin","not-json-must-not-be-loaded",Store.now(),"COMPLETED",6);
  store.db.update("INSERT INTO twin_evaluations(id,owner_id,result_json,created_at,status,completed) VALUES (?,?,?,?,?,?)",running,"bootstrap-admin",store.encode(Map.of("id",running,"status","RUNNING","completed",2,"rows",List.of())),Store.now(),"RUNNING",2);
  lab.recoverInterrupted();
  assertThat(store.one("SELECT status,completed FROM twin_evaluations WHERE id=?",running)).containsEntry("status","INTERRUPTED").containsEntry("completed",2);
  assertThat(store.one("SELECT result_json FROM twin_evaluations WHERE id=?",done).get("result_json")).isEqualTo("not-json-must-not-be-loaded");
  var summaries=http.exchange("/api/twin/evaluations",HttpMethod.GET,new HttpEntity<>(headers()),String.class);
  assertThat(summaries.getStatusCode().is2xxSuccessful()).isTrue();assertThat(summaries.getBody()).contains(done,"sampleCount").doesNotContain("result_json","rows","not-json");
  var detail=http.exchange("/api/twin/evaluations/"+running,HttpMethod.GET,new HttpEntity<>(headers()),Map.class);
  assertThat(detail.getBody()).containsEntry("status","INTERRUPTED");
  store.db.update("UPDATE twin_evaluations SET owner_id=? WHERE id=?","another-owner",running);
  assertThat(http.exchange("/api/twin/evaluations/"+running,HttpMethod.GET,new HttpEntity<>(headers()),String.class).getStatusCode().is4xxClientError()).isTrue();
 }

}
