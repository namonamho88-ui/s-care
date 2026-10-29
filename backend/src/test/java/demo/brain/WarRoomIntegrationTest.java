package demo.brain;

import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.client.TestRestTemplate;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.beans.factory.annotation.*;
import org.springframework.http.*;
import org.springframework.http.HttpHeaders;
import java.net.URI;
import java.net.http.*;
import java.util.*;
import java.util.concurrent.*;
import com.fasterxml.jackson.databind.JsonNode;
import static org.assertj.core.api.Assertions.*;

@SpringBootTest(webEnvironment=SpringBootTest.WebEnvironment.RANDOM_PORT,properties={"spring.datasource.url=jdbc:h2:mem:war_test;MODE=PostgreSQL;DATABASE_TO_LOWER=TRUE;DB_CLOSE_DELAY=-1","spring.datasource.username=sa","spring.datasource.password=","brain.neo4j-uri=disabled","brain.graph-required=false","brain.step-ms=0","WAR_ROOM_ENABLED=true","WAR_ROOM_GATEWAY_KEY=fictional-war-test-gateway-1234567890","WAR_ROOM_ALLOWED_ORIGINS=http://127.0.0.1:3100"})
@org.junit.jupiter.api.TestInstance(org.junit.jupiter.api.TestInstance.Lifecycle.PER_CLASS)
class WarRoomIntegrationTest {
 @Autowired TestRestTemplate http; @Autowired WarRoom rooms; @Autowired Store store; @Autowired TwinLab lab; @Autowired KnowledgeCases knowledge;
 @LocalServerPort int port; @Value("${brain.admin-token}") String token;
 String accountSession;
 synchronized String accountToken(){if(accountSession!=null)return accountSession;var h=new HttpHeaders();h.setBearerAuth(token);var invite=http.postForEntity("/api/auth/users",new HttpEntity<>(Map.of("login","war-room-admin","displayName","워룸 가상 관리자","role","ADMIN","operatorId","OP-01"),h),Map.class);assertThat(invite.getStatusCode().is2xxSuccessful()).isTrue();var activated=http.postForEntity("/api/auth/activate",Map.of("login","war-room-admin","inviteCode",invite.getBody().get("inviteCode"),"password","Fictional-test-pass-123!"),Map.class);assertThat(activated.getStatusCode().is2xxSuccessful()).isTrue();accountSession=activated.getBody().get("token").toString();return accountSession;}
 Map join(String room){return join(room,null);}
 Map join(String room,String resume){var h=new HttpHeaders();h.set("X-War-Gateway","fictional-war-test-gateway-1234567890");var b=new HashMap<String,String>();b.put("room",room);if(resume!=null)b.put("resume",resume);var r=http.postForEntity("/api/war-room/guest",new HttpEntity<>(b,h),Map.class);assertThat(r.getStatusCode().is2xxSuccessful()).as(r.toString()).isTrue();return r.getBody();}
 ResponseEntity<Map> command(String room,String op,Map<String,Object> fields,boolean admin){var h=new HttpHeaders();if(admin)h.setBearerAuth(accountToken());var b=new LinkedHashMap<>(fields);b.put("revision",rooms.state(room).get("revision"));return http.postForEntity("/api/war-room/rooms/"+room+"/"+op,new HttpEntity<>(b,h),Map.class);}
 Map ok(String room,String op,Map<String,Object> fields){var r=command(room,op,fields,true);assertThat(r.getStatusCode().is2xxSuccessful()).as(r.toString()).isTrue();return r.getBody();}
 class Peer implements WebSocket.Listener,AutoCloseable {
  final BlockingQueue<JsonNode> queue=new LinkedBlockingQueue<>(); final StringBuilder partial=new StringBuilder();WebSocket ws;
  Peer(String ticket)throws Exception{ws=HttpClient.newHttpClient().newWebSocketBuilder().header("Origin","http://127.0.0.1:3100").buildAsync(URI.create("ws://127.0.0.1:"+port+"/api/war-room/socket"),this).get(5,TimeUnit.SECONDS);send(Map.of("type","join","ticket",ticket));}
  public void onOpen(WebSocket s){s.request(1);}
  public CompletionStage<?> onText(WebSocket s,CharSequence text,boolean last){partial.append(text);if(last){try{queue.add(store.json.readTree(partial.toString()));}catch(Exception e){throw new RuntimeException(e);}partial.setLength(0);}s.request(1);return null;}
  void send(Object value){ws.sendText(store.encode(value),true).join();}
  JsonNode await(java.util.function.Predicate<JsonNode> predicate)throws Exception{long end=System.nanoTime()+8_000_000_000L;while(System.nanoTime()<end){var m=queue.poll(100,TimeUnit.MILLISECONDS);if(m!=null&&predicate.test(m))return m;}throw new AssertionError("Expected socket event was not received");}
  public void close(){if(!ws.isOutputClosed())ws.sendClose(1000,"test done").join();}
 }
 @Test void twoRealSocketsShareMovementChatAndResumeWithoutAccountPrivileges()throws Exception{
  Map a=join("collab"),b=join("collab");
  try(Peer one=new Peer(a.get("ticket").toString());Peer two=new Peer(b.get("ticket").toString())){
   var initial=two.await(m->m.path("players").size()==2);assertThat(initial.toString()).doesNotContain("resume","sessionHash","owner_id");
   one.send(Map.of("type","chat","text","합성 DB 확인 중"));assertThat(two.await(m->m.path("chat").size()==1).path("chat").get(0).path("text").asText()).isEqualTo("합성 DB 확인 중");
   String id=a.get("id").toString();double before=rooms.state("collab").get("players") instanceof List<?> list?store.json.valueToTree(list).findValues("x").get(0).asDouble():0;
   one.send(Map.of("type","move","x",0,"z",-1));two.await(m->m.path("type").asText().equals("presence"));
   one.send(Map.of("type","role","role","관리자 시연"));two.await(m->m.path("players").toString().contains("관리자 시연"));
   var h=new HttpHeaders();h.setBearerAuth(a.get("resume").toString());assertThat(http.exchange("/api/incidents",HttpMethod.GET,new HttpEntity<>(h),String.class).getStatusCode().value()).isEqualTo(401);
   assertThat(command("collab","start",Map.of("scenario","DATABASE"),false).getStatusCode().value()).isEqualTo(401);
   assertThat(join("collab",a.get("resume").toString()).get("id")).isEqualTo(id);
  }
 }
 @Test void actualTwentyClientsAndIndependentRoom()throws Exception{
  var clients=new ArrayList<Peer>();try{
   for(int i=0;i<20;i++){Map g=join("capacity");clients.add(new Peer(g.get("ticket").toString()));}
   assertThat(clients.get(19).await(m->m.path("players").size()==20).path("players").size()).isEqualTo(20);
   var h=new HttpHeaders();h.set("X-War-Gateway","fictional-war-test-gateway-1234567890");assertThat(http.postForEntity("/api/war-room/guest",new HttpEntity<>(Map.of("room","capacity"),h),Map.class).getStatusCode().is4xxClientError()).isTrue();
   try(Peer other=new Peer(join("isolated").get("ticket").toString())){assertThat(other.await(m->m.path("type").asText().equals("state")).path("players").size()).isEqualTo(1);}
  }finally{clients.forEach(Peer::close);}
 }
 @Test void threeScenariosUseExistingEngineAndNeverApplyBeforeApproval(){
  for(String scenario:List.of("BATCH","DATABASE","API")){
   String id="flow-"+scenario.toLowerCase();join(id);ok(id,"start",Map.of("scenario",scenario));
   ok(id,"analyze",Map.of());ok(id,"strategies",Map.of());var compared=ok(id,"simulate",Map.of());var run=store.json.valueToTree(compared.get("run"));assertThat(run.path("analysis").path("actualModelCall").asBoolean()).isFalse();assertThat(run.path("results").size()).isEqualTo(3);
   assertThat(command(id,"decision",Map.of("approved",true,"reason","too early"),true).getStatusCode().is4xxClientError()).isTrue();
   String selected=run.path("recommendation").path("strategyId").asText();assertThat(selected).isNotBlank();ok(id,"request",Map.of("strategyId",selected));var approved=ok(id,"decision",Map.of("approved",true,"reason","합성 검증 근거 확인"));var result=store.json.valueToTree(approved.get("run"));assertThat(result.path("status").asText()).isEqualTo("APPROVED");assertThat(result.toString()).doesNotContain("합성 검증 근거 확인","bootstrap-admin");
   var saved=ok(id,"knowledge",Map.of());String skill=saved.get("knowledgeId").toString();assertThat(store.one("SELECT status FROM skills WHERE id=?",skill).get("status")).isEqualTo("DRAFT");assertThat(ok(id,"knowledge",Map.of()).get("knowledgeId")).isEqualTo(skill);
  }
 }
 @Test void ticketsAreOneUseAndMovementIsValidatedByServer()throws Exception{
  Map g=join("validation");var guest=rooms.connect(g.get("ticket").toString(),"direct-test");
  assertThatThrownBy(()->rooms.connect(g.get("ticket").toString(),"replay")).isInstanceOf(org.springframework.web.server.ResponseStatusException.class);
  assertThatThrownBy(()->rooms.input("direct-test",store.json.valueToTree(Map.of("type","move","x",500,"z",0)))).isInstanceOf(IllegalArgumentException.class);
  assertThatThrownBy(()->rooms.input("direct-test",store.json.valueToTree(Map.of("type","decision","approved",true)))).isInstanceOf(IllegalArgumentException.class);
  guest.x=0;guest.z=0;guest.lastMove=System.currentTimeMillis()-100;rooms.input("direct-test",store.json.valueToTree(Map.of("type","move","x",0,"z",-1)));assertThat(guest.z).isGreaterThanOrEqualTo(-.4);
  guest.lastMove=System.currentTimeMillis()-150;rooms.input("direct-test",store.json.valueToTree(Map.of("type","move","x",0,"z",-1)));assertThat(guest.z).isGreaterThanOrEqualTo(-.4);
  guest.expires=System.currentTimeMillis()-1;assertThatThrownBy(()->rooms.input("direct-test",store.json.valueToTree(Map.of("type","ping")))).isInstanceOf(org.springframework.web.server.ResponseStatusException.class);rooms.disconnect("direct-test");
 }
 @Test void admissionNeedsGatewayAndUnknownWebsocketOriginsAreRejected(){
  var bootstrap=new HttpHeaders();bootstrap.setBearerAuth(token);assertThat(http.postForEntity("/api/war-room/rooms/blocked/start",new HttpEntity<>(Map.of("revision",0,"scenario","DATABASE"),bootstrap),Map.class).getStatusCode().value()).isEqualTo(403);
  assertThat(http.postForEntity("/api/war-room/guest",Map.of("room","blocked"),Map.class).getStatusCode().value()).isEqualTo(403);
  assertThatThrownBy(()->HttpClient.newHttpClient().newWebSocketBuilder().header("Origin","https://untrusted.example").buildAsync(URI.create("ws://127.0.0.1:"+port+"/api/war-room/socket"),new WebSocket.Listener(){}).join()).hasCauseInstanceOf(WebSocketHandshakeException.class);
 }
 @Test void expiredEmptyRoomsReleaseCapacity(){
  var isolated=new WarRoom(store,lab,knowledge,true);var first=isolated.join("vacancy-0",null);var guest=isolated.connect(first.get("ticket").toString(),"vacancy-socket");
  for(int i=1;i<8;i++)isolated.join("vacancy-"+i,null);
  assertThatThrownBy(()->isolated.join("vacancy-8",null)).isInstanceOf(IllegalStateException.class);
  guest.expires=System.currentTimeMillis()-1;
  assertThat(isolated.join("vacancy-8",null).get("id")).isNotNull();
 }
 @Test void largeComparisonAndApprovalResultsReachAnAlreadyConnectedGuest()throws Exception{
  Map g=join("frames");try(Peer peer=new Peer(g.get("ticket").toString())){
   peer.await(m->m.path("type").asText().equals("state"));ok("frames","start",Map.of("scenario","DATABASE"));ok("frames","analyze",Map.of());ok("frames","strategies",Map.of());ok("frames","simulate",Map.of());
   var compared=peer.await(m->m.path("run").path("status").asText().equals("COMPARED"));assertThat(compared.path("run").path("results").size()).isEqualTo(3);
   String choice=compared.path("run").path("recommendation").path("strategyId").asText();ok("frames","request",Map.of("strategyId",choice));ok("frames","decision",Map.of("approved",true,"reason","합성 검증 결과 확인"));ok("frames","knowledge",Map.of());
   assertThat(peer.await(m->!m.path("knowledgeId").isMissingNode()&&!m.path("knowledgeId").isNull()).path("run").path("status").asText()).isEqualTo("APPROVED");
  }
 }
}
