package demo.brain;
import org.junit.jupiter.api.*;
import com.sun.net.httpserver.HttpServer;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.PlatformTransactionManager;
import java.net.*;
import java.util.*;
import java.util.concurrent.atomic.AtomicInteger;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;
class JevProviderTest {
 HttpServer server;Store store;JevHttpClient client;String url;String body;String auth;int code=200;int failFirstRequests;String serverTiming="";AtomicInteger calls=new AtomicInteger();String response;
 @BeforeEach void setup()throws Exception{store=new Store(mock(JdbcTemplate.class),new ObjectMapper(),mock(PlatformTransactionManager.class));client=new JevHttpClient(store,1);server=HttpServer.create(new InetSocketAddress("127.0.0.1",0),0);url="http://127.0.0.1:"+server.getAddress().getPort()+"/v1/systemone";response=answer(.9,.95);server.createContext("/v1/systemone",exchange->{int attempt=calls.incrementAndGet();body=new String(exchange.getRequestBody().readAllBytes(),java.nio.charset.StandardCharsets.UTF_8);auth=exchange.getRequestHeaders().getFirst("Authorization");byte[] data=response.getBytes(java.nio.charset.StandardCharsets.UTF_8);exchange.getResponseHeaders().set("Content-Type","application/json");if(!serverTiming.isEmpty())exchange.getResponseHeaders().set("Server-Timing",serverTiming);exchange.sendResponseHeaders(attempt<=failFirstRequests?503:code,data.length);exchange.getResponseBody().write(data);exchange.close();});server.start();}
 @AfterEach void stop(){server.stop(0);}
 String answer(double confidence,double evidence){return store.encode(Map.of("model","jevos-v4","answers",Map.of("type",Map.of("type","choice","choice","DATABASE","confidence",confidence),"severity",Map.of("type","choice","choice","P1","confidence",confidence),"department",Map.of("type","choice","choice","DATABASE","confidence",confidence),"recurrence",Map.of("type","noul","noul",.8),"evidence",Map.of("type","noul","noul",evidence))));}
 @Test void localUsesOfficialWireContractWithoutRequiringKey()throws Exception{var d=new LocalJevProvider(client,url,"").decide("Database lock timeout; customer outage; repeated signature");assertThat(d.provider()).isEqualTo("LOCAL_JEV");assertThat(d.simulated()).isFalse();assertThat(d.needsReview()).isFalse();assertThat(d.latencyMs()).isGreaterThanOrEqualTo(0);assertThat(auth).isNull();var request=store.json.readTree(body);assertThat(request.path("questions").path("type").path("type").asText()).isEqualTo("choice");assertThat(request.path("questions").path("recurrence").path("type").asText()).isEqualTo("noul");assertThat(body).doesNotContain("expected_type");}
 @Test void typesafeSendsBearerAndPreservesActualProvider(){var d=new TypeSafeJevProvider(client,url,"test-key-fictional").decide("Fictional database observation");assertThat(auth).isEqualTo("Bearer test-key-fictional");assertThat(d.provider()).isEqualTo("TYPESAFE_JEV");assertThat(d.simulated()).isFalse();}
 @Test void lowConfidenceAndInsufficientEvidenceRequireReview(){response=answer(.35,.9);var d=new LocalJevProvider(client,url,"").decide("Ambiguous fictional observation");assertThat(d.needsReview()).isTrue();assertThat(d.fallback()).isFalse();response=answer(.9,.2);assertThat(new LocalJevProvider(client,url,"").decide("Unknown issue").needsReview()).isTrue();}
 @Test void unavailableLocalRetriesExactlyTwiceAndLabelsFallback(){code=503;var router=router();var d=router.decide("CPU saturation and customer outage","REAL","LOCAL");assertThat(calls.get()).isEqualTo(2);assertThat(d.provider()).isEqualTo("MOCK_FALLBACK");assertThat(d.simulated()).isTrue();assertThat(d.fallbackReason()).contains("503");}
 @Test void connectionFailureFallsBackButCloudFailureDoesNot(){server.stop(0);var d=router().decide("CPU saturation","REAL","LOCAL");assertThat(d.fallback()).isTrue();assertThatThrownBy(()->router().decide("CPU saturation","REAL","TYPESAFE")).isInstanceOf(JevHttpClient.Unavailable.class);}
 @Test void malformedResponseIsNotSilentlyReplacedByMock(){response="{\"answers\":{}}";assertThatThrownBy(()->router().decide("CPU saturation","REAL","LOCAL")).isInstanceOf(IllegalArgumentException.class);assertThat(calls.get()).isEqualTo(1);}
 @Test void demoNeverCallsModelAndUnknownObservationRequiresReview(){var d=router().decide("Something happened","DEMO","LOCAL");assertThat(calls.get()).isZero();assertThat(d.provider()).isEqualTo("MOCK");assertThat(d.needsReview()).isTrue();}
 @Test void timeoutIsBounded()throws Exception{server.removeContext("/v1/systemone");server.createContext("/v1/systemone",e->{try{Thread.sleep(1400);}catch(Exception ignored){}e.close();});long start=System.nanoTime();assertThatThrownBy(()->new LocalJevProvider(client,url,"").decide("CPU saturation")).isInstanceOf(JevHttpClient.Unavailable.class);assertThat((System.nanoTime()-start)/1_000_000).isLessThan(2000);}
 @Test void diagnosisUsesIndependentObservationOnlyQuestions(){response=store.encode(Map.of("model","jevos-v4","answers",Map.of("cause",Map.of("choice","DB_POOL_EXHAUSTION","confidence",.91),"support",Map.of("noul",.95))));var result=diagnosis().assess(incident("REAL"));assertThat(result).containsEntry("causeCode","DB_POOL_EXHAUSTION").containsEntry("relatedType","DATABASE").containsEntry("simulated",false);assertThat(body).contains("cause","support").doesNotContain("expected_type","DATABASE_GROUND_TRUTH");}
 @Test void malformedDiagnosisRequiresReviewWithoutPretendingMock(){response="{\"answers\":{}}";assertThat(diagnosis().assess(incident("REAL"))).containsEntry("needsReview",true).containsEntry("schemaValid",false).containsEntry("simulated",false);}
 @Test void diagnosisLocalFailureAndDemoAreClearlySimulated(){code=503;assertThat(diagnosis().assess(incident("REAL"))).containsEntry("fallback",true).containsEntry("simulated",true);assertThat(calls.get()).isEqualTo(2);calls.set(0);assertThat(diagnosis().assess(incident("DEMO"))).containsEntry("provider","MOCK");assertThat(calls.get()).isZero();}
 @Test void classificationAndCauseUseOneRequestAndRetainBothSchemas()throws Exception{
  response=jointAnswer(.91,.95);var decision=router().decide("Database connection pool exhausted","REAL","LOCAL");
  var result=diagnosis().assess(withDecision(decision));
  assertThat(calls.get()).isEqualTo(1);assertThat(store.json.readTree(body).path("questions").size()).isEqualTo(7);
  assertThat(body).doesNotContain("expected_type","DATABASE_GROUND_TRUTH");decision.validate();
  assertThat(result).containsEntry("causeCode","DB_POOL_EXHAUSTION").containsEntry("inferenceReused",true).containsEntry("latencyMs",0L).containsEntry("simulated",false).containsEntry("scope","CAUSE_HYPOTHESIS_NOT_CONFIRMED_ROOT_CAUSE");
  assertThat(store.json.valueToTree(result).path("answers").size()).isEqualTo(2);
  assertThat(store.json.valueToTree(result).path("execution").path("requestCount").asInt()).isZero();
 }
 @Test void missingCombinedCauseNeedsReviewWithoutSecondCall(){
  var decision=router().decide("Database connection pool exhausted","REAL","LOCAL");
  assertThat(diagnosis().assess(withDecision(decision))).containsEntry("schemaValid",false).containsEntry("needsReview",true).containsEntry("simulated",false).containsEntry("fallback",false);
  assertThat(calls.get()).isEqualTo(1);
 }
 @Test void weakCombinedCauseIsNotExemptedByConfidentClassification()throws Exception{
  response=jointAnswer(.3,.2);var decision=router().decide("Database connection pool exhausted","REAL","LOCAL");
  assertThat(decision.needsReview()).isFalse();var result=diagnosis().assess(withDecision(decision));
  assertThat(result).containsEntry("schemaValid",true).containsEntry("needsReview",true).containsEntry("simulated",false);
  assertThat(calls.get()).isEqualTo(1);
 }
 @Test void combinedModeCanBeDisabledForPairedValidation()throws Exception{
  client=new JevHttpClient(store,1,false);var decision=router().decide("Database connection pool exhausted","REAL","LOCAL");
  assertThat(store.json.readTree(body).path("questions").size()).isEqualTo(5);
  response=jointAnswer(.9,.95);var result=diagnosis().assess(withDecision(decision));
  assertThat(result).containsEntry("causeCode","DB_POOL_EXHAUSTION");assertThat(calls.get()).isEqualTo(2);
  assertThat(store.json.readTree(body).path("questions").size()).isEqualTo(2);
 }
 @Test void successfulRetryAndFallbackExposeCumulativeTransportProvenance(){
  failFirstRequests=1;var decision=router().decide("Database connection pool exhausted","REAL","LOCAL");
  var timing=store.json.valueToTree(decision.answers()).path("_execution");
  assertThat(timing.path("requestCount").asInt()).isEqualTo(2);assertThat(timing.path("retryCount").asInt()).isEqualTo(1);
  assertThat(timing.path("category").asText()).isEqualTo("REAL_AI");assertThat(timing.path("requestedProvider").asText()).isEqualTo("LOCAL");
  assertThat(timing.path("modelInferenceMs").isNull()).isTrue();assertThat(timing.path("networkWaitMs").isNull()).isTrue();
  assertThat(decision.latencyMs()).isGreaterThanOrEqualTo(timing.path("httpElapsedMs").asLong());
  calls.set(0);code=503;decision=router().decide("CPU saturation","REAL","LOCAL");timing=store.json.valueToTree(decision.answers()).path("_execution");
  assertThat(timing.path("category").asText()).isEqualTo("MOCK_FALLBACK");assertThat(timing.path("requestCount").asInt()).isEqualTo(2);assertThat(timing.path("actualModelCall").asBoolean()).isFalse();
 }
 @Test void inferenceOnlyUsesExplicitServerTimingAndNeverPretendsRoundtripIsNetwork(){
  serverTiming="queue;dur=4, inference;dur=7.2";var decision=router().decide("Database lock wait","REAL","LOCAL");
  var timing=store.json.valueToTree(decision.answers()).path("_execution");
  assertThat(timing.path("modelInferenceMs").asLong()).isEqualTo(7);assertThat(timing.path("networkWaitMs").isNull()).isTrue();
 }
 @Test void demoAndFallbackNeverTriggerAdditionalDiagnosisInference(){
  var demo=router().decide("CPU saturation","DEMO","LOCAL");assertThat(store.json.valueToTree(demo.answers()).path("_execution").path("category").asText()).isEqualTo("DEMO_MOCK");
  assertThat(calls.get()).isZero();code=503;var decision=router().decide("CPU saturation","REAL","LOCAL");
  assertThat(diagnosis().assess(withDecision(decision))).containsEntry("provider","MOCK_FALLBACK");assertThat(calls.get()).isEqualTo(2);
 }
 String jointAnswer(double confidence,double support)throws Exception{
  var root=(com.fasterxml.jackson.databind.node.ObjectNode)store.json.readTree(answer(.9,.95));var answers=(com.fasterxml.jackson.databind.node.ObjectNode)root.path("answers");
  answers.set("cause",store.json.valueToTree(Map.of("choice","DB_POOL_EXHAUSTION","confidence",confidence)));answers.set("support",store.json.valueToTree(Map.of("noul",support)));return root.toString();
 }
 Map<String,Object> withDecision(JevDecision decision){var result=new LinkedHashMap<>(incident("REAL"));result.put("decision_json",store.encode(decision));return result;}
 Map<String,Object> incident(String mode){return Map.of("mode",mode,"provider","LOCAL","observations","Database connection pool exhausted","decision_json","{}","expected_type","DATABASE_GROUND_TRUTH");}
 DiagnosisEngine diagnosis(){return new DiagnosisEngine(store,client,url,"",url,"test-key-fictional");}
 JevRouter router(){return new JevRouter(new MockJevProvider(),new LocalJevProvider(client,url,""),new TypeSafeJevProvider(client,url,"test-key-fictional"));}
}
