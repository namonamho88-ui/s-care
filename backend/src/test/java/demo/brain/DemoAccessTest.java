package demo.brain;
import org.junit.jupiter.api.*;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.client.TestRestTemplate;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.core.env.ConfigurableEnvironment;
import org.springframework.core.env.MapPropertySource;
import org.springframework.http.*;
import java.util.*;
import static org.assertj.core.api.Assertions.*;
@SpringBootTest(webEnvironment=SpringBootTest.WebEnvironment.DEFINED_PORT,properties={"server.port=18081","spring.datasource.url=${TEST_DEMO_DB_URL:jdbc:h2:mem:demo_isolation;MODE=PostgreSQL;DATABASE_TO_LOWER=TRUE;DB_CLOSE_DELAY=-1;INIT=CREATE SCHEMA IF NOT EXISTS brain_demo_test}","spring.datasource.username=${TEST_DEMO_DB_USER:sa}","spring.datasource.password=${TEST_DEMO_DB_PASSWORD:}","spring.datasource.hikari.schema=brain_demo_test","spring.flyway.schemas=brain_demo_test","spring.flyway.default-schema=brain_demo_test","brain.neo4j-uri=${TEST_NEO4J_URI:disabled}","brain.graph-required=false","brain.graph-namespace=Demo_test","brain.hermes-publish-mode=disabled","brain.step-ms=0","brain.internal-url=http://localhost:18081","DEMO_DEPLOYMENT_ENV=isolated-demo","DEMO_ACCESS_ENABLED=true","DEMO_GATEWAY_KEY=fictional-demo-gateway-key-123456789","DEMO_CONTROL_KEY=fictional-demo-control-key-987654321","DEMO_ALLOWED_ORIGIN=http://127.0.0.1:3100","DEMO_ACCESS_EXPIRES_AT=2099-01-01T00:00:00Z"})
class DemoAccessTest {
 @Autowired Store s;@Autowired TestRestTemplate http;@Autowired ConfigurableEnvironment env;@Autowired Ontology graph;
 HttpHeaders headers(String token){var h=new HttpHeaders();h.set("X-Demo-Gateway","fictional-demo-gateway-key-123456789");h.set("X-Demo-Origin","http://127.0.0.1:3100");if(token!=null)h.setBearerAuth(token);return h;}
 ResponseEntity<Map> request(String token,HttpMethod method,String path,Object body){return http.exchange(path,method,new HttpEntity<>(body,headers(token)),Map.class);}
 String issue(){var res=request(null,HttpMethod.POST,"/api/demo/session",Map.of());assertThat(res.getStatusCode().value()).isEqualTo(200);assertThat((Map)res.getBody().get("user")).containsEntry("role","DEMO_ADMIN");return res.getBody().get("token").toString();}
 @Test void isolatedDemoLifecycleAndRevocation()throws Exception{
  assertThat(http.postForEntity("/api/demo/session",Map.of(),Map.class).getStatusCode().value()).isEqualTo(403);
  String token=issue();assertThat(s.db.queryForList("SELECT * FROM demo_sessions").toString()).doesNotContain(token);
  assertThat(request(token,HttpMethod.GET,"/api/config",null).getStatusCode().value()).isEqualTo(200);
  var noGateway=new HttpHeaders();noGateway.setBearerAuth(token);assertThat(http.exchange("/api/config",HttpMethod.GET,new HttpEntity<>(noGateway),Map.class).getStatusCode().value()).isEqualTo(401);
  for(String path:List.of("/api/auth/users","/api/auth/password","/api/hermes/sync","/api/demo/control","/mcp","/a2a/recovery"))assertThat(request(token,HttpMethod.POST,path,Map.of()).getStatusCode().value()).as(path).isEqualTo(403);
  assertThat(request(token,HttpMethod.GET,"/api/auth/users",null).getStatusCode().value()).isEqualTo(403);
  // A production-shaped marker schema remains untouched by every demo operation.
  boolean postgres=env.getProperty("spring.datasource.url").startsWith("jdbc:postgresql:");
  if(!postgres){s.db.execute("CREATE SCHEMA IF NOT EXISTS production_marker");s.db.execute("CREATE TABLE production_marker.incidents(id VARCHAR(40) PRIMARY KEY,status VARCHAR(30))");s.db.update("INSERT INTO production_marker.incidents VALUES ('DO-NOT-CHANGE','ANALYZING')");}
  String id=request(token,HttpMethod.POST,"/api/incidents",Map.of("title","[통합 테스트] 가상 자원 장애","assetId","CMP-01","mode","DEMO","provider","MOCK","observations","CPU 98% memory exhaustion; customer outage; repeated signature")).getBody().get("id").toString();
  waitFor(id,"WAITING_APPROVAL");var d=request(token,HttpMethod.GET,"/api/incidents/"+id,null).getBody();assertThat((Map)d.get("impact")).containsKeys("direct","indirect","systems");assertThat((List)d.get("tasks")).hasSizeGreaterThanOrEqualTo(4);
  assertThat(request(token,HttpMethod.POST,"/api/incidents/"+id+"/approval",Map.of("approved",true,"reason","격리된 가상 지표만 검증")).getStatusCode().value()).isEqualTo(200);waitFor(id,"RESOLVED");assertThat(s.db.queryForObject("SELECT COUNT(DISTINCT agent) FROM agent_tasks WHERE incident_id=?",Integer.class,id)).isEqualTo(6);
  request(token,HttpMethod.PATCH,"/api/incidents/"+id,Map.of("notes","가상 복구 검증 완료","prevention","가상 임계치 확인"));assertThat(request(token,HttpMethod.POST,"/api/incidents/"+id+"/close",Map.of()).getStatusCode().value()).isEqualTo(200);
  for(String format:List.of("pdf","xlsx")){var res=http.exchange("/api/incidents/"+id+"/report/"+format,HttpMethod.GET,new HttpEntity<>(headers(token)),byte[].class);assertThat(res.getStatusCode().value()).isEqualTo(200);assertThat(res.getBody().length).isGreaterThan(100);}
  if(postgres)assertThatThrownBy(()->s.one("SELECT * FROM production_marker.incidents WHERE id='DO-NOT-CHANGE'")).isInstanceOf(org.springframework.dao.DataAccessException.class);else assertThat(s.one("SELECT * FROM production_marker.incidents WHERE id='DO-NOT-CHANGE'")).containsEntry("status","ANALYZING");assertThat(s.db.queryForObject("SELECT COUNT(*) FROM app_users",Integer.class)).isZero();
  var control=new HttpHeaders();control.set("X-Demo-Control","fictional-demo-control-key-987654321");var off=http.exchange("/api/demo/control",HttpMethod.POST,new HttpEntity<>(Map.of("enabled",false,"actor","test-admin"),control),Map.class);assertThat(off.getStatusCode().value()).isEqualTo(200);
  assertThat(request(token,HttpMethod.GET,"/api/config",null).getStatusCode().value()).isEqualTo(401);assertThat(request(null,HttpMethod.POST,"/api/demo/session",Map.of()).getStatusCode().value()).isEqualTo(401);assertThat(s.incident(id)).containsEntry("status","CLOSED");
  http.exchange("/api/demo/control",HttpMethod.POST,new HttpEntity<>(Map.of("enabled",true,"actor","test-admin"),control),Map.class);String fresh=issue();assertThat(request(token,HttpMethod.GET,"/api/config",null).getStatusCode().value()).isEqualTo(401);
  env.getPropertySources().addFirst(new MapPropertySource("expiry-test",Map.of("DEMO_ACCESS_EXPIRES_AT","2000-01-01T00:00:00Z")));assertThat(request(fresh,HttpMethod.GET,"/api/config",null).getStatusCode().value()).isEqualTo(401);env.getPropertySources().remove("expiry-test");
  env.getPropertySources().addFirst(new MapPropertySource("disabled-test",Map.of("DEMO_ACCESS_ENABLED","false")));assertThat(request(fresh,HttpMethod.GET,"/api/config",null).getStatusCode().value()).isEqualTo(401);assertThat(http.exchange("/api/demo/control",HttpMethod.POST,new HttpEntity<>(Map.of("enabled",true,"actor","test-admin"),control),Map.class).getStatusCode().value()).isEqualTo(403);env.getPropertySources().remove("disabled-test");
 }
 void waitFor(String id,String status)throws Exception{long until=System.nanoTime()+30_000_000_000L;while(System.nanoTime()<until){String current=s.incident(id).get("status").toString();if(current.equals(status))return;if(List.of("FAILED","NEEDS_REVIEW").contains(current))fail("Unexpected state "+s.incident(id));Thread.sleep(80);}fail("Timed out "+s.incident(id));}
 @Test void unsafeConfigurationRejectedBeforeDatabaseWrites(){var e=new org.springframework.mock.env.MockEnvironment().withProperty("DEMO_ACCESS_ENABLED","true").withProperty("spring.datasource.url","jdbc:h2:mem:guard");assertThatThrownBy(()->DemoIsolation.validate(e)).hasMessageContaining("isolated");e.withProperty("DEMO_DEPLOYMENT_ENV","isolated-demo").withProperty("spring.datasource.hikari.schema","brain");assertThatThrownBy(()->DemoIsolation.validate(e)).hasMessageContaining("schema");}
 @Test void dedicatedPoolerRoleAcceptedButAdministratorRoleRejected(){
  var e=new org.springframework.mock.env.MockEnvironment().withProperty("DEMO_DEPLOYMENT_ENV","isolated-demo").withProperty("spring.datasource.url","jdbc:postgresql://localhost/demo").withProperty("spring.datasource.username","brain_demo_showcase.projectref").withProperty("spring.datasource.hikari.schema","brain_demo_showcase").withProperty("spring.flyway.schemas","brain_demo_showcase").withProperty("spring.flyway.default-schema","brain_demo_showcase").withProperty("brain.hermes-publish-mode","disabled").withProperty("brain.graph-namespace","Demo_showcase");
  assertThatCode(()->DemoIsolation.validate(e)).doesNotThrowAnyException();e.withProperty("spring.datasource.username","postgres.projectref");assertThatThrownBy(()->DemoIsolation.validate(e)).hasMessageContaining("dedicated database role");
 }
}
