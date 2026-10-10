package demo.brain;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.sun.net.httpserver.HttpServer;
import org.junit.jupiter.api.*;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.PlatformTransactionManager;
import java.net.*;
import java.net.http.*;
import java.nio.file.*;
import java.util.*;
import java.util.concurrent.atomic.AtomicInteger;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;

class HermesRemotePublicationTest {
 static final String KEY="fictional-test-publish-key-32-characters";
 final ObjectMapper json=new ObjectMapper();
 final JdbcTemplate db=mock(JdbcTemplate.class);
 final Store store=new Store(db,json,mock(PlatformTransactionManager.class));
 final Map<String,Object> row=new HashMap<>(Map.of("status","APPROVED","title","가상 테스트","conditions","가상 관측","checks","점검","solution","복구","cautions","실제 변경 금지","source_provider","MOCK_HERMES","source_model","template","simulated",true));
 @TempDir Path root;
 @BeforeEach void setup(){when(db.queryForList("SELECT * FROM skills WHERE id=?","SKL-TEST")).thenReturn(List.of(row));}
 HermesSkillPublisher publisher(String url){return new HermesSkillPublisher(store,"","http",url,KEY);}

 @Test void draftDoesNotSendAndFailureIsRetryableWithoutChangingApproval()throws Exception{
  var server=HttpServer.create(new InetSocketAddress("127.0.0.1",0),0);var calls=new AtomicInteger();
  server.createContext("/skills/SKL-TEST",exchange->{
   assertThat(exchange.getRequestMethod()).isEqualTo("PUT");assertThat(exchange.getRequestHeaders().getFirst("Authorization")).isEqualTo("Bearer "+KEY);
   var input=json.readTree(exchange.getRequestBody());assertThat(input.path("approved").asBoolean()).isTrue();
   int status=calls.incrementAndGet()==1?503:200;
   byte[] body=json.writeValueAsBytes(Map.of("status","EXPORTED","skillId","SKL-TEST","sha256",input.path("sha256").asText()));
   exchange.sendResponseHeaders(status,body.length);exchange.getResponseBody().write(body);exchange.close();
  });server.start();
  try{
   var publisher=publisher("http://127.0.0.1:"+server.getAddress().getPort());row.put("status","DRAFT");
   assertThatThrownBy(()->publisher.publish("SKL-TEST")).hasMessageContaining("approved");assertThat(calls.get()).isZero();
   row.put("status","APPROVED");assertThat(publisher.publish("SKL-TEST")).containsEntry("status","FAILED");
   assertThat(publisher.publish("SKL-TEST")).containsEntry("status","EXPORTED").containsEntry("transport","http");
   assertThat(row.get("status")).isEqualTo("APPROVED");assertThat(calls.get()).isEqualTo(2);
  }finally{server.stop(0);}
 }
 @Test void incorrectReceiptIsNeverReportedAsExported()throws Exception{
  var server=HttpServer.create(new InetSocketAddress("127.0.0.1",0),0);
  server.createContext("/",e->{byte[] body="{\"status\":\"EXPORTED\",\"skillId\":\"SKL-TEST\",\"sha256\":\"incorrect\"}".getBytes();e.sendResponseHeaders(200,body.length);e.getResponseBody().write(body);e.close();});server.start();
  try{assertThat(publisher("http://127.0.0.1:"+server.getAddress().getPort()).publish("SKL-TEST")).containsEntry("status","FAILED");}
  finally{server.stop(0);}
 }
 @Test void invalidRemoteConfigurationFailsAtStartup(){
  assertThatThrownBy(()->new HermesSkillPublisher(store,"","http","https://example.invalid","")).isInstanceOf(IllegalArgumentException.class);
  assertThatThrownBy(()->publisher("file:///tmp/skills")).isInstanceOf(IllegalArgumentException.class);
 }
 @Test @EnabledIfEnvironmentVariable(named="HERMES_BRIDGE_PYTHON",matches=".+")
 void actualPythonBridgePublishesWithoutAnySharedBackendDirectory()throws Exception{
  int port;try(var socket=new java.net.ServerSocket(0)){port=socket.getLocalPort();}
  Path script=Path.of("../scripts/hermes_skill_bridge.py").toAbsolutePath().normalize();
  var builder=new ProcessBuilder(System.getenv("HERMES_BRIDGE_PYTHON"),script.toString());
  builder.environment().putAll(Map.of("HERMES_HOME",root.toString(),"HERMES_PUBLISH_KEY",KEY,"HERMES_PUBLISH_PORT",String.valueOf(port),"HERMES_PUBLISH_HOST","127.0.0.1"));
  builder.redirectErrorStream(true).redirectOutput(root.resolve("bridge.log").toFile());var process=builder.start();
  try{
   String base="http://127.0.0.1:"+port;var http=HttpClient.newHttpClient();boolean ready=false;
   for(int attempt=0;attempt<100;attempt++){try{ready=http.send(HttpRequest.newBuilder(URI.create(base+"/health")).build(),HttpResponse.BodyHandlers.discarding()).statusCode()==200;if(ready)break;}catch(Exception ignored){}Thread.sleep(100);}
   assertThat(ready).isTrue();var publisher=publisher(base);
   assertThat(publisher.publish("SKL-TEST")).containsEntry("status","EXPORTED");
   assertThat(publisher.publish("SKL-TEST")).containsEntry("status","EXPORTED");
   assertThat(Files.readString(root.resolve("skills/incident-brain-skl-test/SKILL.md"))).contains("관리자 승인","## 적용 조건","## 주의사항");
  }finally{process.destroy();if(!process.waitFor(10,java.util.concurrent.TimeUnit.SECONDS))process.destroyForcibly();}
 }
}
