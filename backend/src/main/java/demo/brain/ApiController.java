package demo.brain;
import org.springframework.web.bind.annotation.*;
import org.springframework.http.*;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.env.Environment;
import jakarta.annotation.PreDestroy;
import java.util.*;
import java.util.concurrent.*;
import java.time.LocalDate;
@RestController
@RequestMapping("/api")
public class ApiController {
 private final Store s;private final Harness h;private final Ontology graph;private final JevRouter jev;private final EvaluationService eval;private final Reports reports;private final Environment env;private final String defaultProvider;private final KnowledgeEngine knowledge;private final HermesSkillPublisher publisher;
 @org.springframework.beans.factory.annotation.Autowired private AccountService accounts;
 private final ScheduledExecutorService streams=Executors.newScheduledThreadPool(2);
 @Value("${brain.sse-timeout-ms:240000}") private long streamTimeout;
 public ApiController(Store s,Harness h,Ontology graph,JevRouter jev,EvaluationService eval,Reports reports,Environment env,KnowledgeEngine knowledge,HermesSkillPublisher publisher,@Value("${brain.jev.provider}") String defaultProvider){this.s=s;this.h=h;this.graph=graph;this.jev=jev;this.eval=eval;this.reports=reports;this.env=env;this.knowledge=knowledge;this.publisher=publisher;this.defaultProvider=defaultProvider;}
 @GetMapping("/health") public Object health(){s.db.queryForObject("SELECT 1",Integer.class);return Map.of("status","UP","fictional",true,"graph",graph.status());}
 @GetMapping("/config") public Object config(){return Map.of("defaultProvider",defaultProvider,"cloudConfigured",jev.cloudConfigured(),"database",env.getProperty("spring.datasource.url","").startsWith("jdbc:h2")?"H2 DEVELOPMENT":"POSTGRESQL","graph",graph.status(),"hermes",knowledge.status(),"hermesExportConfigured",publisher.configured(),"a2a","0.3.0","fictional",true,"user",Access.current().view());}
 @GetMapping("/catalog") public Object catalog(){return Map.of("assets",graph.nodes(),"operators",s.db.queryForList("SELECT * FROM operators ORDER BY id"),"scenarios",s.db.queryForList("SELECT id,asset_id,title,observations FROM scenarios ORDER BY id"),"manuals",s.db.queryForList("SELECT * FROM manuals ORDER BY id"));}
 @GetMapping("/graph") public Object graph(){return Map.of("nodes",graph.nodes(),"edges",graph.edges(),"engine",graph.status());}
 private List<Map<String,Object>> filtered(String type,String system,String from,String to,String query){LocalDate.parse(from);LocalDate end=LocalDate.parse(to).plusDays(1);return s.db.queryForList("SELECT i.*,a.name asset_name,a.system_id,s.name system_name,o.name owner_name FROM incidents i JOIN assets a ON a.id=i.asset_id LEFT JOIN assets s ON s.id=a.system_id JOIN operators o ON o.id=i.owner_id WHERE (?='' OR i.type=?) AND (?='' OR a.system_id=?) AND i.created_at>=CAST(? AS DATE) AND i.created_at<CAST(? AS DATE) AND LOWER(i.title) LIKE ? ORDER BY i.created_at DESC",type,type,system,system,from,end.toString(),"%"+query.toLowerCase(Locale.ROOT)+"%");}
 @GetMapping("/incidents") public Object incidents(@RequestParam(defaultValue="") String type,@RequestParam(defaultValue="") String system,@RequestParam(defaultValue="2000-01-01") String from,@RequestParam(defaultValue="2100-01-01") String to,@RequestParam(defaultValue="") String query){return filtered(type,system,from,to,query);}
 @GetMapping("/dashboard") public Object dashboard(@RequestParam(defaultValue="") String type,@RequestParam(defaultValue="") String system,@RequestParam(defaultValue="2000-01-01") String from,@RequestParam(defaultValue="2100-01-01") String to){var rows=filtered(type,system,from,to,"");int active=0,critical=0,recur=0,resolved=0;double minutes=0;Map<String,Integer> byType=new TreeMap<>(),byDay=new TreeMap<>(),bySystem=new TreeMap<>();for(var i:rows){String state=i.get("status").toString();if(!List.of("CLOSED","RESOLVED","REJECTED").contains(state)){active++;if(i.get("severity").equals("P1"))critical++;}var d=s.json.valueToTree(s.decode(i.get("decision_json")));if(d.path("recurrence").asBoolean())recur++;if(i.get("resolved_at")!=null){minutes+=(((java.sql.Timestamp)i.get("resolved_at")).getTime()-((java.sql.Timestamp)i.get("created_at")).getTime())/60000.0;resolved++;}byType.merge(i.get("type").toString(),1,Integer::sum);bySystem.merge(String.valueOf(i.get("system_name")),1,Integer::sum);byDay.merge(i.get("created_at").toString().substring(0,10),1,Integer::sum);}
  return Map.of("total",rows.size(),"active",active,"critical",critical,"mttrMinutes",resolved==0?0:Math.round(minutes/resolved*10)/10.0,"recurrenceRate",rows.isEmpty()?0:Math.round(recur*1000.0/rows.size())/10.0,"byType",byType,"byDay",byDay,"bySystem",bySystem,"systemStatus",s.db.queryForList("SELECT a.id,a.name,COUNT(i.id) active FROM assets a LEFT JOIN assets c ON c.system_id=a.id LEFT JOIN incidents i ON i.asset_id=c.id AND i.status IN ('REGISTERED','ANALYZING','NEEDS_REVIEW','WAITING_APPROVAL','RECOVERING','FAILED') WHERE a.kind='SYSTEM' GROUP BY a.id,a.name ORDER BY a.id"));}
 @GetMapping("/incidents/{id}") public Object detail(@PathVariable String id){var i=s.incident(id);i.put("decision",s.decode(i.remove("decision_json")));i.put("impact",s.decode(i.remove("impact_json")));i.put("report",s.decode(i.remove("report_json")));i.put("events",s.db.queryForList("SELECT * FROM events WHERE incident_id=? ORDER BY id",id));i.put("tasks",s.db.queryForList("SELECT * FROM agent_tasks WHERE incident_id=? ORDER BY created_at",id));i.put("audit",Access.current().admin()?s.db.queryForList("SELECT * FROM audit WHERE incident_id=? ORDER BY id",id):List.of());i.put("canEdit",Access.current().admin()||Access.current().operatorId().equals(i.get("owner_id")));return i;}
 @PostMapping("/simulate") public Object simulate(@RequestBody Map<String,String> body){return Map.of("id",h.create(body.getOrDefault("scenarioId","SCN-01"),body.getOrDefault("mode","REAL"),body.getOrDefault("provider",defaultProvider),null,null,null,"OP-01"));}
 @PostMapping("/incidents") public Object create(@RequestBody Map<String,String> b){return Map.of("id",h.create(null,b.getOrDefault("mode","REAL"),b.getOrDefault("provider",defaultProvider),b.get("title"),b.get("assetId"),b.get("observations"),Access.current().admin()?b.getOrDefault("ownerId","OP-01"):Access.current().operatorId()));}
 @PatchMapping("/incidents/{id}") public Object update(@PathVariable String id,@RequestBody Map<String,String> b){
  var me=Access.current();
  s.tx(()->{var i=s.one("SELECT * FROM incidents WHERE id=? FOR UPDATE",id);
   if(!me.admin()&&(!me.operatorId().equals(i.get("owner_id"))||!Set.of("notes","prevention").containsAll(b.keySet())))throw Access.denied();
   if(!List.of("RESOLVED","CLOSED","WAITING_APPROVAL","NEEDS_REVIEW","FAILED").contains(i.get("status")))throw new IllegalStateException("실행 중에는 편집할 수 없습니다.");
   String title=b.getOrDefault("title",i.get("title").toString()),notes=b.getOrDefault("notes",i.get("notes").toString()),prevention=b.getOrDefault("prevention",i.get("prevention").toString());
   Harness.text(title,200,"제목");if(notes==null||prevention==null||notes.length()>4000||prevention.length()>4000)throw new IllegalArgumentException("최대 4000자");
   String owner=b.getOrDefault("ownerId",i.get("owner_id").toString());s.one("SELECT id FROM operators WHERE id=?",owner);
   s.db.update("UPDATE incidents SET title=?,notes=?,prevention=?,owner_id=?,version=version+1 WHERE id=?",title,notes,prevention,owner,id);s.audit(id,Access.actor(),"EDIT",b);return null;});return detail(id);
 }
 @PostMapping("/incidents/{id}/review") public Object review(@PathVariable String id,@RequestBody Map<String,String> b){h.review(id,b.get("type"),b.get("severity"),b.get("department"),b.get("reason"));return Map.of("accepted",true);}
 @PostMapping("/incidents/{id}/approval") public Object approval(@PathVariable String id,@RequestBody Map<String,Object> b){if(!(b.get("approved") instanceof Boolean))throw new IllegalArgumentException("approved boolean required");h.approve(id,(Boolean)b.get("approved"),Objects.toString(b.get("reason"),""));return Map.of("accepted",true);}
 @PostMapping("/incidents/{id}/retry") public Object retry(@PathVariable String id){h.retry(id);return Map.of("accepted",true);}
 @PostMapping("/incidents/{id}/close") public Object close(@PathVariable String id){s.tx(()->{var i=s.incident(id);Harness.text(i.get("notes").toString(),4000,"조치 후기");Harness.text(i.get("prevention").toString(),4000,"재발 방지");s.transition(id,"RESOLVED","CLOSED");s.audit(id,Access.actor(),"CLOSE",Map.of());s.event(id,"CLOSE","COMPLETED","장애 종료",Map.of());return null;});return Map.of("closed",true);}
 @GetMapping("/skills") public Object skills(){return s.db.queryForList("SELECT * FROM skills WHERE (?=TRUE OR status='APPROVED') ORDER BY CASE WHEN status='DRAFT' THEN 0 ELSE 1 END,created_at DESC,id",Access.current().admin());}
 @PostMapping("/skills/{id}/review") public Object skillReview(@PathVariable String id,@RequestBody Map<String,String> b){String status=b.getOrDefault("status","");if(!List.of("APPROVED","REJECTED").contains(status))throw new IllegalArgumentException("Invalid status");s.tx(()->{if(s.db.update("UPDATE skills SET status=?,approved_by=? WHERE id=? AND status='DRAFT'",status,Access.actor(),id)!=1)throw new IllegalStateException("초안만 승인 또는 거부할 수 있습니다.");s.audit(null,Access.actor(),"SKILL_"+status,Map.of("skillId",id));return null;});return Map.of("status",status,"export",status.equals("APPROVED")?publisher.publish(id):Map.of("status","NOT_EXPORTED"));}
 @PostMapping("/hermes/sync") public Object syncHermes(@RequestParam(defaultValue="") String after,@RequestParam(defaultValue="5") int limit){return publisher.sync(after,limit);}
 @GetMapping("/evaluations") public Object evaluations(@RequestParam(required=false) Integer page){if(page==null)return s.db.queryForList("SELECT * FROM evaluations ORDER BY created_at DESC,id DESC LIMIT 20");var result=historyPage("evaluations","created_at DESC,id DESC",page);result.put("running",s.db.queryForObject("SELECT COUNT(*) FROM evaluations WHERE status='RUNNING'",Integer.class)>0);return result;}
 @PostMapping("/evaluations") public Object evaluate(@RequestBody Map<String,String> b){return Map.of("id",eval.start(b.getOrDefault("mode","DEMO"),b.getOrDefault("provider","MOCK")));}
 @GetMapping("/audit") public Object audit(@RequestParam(required=false) Integer page){return page==null?s.db.queryForList("SELECT * FROM audit ORDER BY id DESC LIMIT 300"):historyPage("audit","id DESC",page);}
 private Map<String,Object> historyPage(String table,String order,int requested){
  if(requested<1)throw new IllegalArgumentException("페이지는 1 이상이어야 합니다.");
  int total=s.db.queryForObject("SELECT COUNT(*) FROM "+table,Integer.class),pages=Math.max(1,(int)Math.ceil(total/10.0)),page=Math.min(requested,pages);
  var result=new LinkedHashMap<String,Object>();result.put("items",s.db.queryForList("SELECT * FROM "+table+" ORDER BY "+order+" LIMIT 10 OFFSET ?",(page-1)*10));result.put("total",total);result.put("page",page);result.put("pageSize",10);return result;
 }
 @GetMapping("/incidents/{id}/report/{format}") public ResponseEntity<byte[]> report(@PathVariable String id,@PathVariable String format)throws Exception{byte[] data;if(format.equals("pdf"))data=reports.pdf(id);else if(format.equals("xlsx"))data=reports.xlsx(id,Access.current().admin());else throw new IllegalArgumentException("pdf or xlsx required");return ResponseEntity.ok().header("Content-Disposition","attachment; filename=\""+id+"."+format+"\"").contentType(MediaType.parseMediaType(format.equals("pdf")?"application/pdf":"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")).body(data);}
 @GetMapping(value="/incidents/{id}/events",produces=MediaType.TEXT_EVENT_STREAM_VALUE)
 public SseEmitter stream(@PathVariable String id,@RequestParam(defaultValue="0") long cursor,@RequestHeader(value="Last-Event-ID",required=false) String last){
  s.incident(id);var streamIdentity=Access.current();
  // End cleanly before the Vercel BFF budget; EventSource reconnects with Last-Event-ID.
  long duration=Math.max(1000,Math.min(streamTimeout,240000));
  var emitter=new SseEmitter(duration+5000);long[] c={last==null?cursor:Long.parseLong(last)};
  long deadline=System.nanoTime()+TimeUnit.MILLISECONDS.toNanos(duration);
  ScheduledFuture<?>[] task={null};
  task[0]=streams.scheduleWithFixedDelay(()->{try{
   if(System.nanoTime()>=deadline||!accounts.active(streamIdentity)){emitter.complete();return;}
   var rows=s.db.queryForList("SELECT * FROM events WHERE incident_id=? AND id>? ORDER BY id",id,c[0]);
   for(var r:rows){emitter.send(SseEmitter.event().id(r.get("id").toString()).name("stage").data(r));c[0]=((Number)r.get("id")).longValue();}
   if(rows.isEmpty())emitter.send(SseEmitter.event().comment("heartbeat"));
  }catch(Exception e){emitter.complete();if(task[0]!=null)task[0].cancel(false);}},100,750,TimeUnit.MILLISECONDS);
  Runnable cancel=()->{if(task[0]!=null)task[0].cancel(false);};
  emitter.onCompletion(cancel);emitter.onTimeout(()->{cancel.run();emitter.complete();});emitter.onError(e->cancel.run());return emitter;
 }
 @PreDestroy void close(){streams.shutdownNow();}
}
