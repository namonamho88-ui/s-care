package demo.brain;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.sun.net.httpserver.HttpServer;
import org.junit.jupiter.api.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.PlatformTransactionManager;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.util.*;
import java.util.concurrent.atomic.AtomicInteger;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;

class HermesProviderTest {
 HttpServer server;Store s;JdbcTemplate db;LocalSkillStore local;HttpHermesAdapter real;KnowledgeEngine engine;
 String content,request,auth;int code=200;boolean toolsEnabled=false;AtomicInteger calls=new AtomicInteger();
 Map<String,Object> incident=Map.of("id","INC-TEST","type","RESOURCE","mode","REAL","observations","Fictional CPU 98%","notes","errorRate=0.01 verified","decision_json","{}","impact_json","{}");
 @BeforeEach void setup()throws Exception{
  db=mock(JdbcTemplate.class);s=new Store(db,new ObjectMapper(),mock(PlatformTransactionManager.class));local=mock(LocalSkillStore.class);
  when(local.search("RESOURCE")).thenReturn(Map.of("skills",List.of(Map.of("id","SKL-01","status","APPROVED")),"manuals",List.of(Map.of("id","MAN-01"))));
  server=HttpServer.create(new InetSocketAddress("127.0.0.1",0),0);
  server.createContext("/v1/toolsets",e->{byte[] b=s.encode(Map.of("data",List.of(Map.of("name","terminal","enabled",toolsEnabled)))).getBytes(StandardCharsets.UTF_8);e.sendResponseHeaders(200,b.length);e.getResponseBody().write(b);e.close();});
  server.createContext("/v1/chat/completions",e->{calls.incrementAndGet();request=new String(e.getRequestBody().readAllBytes(),StandardCharsets.UTF_8);auth=e.getRequestHeaders().getFirst("Authorization");byte[] b=s.encode(Map.of("model","hermes-agent","choices",List.of(Map.of("message",Map.of("content",content))))).getBytes(StandardCharsets.UTF_8);e.sendResponseHeaders(code,b.length);e.getResponseBody().write(b);e.close();});server.start();
  real=new HttpHermesAdapter(s,"http://127.0.0.1:"+server.getAddress().getPort()+"/v1","fictional-test-key","hermes-agent",1);engine=new KnowledgeEngine(s,local,real,new MockHermesAdapter());
  content="{\"skillIds\":[\"SKL-01\"],\"manualIds\":[\"MAN-01\"],\"explanation\":\"가상 CPU 관측에 적합\"}";
 }
 @AfterEach void stop(){server.stop(0);}
 @Test void officialChatContractAndApprovedReferences()throws Exception{
  var result=engine.search(incident);assertThat(result).containsEntry("provider","HERMES_AGENT").containsEntry("simulated",false).containsEntry("approvedOnly",true);
  assertThat(auth).isEqualTo("Bearer fictional-test-key");var payload=s.json.readTree(request);assertThat(payload.path("model").asText()).isEqualTo("hermes-agent");assertThat(payload.path("stream").asBoolean()).isFalse();assertThat(payload.path("messages").size()).isEqualTo(2);assertThat(request).contains("SKL-01","Fictional CPU").doesNotContain("expected_type");
 }
 @Test void demoMakesNoExternalRequests(){var demo=new HashMap<>(incident);demo.put("mode","DEMO");assertThat(engine.search(demo)).containsEntry("provider","MOCK_HERMES").containsEntry("simulated",true).containsEntry("fallback",false);assertThat(calls.get()).isZero();}
 @Test void failedServerIsExplicitFallback(){code=503;assertThat(engine.search(incident)).containsEntry("provider","MOCK_HERMES_FALLBACK").containsEntry("fallback",true).containsEntry("fallbackReason","HERMES_HTTP_503");}
 @Test void badJsonAndUnapprovedIdsAreNeverTrusted(){content="not JSON";assertThat(engine.search(incident)).containsEntry("fallbackReason","HERMES_INVALID_JSON");content="{\"skillIds\":[\"UNAPPROVED-DRAFT\"],\"manualIds\":[],\"explanation\":\"x\"}";var result=engine.search(incident);assertThat(result).containsEntry("fallbackReason","HERMES_UNAPPROVED_REFERENCE");assertThat(s.encode(result.get("skills"))).contains("SKL-01").doesNotContain("UNAPPROVED");}
 @Test void unsafeHermesToolsPreventModelCall(){toolsEnabled=true;assertThat(engine.search(incident)).containsEntry("fallbackReason","HERMES_TOOLS_MUST_BE_DISABLED");assertThat(calls.get()).isZero();}
 @Test void structuredDraftRetainsProvenance(){content="{\"conditions\":\"CPU 98%\",\"checks\":\"승인과 지표 확인\",\"solution\":\"가상 복구 검증\",\"cautions\":\"가상 데이터만 사용\"}";var result=engine.draft(incident);assertThat(result).containsEntry("provider","HERMES_AGENT").containsEntry("simulated",false);assertThat(s.json.valueToTree(result.get("content")).path("checks").asText()).contains("승인");}
 @Test void incompleteDraftFallsBackAndDoesNotClaimModelSuccess(){content="{\"conditions\":\"CPU\"}";assertThat(engine.draft(incident)).containsEntry("simulated",true).containsEntry("fallbackReason","HERMES_INVALID_FIELD_checks");assertThat(engine.status()).containsEntry("llmVerified",false);}
 @Test void unavailableApiIsDistinctFromModelReadiness(){server.stop(0);assertThat(engine.status()).containsEntry("apiReachable",false).containsEntry("llmVerified",false);assertThat(engine.search(incident)).containsEntry("fallback",true);}
}
