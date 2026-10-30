package demo.brain;

import com.fasterxml.jackson.databind.JsonNode;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.http.HttpStatus;
import java.security.*;
import java.util.*;

/** Public synthetic collaboration only. Guest identity never becomes an Access.Identity. */
@Service
public class WarRoom {
 public static final int CAPACITY=20;
 private final Store store; private final TwinLab lab; private final KnowledgeCases knowledge; private final boolean enabled;
 private final Map<String,Guest> guests=new HashMap<>();
 private final Map<String,Ticket> tickets=new HashMap<>();
 private final Map<String,Room> rooms=new HashMap<>();
 private final SecureRandom random=new SecureRandom();
 record Ticket(String guest,long expires){}
 static class Guest {
  String id=UUID.randomUUID().toString(), name="게스트-"+UUID.randomUUID().toString().substring(0,4), room, connection, role="분석";
  long expires, lastSeen, window, lastMove, lastChat; int count, contributions, floor=1; double x,z,direction;
  Guest(String room,long now){this.room=room;expires=now+3_600_000;lastSeen=now;}
  Map<String,Object> view(){return Map.of("id",id,"name",name,"role",role,"floor",floor,"x",x,"z",z,"direction",direction,"contributions",contributions);}
 }
 static class Room {
  String id,runId,incidentId,mappedNode,knowledgeId; long revision,started,completed; boolean busy; String operation="",error="";
  Map<String,Object> run,incident; long refreshed; final List<Map<String,Object>> chat=new ArrayList<>(); final Set<String> checks=new HashSet<>();
  Room(String id){this.id=id;}
 }
 public WarRoom(Store store,TwinLab lab,KnowledgeCases knowledge,@Value("${WAR_ROOM_ENABLED:false}") boolean enabled){this.store=store;this.lab=lab;this.knowledge=knowledge;this.enabled=enabled;}
 void enabled(){if(!enabled)throw new ResponseStatusException(HttpStatus.NOT_FOUND,"워룸이 활성화되지 않았습니다.");}
 boolean available(){return enabled;}
 static void admin(){Access.admin();if(!"ACCOUNT".equals(Access.current().kind())||!"ADMIN".equals(Access.current().role()))throw Access.denied();}
 private String secret(){byte[] b=new byte[32];random.nextBytes(b);return Base64.getUrlEncoder().withoutPadding().encodeToString(b);}
 private static String hash(String s){try{return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(s.getBytes(java.nio.charset.StandardCharsets.UTF_8)));}catch(Exception e){throw new IllegalStateException(e);}}
 private Room room(String id){
  if(id==null||!id.matches("[a-z0-9-]{1,32}"))throw new IllegalArgumentException("방 이름: 영문 소문자·숫자·하이픈, 최대 32자");
  Room existing=rooms.get(id);if(existing!=null)return existing;
  if(rooms.size()>=8)throw new IllegalStateException("최대 8개 방까지 열 수 있습니다.");
  Room r=new Room(id);var rows=store.db.queryForList("SELECT * FROM war_rooms WHERE id=?",id);
  if(!rows.isEmpty()){var row=rows.get(0);r.runId=(String)row.get("run_id");r.incidentId=(String)row.get("incident_id");r.mappedNode=(String)row.get("mapped_node");r.knowledgeId=(String)row.get("knowledge_id");if(r.runId!=null)r.run=loadRun(r.runId);}
  rooms.put(id,r);return r;
 }
 private Map<String,Object> loadRun(String id){var row=store.one("SELECT document_json,status,version FROM twin_runs WHERE id=?",id);var d=new LinkedHashMap<String,Object>(store.json.convertValue(store.decode(row.get("document_json")),Map.class));d.put("status",row.get("status"));d.put("version",row.get("version"));return d;}
 private void persist(Room r){store.tx(()->{if(store.db.update("UPDATE war_rooms SET run_id=?,incident_id=?,mapped_node=?,updated_at=? WHERE id=?",r.runId,r.incidentId,r.mappedNode,Store.now(),r.id)==0)store.db.update("INSERT INTO war_rooms(id,run_id,incident_id,mapped_node,updated_at) VALUES (?,?,?,?,?)",r.id,r.runId,r.incidentId,r.mappedNode,Store.now());return null;});}
 public synchronized Map<String,Object> join(String id,String resume){
  enabled();cleanup();room(id);long now=System.currentTimeMillis();String token=resume;Guest g=resume==null?null:guests.get(hash(resume));
  if(g==null||!g.room.equals(id)){if(guests.size()>=160)throw new IllegalStateException("게스트 세션 한도에 도달했습니다. 잠시 후 다시 시도하세요.");if(guests.values().stream().filter(p->p.room.equals(id)).count()>=CAPACITY)throw new IllegalStateException("방 정원은 20명입니다. 잠시 후 다시 시도하세요.");g=new Guest(id,now);token=secret();guests.put(hash(token),g);}
  // Every socket gets a one-use, 20-second admission ticket; the resumable secret stays in an HttpOnly BFF cookie.
  String ticket=secret();String key=hash(token);tickets.entrySet().removeIf(e->e.getValue().guest().equals(key));tickets.put(hash(ticket),new Ticket(key,now+20_000));
  return Map.of("resume",token,"ticket",ticket,"id",g.id,"name",g.name,"expiresAt",g.expires);
 }
 synchronized Guest connect(String ticket,String connection){cleanup();Ticket t=tickets.remove(hash(ticket));if(t==null||t.expires()<System.currentTimeMillis())throw Access.denied();Guest g=guests.get(t.guest());if(g==null)throw Access.denied();if(g.connection!=null)throw new IllegalStateException("이미 접속 중입니다. 이전 창을 닫고 재시도하세요.");g.connection=connection;g.lastSeen=System.currentTimeMillis();spawn(g);room(g.room).revision++;return g;}
 synchronized void disconnect(String connection){guests.values().stream().filter(g->connection.equals(g.connection)).forEach(g->{g.connection=null;g.lastSeen=System.currentTimeMillis();room(g.room).revision++;});}
 private void spawn(Guest g){for(int i=0;i<40;i++){double x=-8+(i%10)*1.6,z=4+Math.floor(i/10)*.75;if(free(g,x,z)){g.x=x;g.z=z;return;}}throw new IllegalStateException("입장 위치가 혼잡합니다.");}
 private boolean free(Guest g,double x,double z){
  if(Math.abs(x)>9||Math.abs(z)>6)return false;
  if(g.floor<=2 && z>-4.4&&z<-.4 && x>-7.5&&x<7.5)return false; // rack bays
  if(g.floor<=2 && z>-.7&&z<1.05&&x>-.6&&x<8.2)return false; // response consoles
  if(g.floor==3&&Math.abs(x)<3.3&&Math.abs(z)<1.8)return false; // war table
  if(g.floor==4&&Math.abs(x)<7.5&&z>-3.5&&z<-.5)return false; // all five control consoles
  return guests.values().stream().noneMatch(p->p!=g&&p.connection!=null&&p.room.equals(g.room)&&p.floor==g.floor&&Math.hypot(p.x-x,p.z-z)<.65);
 }
 public static double finite(JsonNode value){if(!value.isNumber()||!Double.isFinite(value.asDouble()))throw new IllegalArgumentException("유효한 숫자가 필요합니다.");return value.asDouble();}
 synchronized void input(String connection,JsonNode msg){
  Guest g=guests.values().stream().filter(p->connection.equals(p.connection)).findFirst().orElseThrow(Access::denied);long now=System.currentTimeMillis();if(now>=g.expires)throw Access.denied();
  if(now-g.window>=1000){g.window=now;g.count=0;}if(++g.count>25)throw new IllegalArgumentException("초당 이벤트 한도 초과");g.lastSeen=now;Room r=room(g.room);
  switch(msg.path("type").asText()){
   case "ping", "sync" -> {return;}
   case "move" -> {if(now-g.lastMove<75)return;double dx=finite(msg.path("x")),dz=finite(msg.path("z"));double length=Math.hypot(dx,dz);if(length>1.01)throw new IllegalArgumentException("이동 벡터 범위 초과");double dt=Math.min(.15,(now-g.lastMove)/1000.0);g.lastMove=now;double x=g.x+dx*3*dt,z=g.z+dz*3*dt;if(free(g,x,z)){g.x=x;g.z=z;}if(length>.01)g.direction=Math.atan2(dx,dz);}
   case "floor" -> {int f=msg.path("floor").asInt();if(f<1||f>4)throw new IllegalArgumentException("층 범위 오류");g.floor=f;spawn(g);}
   case "role" -> {String role=msg.path("role").asText();if(!Set.of("분석","인프라","대응","검증","관리자 시연").contains(role))throw new IllegalArgumentException("역할 오류");g.role=role;}
   case "chat" -> {String text=msg.path("text").asText().strip();if(text.isEmpty()||text.length()>240||now-g.lastChat<1000)throw new IllegalArgumentException("채팅은 1초 간격, 240자 이내입니다.");g.lastChat=now;r.chat.add(Map.of("id",UUID.randomUUID().toString(),"name",g.name,"text",text,"at",now));if(r.chat.size()>60)r.chat.remove(0);}
   case "inspect" -> {String node=msg.path("node").asText();TwinEngine.node(TwinEngine.initial(42),node);if(r.run!=null&&g.floor==nodeFloor(node)&&r.checks.add(g.id+":"+node)){g.contributions++;}}
   default -> throw new IllegalArgumentException("허용되지 않은 게스트 이벤트");
  }
 }
 static int nodeFloor(String id){return Set.of("gateway","lb","external-api","web-1","web-2","partner").contains(id)?2:1;}
 synchronized void cleanup(){long now=System.currentTimeMillis();tickets.entrySet().removeIf(e->e.getValue().expires()<now);guests.entrySet().removeIf(e->{Guest g=e.getValue();return now>=g.expires||(g.connection==null&&now-g.lastSeen>120_000);});rooms.entrySet().removeIf(e->!e.getValue().busy&&guests.values().stream().noneMatch(g->g.room.equals(e.getKey())));}
 synchronized Set<String> liveConnections(){cleanup();var ids=new HashSet<String>();for(Guest g:guests.values())if(g.connection!=null&&System.currentTimeMillis()-g.lastSeen<=45_000)ids.add(g.connection);return ids;}
 synchronized boolean live(String connection){return liveConnections().contains(connection);}
 synchronized String connectionRoom(String connection){return guests.values().stream().filter(g->connection.equals(g.connection)).map(g->g.room).findFirst().orElse(null);}
 public synchronized Map<String,Object> state(String id){
  Room r=room(id);refreshIncident(r);Map<String,Object> out=new LinkedHashMap<>();out.put("type","state");out.put("room",id);out.put("revision",r.revision);out.put("fictional",true);out.put("players",guests.values().stream().filter(g->g.room.equals(id)&&g.connection!=null).map(Guest::view).toList());out.put("chat",List.copyOf(r.chat));out.put("busy",r.busy);out.put("operation",r.operation);out.put("error",r.error);out.put("started",r.started);out.put("completed",r.completed);out.put("incidentLinked",r.incidentId!=null);out.put("checks",r.checks.size());out.put("incident",r.incident);
  // Only dedicated synthetic runs are public. No incident records, tokens, audit actors or approval free text.
  var run=new LinkedHashMap<String,Object>();if(r.run!=null)for(String k:List.of("id","version","status","current","baseline","faultSnapshot","propagation","analysis","generation","strategies","results","recommendation","selectedStrategy"))if(r.run.containsKey(k))run.put(k,r.run.get(k));
  if(r.run==null){run.put("status","NORMAL");run.put("current",TwinEngine.initial(42));}out.put("run",run);out.put("knowledgeId",r.knowledgeId);return out;
 }
 // Explicit administrator mapping publishes only a coarse, anonymous visualization.
 // Titles, observations, people, approval text and AI evidence remain behind existing auth.
 private void refreshIncident(Room r){
  if(r.incidentId==null||System.currentTimeMillis()-r.refreshed<1000)return;
  r.refreshed=System.currentTimeMillis();
  Map<String,Object> next=store.tx(()->{
   var i=store.one("SELECT status,version,deleted_at,mode,decision_json FROM incidents WHERE id=? FOR UPDATE",r.incidentId);
   String status=i.get("status").toString();boolean stopped=i.get("deleted_at")!=null||status.equals("CANCELLED");
   var events=store.db.queryForList("SELECT id,stage,state FROM events WHERE incident_id=? ORDER BY id",r.incidentId);
   boolean approved=store.db.queryForObject("SELECT COUNT(*) FROM approvals WHERE incident_id=? AND approved=TRUE",Integer.class,r.incidentId)>0;
   var latest=new LinkedHashMap<String,String>();for(var e:events)latest.put(e.get("stage").toString(),e.get("state").toString());
   String stage=switch(status){case "REGISTERED"->"FAULT";case "ANALYZING","NEEDS_REVIEW"->"ANALYSIS";case "WAITING_APPROVAL","REJECTED"->"APPROVAL";case "RECOVERING"->approved?(latest.containsKey("VERIFY")?"VERIFY":"RECOVERY"):"APPROVAL";case "RESOLVED","CLOSED"->approved&&"COMPLETED".equals(latest.get("VERIFY"))?"COMPLETE":"VERIFY";case "FAILED"->"FAILED";default->"FAULT";};
   if(stopped)stage="STOPPED";
   var steps=List.of("RECOVERY","MCP_ACTION","VERIFY","REPORT","SKILL_DRAFT","HISTORY");
   var completed=steps.stream().filter(s->"COMPLETED".equals(latest.get(s))).toList();
   var decision=store.json.valueToTree(store.decode(i.get("decision_json")));
   var value=new LinkedHashMap<String,Object>();value.put("status",status);value.put("stage",stage);value.put("node",r.mappedNode);value.put("version",i.get("version"));value.put("eventId",events.isEmpty()?0:events.get(events.size()-1).get("id"));value.put("approved",approved);value.put("completedSteps",completed);value.put("totalSteps",steps.size());value.put("timeline",events.stream().skip(Math.max(0,events.size()-20)).toList());value.put("aiSource",decision==null||decision.isNull()?"PENDING":decision.path("fallback").asBoolean()?"MOCK_FALLBACK":decision.path("simulated").asBoolean()?"DEMO":"MODEL_RESPONSE");return value;
  });
  if(!Objects.equals(r.incident,next)){r.incident=next;r.revision++;}
 }
 public synchronized Map<String,Object> context(String id){enabled();admin();Room r=room(id);var out=new LinkedHashMap<String,Object>();out.put("incidentId",r.incidentId);out.put("mappedNode",r.mappedNode);return out;}
 public Map<String,Object> command(String id,String op,Map<String,Object> body){
  enabled();admin();Room r;
  synchronized(this){r=room(id);if(r.busy)throw new IllegalStateException("이 방에서 작업이 실행 중입니다.");if(r.incidentId!=null&&!Set.of("link","unlink").contains(op))throw new IllegalStateException("연결 장애는 기존 장애 화면에서 처리하세요. 독립 실험은 연결 해제 후 가능합니다.");if(!(body.get("revision") instanceof Number n)||n.longValue()!=r.revision)throw new IllegalStateException("상태가 변경되었습니다. 최신 상태에서 다시 실행하세요.");r.busy=true;r.operation=op;r.error="";r.revision++;}
  try{
   if(op.equals("link")){String incident=Objects.toString(body.get("incidentId"),"");String node=Objects.toString(body.get("node"),"");TwinEngine.node(TwinEngine.initial(42),node);var i=store.incident(incident);if(i.get("deleted_at")!=null)throw new IllegalArgumentException("삭제된 장애입니다.");synchronized(this){r.incidentId=incident;r.mappedNode=node;persist(r);}store.audit(incident,Access.actor(),"WAR_ROOM_LINK",Map.of("room",id,"node",node,"basis","관리자 지정 시연 매핑; 자동 온톨로지 추론 아님"));}
   else if(op.equals("unlink")){synchronized(this){r.incidentId=null;r.mappedNode=null;r.incident=null;r.refreshed=0;persist(r);}}
   else if(op.equals("knowledge")){
    if(r.run==null||!"APPROVED".equals(r.run.get("status")))throw new IllegalStateException("승인한 가상 검증 결과만 지식 초안으로 저장할 수 있습니다.");
    if(r.knowledgeId==null){String skill=store.tx(()->{var draft=store.json.valueToTree(knowledge.create(Map.of("title","워룸 합성 복구 기록 · "+r.runId,"type","APPLICATION","conditions","독립 합성 TwinEngine 실험 "+r.runId,"symptoms",store.encode(r.run.get("analysis")),"checks",store.encode(Map.of("runId",r.runId,"strategyId",r.run.get("selectedStrategy"),"status",r.run.get("status"))),"solution","승인 전략: "+r.run.get("selectedStrategy")+". 원본 실험 보고서에서 단계별 결과와 잔여 위험을 확인하세요.","cautions","합성 모델 결과. 운영 성공률이나 AI 정확도가 아닙니다. 관리자 검토 후에만 검색에 공개됩니다.","assetIds",List.of())));String value=draft.path("id").asText();store.db.update("UPDATE war_rooms SET knowledge_id=?,updated_at=? WHERE id=?",value,Store.now(),r.id);return value;});synchronized(this){r.knowledgeId=skill;}}
   }
   else if(op.equals("start")){
    String scenario=Objects.toString(body.get("scenario"),"");String fault,target;
    switch(scenario){case "BATCH"->{fault="QUEUE_FAILURE";target="mq";}case "DATABASE"->{fault="DB_CONNECTION";target="db-primary";}case "API"->{fault="API_LATENCY";target="gateway";}default->throw new IllegalArgumentException("시나리오 오류");}
    Map<String,Object> run=lab.create(42);synchronized(this){r.runId=run.get("id").toString();r.run=run;persist(r);r.knowledgeId=null;store.db.update("UPDATE war_rooms SET knowledge_id=NULL WHERE id=?",id);r.started=System.currentTimeMillis();r.completed=0;r.checks.clear();guests.values().stream().filter(g->g.room.equals(id)).forEach(g->g.contributions=0);}
    run=lab.command(r.runId,"inject",Map.of("version",run.get("version"),"faults",List.of(Map.of("type",fault,"target",target,"intensity",1,"duration",300,"start",0))));synchronized(this){r.run=run;}
   }else{
    if(r.runId==null)throw new IllegalStateException("시나리오를 먼저 시작하세요.");if(!Set.of("analyze","strategies","simulate","request","decision","reset").contains(op))throw new IllegalArgumentException("지원하지 않는 작업");
    var args=new LinkedHashMap<String,Object>();args.put("version",r.run.get("version"));args.put("mode",body.getOrDefault("mode","DEMO"));args.put("provider",body.getOrDefault("provider","LOCAL"));
    for(String k:List.of("strategyId","approved","reason"))if(body.containsKey(k))args.put(k,body.get(k));
    Map<String,Object> run=lab.command(r.runId,op,args);synchronized(this){r.run=run;if(op.equals("decision")&&"APPROVED".equals(run.get("status")))r.completed=System.currentTimeMillis();if(op.equals("reset")){r.started=0;r.completed=0;r.checks.clear();r.knowledgeId=null;store.db.update("UPDATE war_rooms SET knowledge_id=NULL WHERE id=?",id);}}
   }
  }catch(RuntimeException e){synchronized(this){if(r.runId!=null)r.run=loadRun(r.runId);r.error="작업을 완료하지 못했습니다. 진행자가 최신 상태를 확인하고 재시도하세요.";}throw e;}
  finally{synchronized(this){r.busy=false;r.operation="";r.revision++;}}
  synchronized(this){return state(id);}
 }
}
