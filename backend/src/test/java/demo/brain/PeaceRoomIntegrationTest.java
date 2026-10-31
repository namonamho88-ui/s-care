package demo.brain;
import com.fasterxml.jackson.databind.JsonNode;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.client.TestRestTemplate;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.http.*;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.WebSocket;
import java.util.*;
import java.util.concurrent.*;
import static org.assertj.core.api.Assertions.*;

@SpringBootTest(webEnvironment=SpringBootTest.WebEnvironment.RANDOM_PORT,properties={"spring.datasource.url=${TEST_DB_URL:jdbc:h2:mem:peace_test;MODE=PostgreSQL;DATABASE_TO_LOWER=TRUE;DB_CLOSE_DELAY=-1}","spring.datasource.username=${TEST_DB_USER:sa}","spring.datasource.password=${TEST_DB_PASSWORD:}","brain.neo4j-uri=disabled","brain.graph-required=false","brain.step-ms=0","WAR_ROOM_ENABLED=true","WAR_ROOM_GATEWAY_KEY=fictional-peace-test-gateway-1234567890","WAR_ROOM_ALLOWED_ORIGINS=http://127.0.0.1:3100"})
class PeaceRoomIntegrationTest {
 @Autowired TestRestTemplate http; @Autowired WarRoom rooms; @Autowired Store store; @Autowired TwinLab lab; @Autowired KnowledgeCases knowledge; @LocalServerPort int port;
 WarRoom isolated(){return new WarRoom(store,lab,knowledge,true);}
 Map<String,Object> action(String kind,Object... extras){var out=new LinkedHashMap<String,Object>();out.put("type","peace-action");out.put("kind",kind);out.put("requestId",UUID.randomUUID().toString());for(int i=0;i<extras.length;i+=2)out.put(extras[i].toString(),extras[i+1]);return out;}
 void input(WarRoom r,String connection,Object value){r.input(connection,store.json.valueToTree(value));}
 JsonNode player(WarRoom r,String room,String id){for(var node:store.json.valueToTree(r.state(room).get("players")))if(node.path("id").asText().equals(id))return node;throw new AssertionError("Missing participant "+id);}
 Map join(String room,String resume){var h=new HttpHeaders();h.set("X-War-Gateway","fictional-peace-test-gateway-1234567890");var body=new HashMap<String,String>();body.put("room",room);if(resume!=null)body.put("resume",resume);var response=http.postForEntity("/api/war-room/guest",new HttpEntity<>(body,h),Map.class);assertThat(response.getStatusCode().is2xxSuccessful()).as(response.toString()).isTrue();return response.getBody();}
 class Peer implements WebSocket.Listener,AutoCloseable {
  final BlockingQueue<JsonNode> queue=new LinkedBlockingQueue<>();final Set<String> types=ConcurrentHashMap.newKeySet();final StringBuilder partial=new StringBuilder();WebSocket ws;
  Peer(String ticket)throws Exception{ws=HttpClient.newHttpClient().newWebSocketBuilder().header("Origin","http://127.0.0.1:3100").buildAsync(URI.create("ws://127.0.0.1:"+port+"/api/war-room/socket"),this).get(5,TimeUnit.SECONDS);send(Map.of("type","join","ticket",ticket));}
  public void onOpen(WebSocket s){s.request(1);}
  public CompletionStage<?> onText(WebSocket s,CharSequence text,boolean last){partial.append(text);if(last){try{JsonNode m=store.json.readTree(partial.toString());types.add(m.path("type").asText());queue.add(m);}catch(Exception e){throw new RuntimeException(e);}partial.setLength(0);}s.request(1);return null;}
  void send(Object value){ws.sendText(store.encode(value),true).join();}
  JsonNode await(java.util.function.Predicate<JsonNode> predicate)throws Exception{long end=System.nanoTime()+8_000_000_000L;while(System.nanoTime()<end){JsonNode m=queue.poll(100,TimeUnit.MILLISECONDS);if(m!=null&&predicate.test(m))return m;}throw new AssertionError("Expected peace-room event was not received");}
  public void close(){if(!ws.isOutputClosed())ws.sendClose(1000,"test done").join();}
 }
 @Test void twoSocketsShareGesturesAndChatWithoutCrossRoomOrAdminAccess()throws Exception{
  Map a=join("peace-live",null),b=join("peace-live",null),c=join("peace-other",null);String id=a.get("id").toString();
  try(Peer one=new Peer(a.get("ticket").toString());Peer two=new Peer(b.get("ticket").toString());Peer other=new Peer(c.get("ticket").toString())){
   var initial=two.await(m->m.path("players").size()==2);assertThat(initial.path("serverNow").asLong()).isPositive();assertThat(initial.toString()).doesNotContain("resume","sessionHash");other.await(m->m.path("players").size()==1);assertThat(a.get("name")).isNotEqualTo(b.get("name"));long revision=((Number)rooms.state("peace-live").get("revision")).longValue();
   var stone=action("stone","safe",true,"offset",0);one.send(stone);two.await(m->m.path("players").toString().contains("\"stones\":1"));assertThat(player(rooms,"peace-live",id).path("ritual").path("sequence").asLong()).isEqualTo(1);assertThat(rooms.state("peace-live").get("revision")).isEqualTo(revision);
   one.queue.clear();one.send(stone);one.send(Map.of("type","sync"));one.await(m->m.path("type").asText().equals("state"));assertThat(player(rooms,"peace-live",id).path("ritual").path("stones").asInt()).isEqualTo(1);
   one.send(Map.of("type","chat","text","오늘도 무사히"));two.await(m->m.path("chat").size()==1);assertThat(store.json.valueToTree(rooms.state("peace-other").get("chat")).size()).isZero();assertThat(player(rooms,"peace-other",c.get("id").toString()).path("ritual").path("sequence").asLong()).isZero();
   var h=new HttpHeaders();h.setBearerAuth(a.get("resume").toString());assertThat(http.exchange("/api/incidents",HttpMethod.GET,new HttpEntity<>(h),String.class).getStatusCode().value()).isEqualTo(401);assertThat(http.postForEntity("/api/war-room/rooms/peace-live/start",new HttpEntity<>(Map.of("revision",revision,"scenario","DATABASE"),h),Map.class).getStatusCode().value()).isEqualTo(401);
   one.close();two.await(m->m.path("players").size()==1);Map resumed=join("peace-live",a.get("resume").toString());assertThat(resumed.get("id")).isEqualTo(id);assertThat(resumed.get("name")).isEqualTo(a.get("name"));try(Peer again=new Peer(resumed.get("ticket").toString())){again.await(m->m.path("players").size()==2);assertThat(player(rooms,"peace-live",id).path("ritual").path("stones").asInt()).isEqualTo(1);assertThat(again.types).doesNotContain("training");}assertThat(one.types).doesNotContain("training");assertThat(two.types).doesNotContain("training");
  }
 }
 @Test void deterministicStonesAreBoundedDeduplicatedAnchoredAndResetOnlyForActor(){
  var r=isolated();var a=r.join("peace-stones",null);var b=r.join("peace-stones",null);var g=r.connect(a.get("ticket").toString(),"stone-a");var peer=r.connect(b.get("ticket").toString(),"stone-b");
  var first=action("stone","safe",true,"offset",1,"player",peer.id);input(r,"stone-a",first);input(r,"stone-a",first);assertThat(g.stones).isEqualTo(1);assertThat(g.ritualSequence).isEqualTo(1);assertThat(peer.stones).isZero();double anchor=g.stoneX;g.lastMove=0;input(r,"stone-a",Map.of("type","move","x",1,"z",0));assertThat(g.x).isNotEqualTo(anchor);assertThat(g.stoneX).isEqualTo(anchor);
  g.lastPeace=0;input(r,"stone-a",action("stone","safe",false,"offset",1));assertThat(g.stones).isEqualTo(1);assertThat(g.ritualResult).isEqualTo("fallen");for(int i=0;i<7;i++){g.lastPeace=0;input(r,"stone-a",action("stone","safe",true,"offset",0));}assertThat(g.stones).isEqualTo(7);assertThat(g.ritualResult).isEqualTo("complete");
  g.lastPeace=0;input(r,"stone-a",action("prayer"));assertThat(g.stones).isEqualTo(7);g.lastPeace=0;input(r,"stone-a",action("stone","reset",true));assertThat(g.stones).isZero();assertThat(g.ritualResult).isEqualTo("cleared");assertThat(peer.stones).isZero();assertThat(g.contributions).isZero();
 }
 @Test void crossCompletesAndMovementCancelsOnceWhileReconnectPreservesState(){
  var r=isolated();var session=r.join("peace-cross",null);var g=r.connect(session.get("ticket").toString(),"cross-a");assertThat(store.json.valueToTree(g.view()).path("ritual").path("kind").asText()).isEqualTo("rest");assertThat(g.ritualSequence).isZero();
  input(r,"cross-a",action("cross"));g.lastPeace=0;assertThatThrownBy(()->input(r,"cross-a",action("cross"))).isInstanceOf(IllegalStateException.class);g.ritualAt-=4001;assertThat(store.json.valueToTree(g.view()).path("ritual").path("result").asText()).isEqualTo("complete");input(r,"cross-a",action("beads"));assertThat(g.ritualStep).isEqualTo(1);g.lastPeace=0;input(r,"cross-a",action("beads"));assertThat(g.ritualStep).isEqualTo(2);long sequence=g.ritualSequence;
  r.disconnect("cross-a");var resumed=r.join("peace-cross",session.get("resume").toString());var same=r.connect(resumed.get("ticket").toString(),"cross-b");assertThat(same).isSameAs(g);assertThat(g.ritualStep).isEqualTo(2);assertThat(g.ritualSequence).isEqualTo(sequence);g.x=0;g.z=2;g.lastMove=System.currentTimeMillis()-150;input(r,"cross-b",Map.of("type","move","x",1,"z",0));assertThat(g.ritualKind).isEqualTo("rest");assertThat(g.ritualSequence).isEqualTo(sequence+1);g.lastMove=System.currentTimeMillis()-150;input(r,"cross-b",Map.of("type","move","x",1,"z",0));assertThat(g.ritualSequence).isEqualTo(sequence+1);
 }
 @Test void malformedRequestsAndTrainingEventsCannotMutatePeaceRoom(){
  var r=isolated();var session=r.join("peace-validation",null);var g=r.connect(session.get("ticket").toString(),"validate");for(var bad:List.of(action("unknown"),action("stone","offset",2),action("stone","offset","NaN"),action("stone","safe","true"),action("stone","reset","yes"),action("prayer","reset",true),Map.of("type","peace-action","kind","beads","requestId","not-a-uuid"))){assertThatThrownBy(()->input(r,"validate",bad)).isInstanceOf(IllegalArgumentException.class);}for(String type:List.of("training","inspect","floor","city-visit","role","profile")){assertThatThrownBy(()->input(r,"validate",Map.of("type",type))).isInstanceOf(IllegalArgumentException.class);}assertThat(g.ritualSequence).isZero();assertThat(g.stones).isZero();assertThat(g.contributions).isZero();input(r,"validate",action("rosary"));assertThatThrownBy(()->input(r,"validate",action("rosary"))).isInstanceOf(IllegalArgumentException.class);input(r,"validate",action("rest"));assertThat(g.ritualKind).isEqualTo("rest");g.x=1.9;g.z=-3.85;g.lastMove=System.currentTimeMillis()-150;input(r,"validate",Map.of("type","move","x",-1,"z",0));assertThat(g.x).isEqualTo(1.9);
  var ordinary=r.join("city-no-ritual",null);r.connect(ordinary.get("ticket").toString(),"ordinary");assertThatThrownBy(()->input(r,"ordinary",action("beads"))).isInstanceOf(IllegalArgumentException.class);assertThat(player(r,"city-no-ritual",ordinary.get("id").toString()).has("ritual")).isFalse();
 }
 @Test void duplicateMemoryHasFiniteCapacity(){var r=isolated();var session=r.join("peace-bounded",null);var g=r.connect(session.get("ticket").toString(),"bounded");for(int i=0;i<140;i++){g.count=0;input(r,"bounded",action("rest"));}assertThat(g.peaceRequests).hasSize(128);assertThat(g.ritualSequence).isEqualTo(140);}
 @Test void evenAccountAdminCannotAttachIncidentOrExecuteCommandsInPeaceRoom(){
  var r=isolated();var request=new org.springframework.mock.web.MockHttpServletRequest();request.setAttribute("brain.identity",new Access.Identity("fictional-test-admin","test-admin","가상 시험 관리자","ADMIN","OP-TEST","ACCOUNT","not-a-session-secret"));var original=org.springframework.web.context.request.RequestContextHolder.getRequestAttributes();org.springframework.web.context.request.RequestContextHolder.setRequestAttributes(new org.springframework.web.context.request.ServletRequestAttributes(request));try{for(String op:List.of("link","unlink","start","knowledge","decision","reset")){assertThatThrownBy(()->r.command("peace-command-guard",op,Map.of("revision",0,"scenario","DATABASE"))).isInstanceOf(IllegalArgumentException.class).hasMessageContaining("평온의 방");}assertThat(r.state("peace-command-guard").get("incidentLinked")).isEqualTo(false);assertThat(store.db.queryForObject("SELECT COUNT(*) FROM war_rooms WHERE id=?",Integer.class,"peace-command-guard")).isZero();}finally{if(original==null)org.springframework.web.context.request.RequestContextHolder.resetRequestAttributes();else org.springframework.web.context.request.RequestContextHolder.setRequestAttributes(original);}
 }
}
