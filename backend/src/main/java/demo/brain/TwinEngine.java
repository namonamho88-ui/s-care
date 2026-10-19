package demo.brain;

import java.util.*;

/** Pure, deterministic synthetic model. No network, database, shell or clock access. */
public final class TwinEngine {
 public static final String VERSION="synthetic-twin-v1";
 public enum FaultType {SERVER_DOWN,CPU_OVERLOAD,MEMORY_PRESSURE,DB_CONNECTION,DB_PRIMARY,REDIS_FAILURE,NETWORK_LATENCY,NETWORK_PARTITION,API_LATENCY,TRAFFIC_SPIKE,QUEUE_FAILURE}
 public enum ActionType {RESTART,SCALE_OUT,FENCE_PRIMARY,PROMOTE_REPLICA,SWITCH_DATABASE,BYPASS_CACHE,READ_ONLY,REPAIR_NETWORK,THROTTLE}
 public record Fault(FaultType type,String target,double intensity,int duration,int start) {}
 public record Action(ActionType type,String target) {}
 public record Node(String id,String name,String kind,double cpu,double memory,double latency,double errorRate,double availability,double throughput,String status,int lagSeconds,boolean promotable) {}
 public record Edge(String source,String target,String relation,String group) {}
 public record Snapshot(long seed,int time,String writer,boolean fenced,boolean readOnly,boolean cacheBypass,boolean scaled,boolean throttled,List<Fault> faults,List<Node> nodes,List<Edge> edges) {}
 public record Strategy(String id,String name,String goal,String preconditions,String expectedEffect,String risk,String consistency,String rollback,List<Action> actions) {}
 public record Step(int second,String action,String target,boolean applied,String reason,Snapshot snapshot) {}
 public record Result(String strategyId,String outcome,int recoverySeconds,double availability,double latency,double errorRate,int affected,int residualRisk,int dataRisk,int complexity,List<Step> steps,Snapshot after) {}
 private TwinEngine(){}
 public static Snapshot initial(long seed){return calculate(new Snapshot(seed,0,"db-primary",false,false,false,false,false,List.of(),List.of(),List.of()));}
 public static Snapshot inject(Snapshot s,List<Fault> faults){
  if(faults==null||faults.isEmpty()||faults.size()>5)throw new IllegalArgumentException("1~5개 가상 장애를 지정하세요.");
  for(var f:faults){node(s,f.target());if(f.type()==null||!Double.isFinite(f.intensity())||f.intensity()<.1||f.intensity()>1||f.duration()<10||f.duration()>3600||f.start()!=s.time())throw new IllegalArgumentException("강도 0.1~1, 지속 시간 10~3600초가 필요합니다.");
   String kind=node(s,f.target()).kind();if((f.type()==FaultType.DB_PRIMARY&&!f.target().equals("db-primary"))||(f.type()==FaultType.DB_CONNECTION&&!kind.equals("DATABASE"))||(f.type()==FaultType.REDIS_FAILURE&&!kind.equals("CACHE"))||(f.type()==FaultType.QUEUE_FAILURE&&!kind.equals("QUEUE")))throw new IllegalArgumentException("장애 유형과 대상 종류가 일치하지 않습니다.");}
  var all=new ArrayList<>(s.faults());all.addAll(faults);if(all.size()>5)throw new IllegalArgumentException("복합 장애는 최대 5개입니다.");return calculate(copy(s,s.time(),s.writer(),s.fenced(),s.readOnly(),s.cacheBypass(),s.scaled(),s.throttled(),all));
 }
 public static Snapshot advance(Snapshot s,int seconds){if(seconds<0||seconds>3600)throw new IllegalArgumentException("시간 범위 초과");return calculate(copy(s,s.time()+seconds,s.writer(),s.fenced(),s.readOnly(),s.cacheBypass(),s.scaled(),s.throttled(),s.faults()));}
 public static Snapshot stop(Snapshot s){return calculate(copy(s,s.time(),"db-primary",false,false,false,false,false,List.of()));}
 private static Snapshot copy(Snapshot s,int t,String writer,boolean fenced,boolean ro,boolean cache,boolean scaled,boolean throttle,List<Fault> faults){return new Snapshot(s.seed(),t,writer,fenced,ro,cache,scaled,throttle,List.copyOf(faults),List.of(),List.of());}
 public static Node node(Snapshot s,String id){return s.nodes().stream().filter(n->n.id().equals(id)).findFirst().orElseThrow(()->new IllegalArgumentException("알 수 없는 가상 노드: "+id));}
 private static List<Edge> edges(String writer,boolean ro,boolean cache){var e=new ArrayList<Edge>();
  e.add(new Edge("external-api","gateway","DEPENDS_ON","all"));e.add(new Edge("gateway","lb","DEPENDS_ON","all"));
  for(int w=1;w<=2;w++){e.add(new Edge("lb","web-"+w,"DEPENDS_ON","web-pool"));for(int a=1;a<=3;a++)e.add(new Edge("web-"+w,"app-"+a,"DEPENDS_ON","app-pool"));}
  for(int a=1;a<=3;a++){e.add(new Edge("app-"+a,ro?"db-replica":writer,"DEPENDS_ON","all"));if(!cache)e.add(new Edge("app-"+a,"redis","OPTIONAL","all"));e.add(new Edge("app-"+a,"mq","OPTIONAL","all"));e.add(new Edge("app-"+a,"partner","DEPENDS_ON","all"));}
  e.add(new Edge("db-primary","db-replica","REPLICATES_TO","replication"));return List.copyOf(e);
 }
 private static Node base(long seed,String id,String name,String kind){var r=new Random(seed^id.hashCode());return new Node(id,name,kind,20+r.nextInt(10),35+r.nextInt(10),8+r.nextInt(10),0,100,60,"HEALTHY",id.equals("db-replica")?r.nextInt(4):0,true);}
 public static Snapshot calculate(Snapshot s){return calculate(s,null);}
 public static List<Snapshot> propagation(Snapshot s){var frames=new ArrayList<Snapshot>();calculate(s,frames);return List.copyOf(frames);}
 private static Snapshot calculate(Snapshot s,List<Snapshot> frames){
  var nodes=new LinkedHashMap<String,Node>();
  for(String[] def:new String[][]{{"db-primary","PostgreSQL Primary","DATABASE"},{"db-replica","PostgreSQL Replica","DATABASE"},{"redis","Redis Cache","CACHE"},{"mq","Message Queue","QUEUE"},{"partner","외부 연계 시스템","EXTERNAL"},{"app-1","Application 01","APP"},{"app-2","Application 02","APP"},{"app-3","Application 03","APP"},{"web-1","Web Server 01","WEB"},{"web-2","Web Server 02","WEB"},{"lb","Load Balancer","LB"},{"gateway","API Gateway","GATEWAY"},{"external-api","External API","API"}})nodes.put(def[0],base(s.seed(),def[0],def[1],def[2]));
  var active=s.faults().stream().filter(f->s.time()>=f.start()&&s.time()<f.start()+f.duration()).toList();
  for(var f:active){var n=nodes.get(f.target());if(n==null)throw new IllegalArgumentException("Unknown node");double cpu=n.cpu(),mem=n.memory(),lat=n.latency(),av=n.availability();int lag=n.lagSeconds();boolean eligible=n.promotable();double v=f.intensity();
   switch(f.type()){
    case SERVER_DOWN,NETWORK_PARTITION,DB_PRIMARY,DB_CONNECTION,REDIS_FAILURE,QUEUE_FAILURE->{av=0;lat=3000;if(n.id().equals("db-replica"))eligible=false;}
    case CPU_OVERLOAD->{cpu=Math.min(100,cpu+v*85);av*=1-Math.max(0,cpu-80)/45;lat+=v*900;}
    case MEMORY_PRESSURE->{mem=Math.min(100,mem+v*70);av*=1-Math.max(0,mem-85)/25;lat+=v*600;if(n.kind().equals("DATABASE")){lag+=(int)(v*30);eligible=mem<95;}}
    case NETWORK_LATENCY,API_LATENCY->{lat+=v*2000;av*=1-v*.18;if(n.id().equals("db-replica"))lag+=(int)(v*40);}
    case TRAFFIC_SPIKE->{cpu=Math.min(100,cpu+v*50);lat+=v*150;}
   }
   nodes.put(n.id(),metrics(n,cpu,mem,lat,av,60*av/100,lag,eligible));
  }
  var links=edges(s.writer(),s.readOnly(),s.cacheBypass());
  if(frames!=null)frames.add(frame(s,nodes,links));
  // Topological evaluation: dependencies appear before their callers. Pool capacity prevents
  // a single failed redundant member from taking down every caller.
  double traffic=active.stream().filter(f->f.type()==FaultType.TRAFFIC_SPIKE).mapToDouble(f->f.intensity()*3).sum()+1;
  if(s.throttled())traffic=Math.min(1.2,traffic);
  for(var old:new ArrayList<>(nodes.values())){
   var deps=links.stream().filter(e->e.source().equals(old.id())&&!e.relation().equals("REPLICATES_TO")).toList();
   double av=old.availability(),lat=old.latency(),cpu=old.cpu();var groups=new LinkedHashMap<String,List<Edge>>();for(var e:deps)groups.computeIfAbsent(e.group(),k->new ArrayList<>()).add(e);
   for(var group:groups.entrySet()){
    if(!group.getKey().equals("all")){
     double capacity=group.getValue().stream().mapToDouble(e->nodes.get(e.target()).availability()/100*(group.getKey().equals("web-pool")?100:50)*(s.scaled()?1.8:1)).sum();
     double fulfilled=Math.min(1,capacity/(60*traffic));av*=fulfilled;
     var alive=group.getValue().stream().map(e->nodes.get(e.target())).filter(n->n.availability()>0).toList();
     lat+=alive.stream().mapToDouble(Node::latency).average().orElse(3000);cpu=Math.min(100,cpu+20*traffic/Math.max(1,alive.size()));
    }else for(var e:group.getValue()){var dependency=nodes.get(e.target());double availability=dependency.availability()/100;av*=e.relation().equals("OPTIONAL")?.85+.15*availability:availability;lat+=dependency.latency()*(e.relation().equals("OPTIONAL")?.2:1);}
   }
   if(old.id().equals("external-api")&&s.readOnly())av*=.7; // Read-only preserves reads, deliberately loses the 30% write workload.
   nodes.put(old.id(),metrics(old,cpu,old.memory(),lat,av,60*traffic*av/100,old.lagSeconds(),old.promotable()));
   if(frames!=null&&!deps.isEmpty())frames.add(frame(s,nodes,links));
  }
  return new Snapshot(s.seed(),s.time(),s.writer(),s.fenced(),s.readOnly(),s.cacheBypass(),s.scaled(),s.throttled(),List.copyOf(s.faults()),List.copyOf(nodes.values()),links);
 }
 private static Snapshot frame(Snapshot s,Map<String,Node> nodes,List<Edge> edges){return new Snapshot(s.seed(),s.time(),s.writer(),s.fenced(),s.readOnly(),s.cacheBypass(),s.scaled(),s.throttled(),s.faults(),List.copyOf(nodes.values()),edges);}
 private static double round(double x){return Math.round(x*100)/100.0;}
 private static Node metrics(Node n,double cpu,double memory,double latency,double availability,double throughput,int lag,boolean eligible){double av=Math.max(0,Math.min(100,availability));return new Node(n.id(),n.name(),n.kind(),round(cpu),round(memory),round(latency),round(100-av),round(av),round(throughput),av<50?"FAILED":av<99||latency>800||cpu>85||memory>90?"WARNING":"HEALTHY",lag,eligible);}
 public static List<Strategy> strategies(Snapshot s){String target=s.faults().isEmpty()?"db-primary":s.faults().get(0).target();return List.of(
  new Strategy("restart","A · 장애 구성요소 재시작","빠른 서비스 재개","일시 장애이며 영구 손상이 아님","일시 장애 제거","지속 장애는 재발·실패 가능","DB 재시작은 복구 로그 재생을 가정","기존 스냅샷으로 복원",s.faults().stream().map(Fault::target).distinct().map(id->new Action(ActionType.RESTART,id)).toList()),
  new Strategy("failover","B · 이중화 전환·용량 확보","안정성 우선","Replica 정상·동기 지연 ≤5초·승격 가능, 이전 Primary fencing","정상 Replica와 여유 용량으로 서비스 전환","Replica 조건 불충족 시 실패","동기 지연이 남으면 데이터 손실 위험","승격 이전 스냅샷 복원 후 원본 검증",List.of(new Action(ActionType.FENCE_PRIMARY,"db-primary"),new Action(ActionType.PROMOTE_REPLICA,"db-replica"),new Action(ActionType.SWITCH_DATABASE,"db-replica"),new Action(ActionType.SCALE_OUT,"app-1"),new Action(ActionType.BYPASS_CACHE,"redis"))),
  new Strategy("protect","C · 읽기 전용·트래픽 제한","데이터 보호 우선","읽기용 Replica 정상·지연 ≤5초","조회 유지, 쓰기 30% 제한","기능 제한으로 부분 복구","쓰기 차단으로 정합성 보호","읽기 전용·유입 제한 해제 후 스냅샷 복원",List.of(new Action(ActionType.READ_ONLY,"db-replica"),new Action(ActionType.THROTTLE,"gateway"),new Action(ActionType.BYPASS_CACHE,"redis"),new Action(ActionType.REPAIR_NETWORK,target))));}
 public static void validate(Strategy st,Snapshot s){if(st==null||st.id()==null||st.name()==null||st.name().isBlank()||st.actions()==null||st.actions().isEmpty()||st.actions().size()>10)throw new IllegalArgumentException("1~10개 허용 액션이 필요합니다.");for(var a:st.actions()){if(a.type()==null)throw new IllegalArgumentException("허용되지 않은 액션");var n=node(s,a.target());boolean ok=switch(a.type()){case FENCE_PRIMARY->a.target().equals("db-primary");case PROMOTE_REPLICA,SWITCH_DATABASE,READ_ONLY->a.target().equals("db-replica");case BYPASS_CACHE->n.kind().equals("CACHE");case SCALE_OUT->List.of("APP","WEB").contains(n.kind());case THROTTLE->a.target().equals("gateway");default->true;};if(!ok)throw new IllegalArgumentException("액션 대상 종류 불일치");}}
 public static Result simulate(Snapshot initial,Strategy strategy){validate(strategy,initial);Snapshot current=calculate(initial);var steps=new ArrayList<Step>();int seconds=0,dataRisk=0;boolean promoted=false;
  for(var action:strategy.actions()){
   var n=node(current,action.target());String reason="가상 액션 조건 충족";boolean applied=true;var faults=new ArrayList<>(current.faults());String writer=current.writer();boolean fenced=current.fenced(),ro=current.readOnly(),cache=current.cacheBypass(),scaled=current.scaled(),throttle=current.throttled();
   int cost=switch(action.type()){case RESTART->35;case FENCE_PRIMARY->10;case PROMOTE_REPLICA->20;case SWITCH_DATABASE->10;case SCALE_OUT->25;default->8;};
   switch(action.type()){
    case RESTART->{boolean permanent=faults.stream().anyMatch(f->f.target().equals(n.id())&&f.type()==FaultType.DB_PRIMARY&&f.intensity()>=.8&&initial.time()<f.start()+f.duration());if(permanent){applied=false;reason="지속 Primary 장애: 재시작으로 저장소 손상을 해소할 수 없음";}else faults.removeIf(f->f.target().equals(n.id())&&!Set.of(FaultType.NETWORK_PARTITION,FaultType.NETWORK_LATENCY,FaultType.TRAFFIC_SPIKE).contains(f.type()));}
    case FENCE_PRIMARY->fenced=true;
    case PROMOTE_REPLICA->{if(!fenced||n.availability()<99||!n.promotable()||n.lagSeconds()>5){applied=false;reason="승격 거부: fencing·Replica 상태·동기 지연 조건 미충족";}else {promoted=true;dataRisk=n.lagSeconds()*5;}}
    case SWITCH_DATABASE->{if(!promoted){applied=false;reason="연결 전환 거부: 이 실행에서 Replica 승격이 확인되지 않음";}else writer="db-replica";}
    case READ_ONLY->{if(n.availability()<99||n.lagSeconds()>5){applied=false;reason="읽기 우회 실패: Replica 상태 또는 동기 지연 조건 미충족";}else ro=true;}
    case BYPASS_CACHE->cache=true;
    case SCALE_OUT->scaled=true;
    case THROTTLE->throttle=true;
    case REPAIR_NETWORK->faults.removeIf(f->f.target().equals(n.id())&&Set.of(FaultType.NETWORK_PARTITION,FaultType.NETWORK_LATENCY,FaultType.API_LATENCY).contains(f.type()));
   }
   seconds+=cost;
   // All strategies share the exact fault snapshot and freeze fault expiry during comparison:
   // a slow strategy must not receive credit just because the injected fault expired.
   current=calculate(copy(current,initial.time(),writer,fenced,ro,cache,scaled,throttle,faults));steps.add(new Step(seconds,action.type().name(),action.target(),applied,reason,current));
  }
  var service=node(current,"external-api");int affected=(int)current.nodes().stream().filter(n->!n.status().equals("HEALTHY")).count();
  String outcome=service.availability()>=99&&service.latency()<800?"SUCCESS":service.availability()>node(initial,"external-api").availability()?"PARTIAL":"FAILED";
  int risk=(int)Math.min(100,Math.round(100-service.availability()+affected*3+steps.stream().filter(st->!st.applied()).count()*10));
  return new Result(strategy.id(),outcome,seconds,service.availability(),service.latency(),service.errorRate(),affected,risk,dataRisk,strategy.actions().size(),List.copyOf(steps),current);
 }
 public static double score(Result r,String objective){double speed=Math.max(0,100-r.recoverySeconds()/2.0),safe=100-r.residualRisk(),data=100-r.dataRisk(),simple=Math.max(0,100-r.complexity()*10);return round(switch(objective){case "SPEED"->.4*speed+.35*r.availability()+.1*safe+.1*data+.05*simple;case "DATA"->.1*speed+.25*r.availability()+.2*safe+.4*data+.05*simple;case "STABILITY"->.1*speed+.45*r.availability()+.3*safe+.1*data+.05*simple;default->throw new IllegalArgumentException("평가 기준 오류");});}
}
