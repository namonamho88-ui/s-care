package demo.brain;

import com.fasterxml.jackson.databind.JsonNode;
import java.util.*;

/** One authored exercise. Pure deterministic model; never invokes TwinLab, AI, incidents or commands. */
final class CityTraining {
 static final List<String> ROLES=List.of("관제 담당","분석 담당","복구 담당","상황 책임자");
 static final List<String> ZONES=List.of("square","shop","app","db","network","trial");
 static final Map<String,String> CLUE_ROLE=Map.of("deploy","분석 담당","pool","관제 담당","database","관제 담당","timeout","분석 담당");
 static final Map<String,String> CLUE_ZONE=Map.of("deploy","app","pool","shop","database","db","timeout","network");
 static final Map<String,String> CLUES=Map.of(
  "deploy","17:50 v2.8 배포 이후 카드 승인 지연 증가. 직전 v2.7에서는 발생하지 않았습니다.",
  "pool","앱 DB 연결 풀 100/100 사용 중 · 연결 대기 120건. 카드 승인 성공률 72%로 하락했습니다.",
  "database","DB CPU 32% · 쿼리 p95 18ms로 정상입니다. DB 실행보다 앱의 연결 대기가 길어졌습니다.",
  "timeout","앱 로그: connection acquisition timeout. 요청 종료 후에도 borrowed 연결이 반환되지 않습니다. 네트워크 손실은 0%입니다.");
 String id=UUID.randomUUID().toString(),stage="LOBBY",resumeStage="CLUES",cause="",selected="",feedback="";
 long revision,started,deadline,finished,executionAt,verifyAt; boolean overtime,approved;
 final Map<String,String> roles=new LinkedHashMap<>(),votes=new LinkedHashMap<>(),names=new LinkedHashMap<>();
 final Map<String,Set<String>> privateClues=new HashMap<>();
 final Map<String,Map<String,Object>> shared=new LinkedHashMap<>(),trials=new LinkedHashMap<>();
 final Map<String,Set<String>> badges=new LinkedHashMap<>();
 final List<Map<String,Object>> pings=new ArrayList<>(),messages=new ArrayList<>();
 static Map<String,Object> metrics(double success,int latency,int queue,int pool,boolean recurrence){return Map.of("success",success,"latency",latency,"queue",queue,"pool",pool,"recurrence",recurrence);}
 static Map<String,Object> normal(){return metrics(99.95,180,0,38,false);}
 static Map<String,Object> fault(){return metrics(72,4800,120,100,true);}
 static Map<String,Object> simulate(String action){return switch(action){
  case "restart"->Map.of("metrics",metrics(97,800,20,60,true),"effect","기존 연결을 비워 일시 완화합니다. v2.8 연결 반환 결함이 남아 60초 후 풀이 다시 고갈됩니다.","safe",false);
  case "bypass"->Map.of("metrics",metrics(96,1200,35,100,false),"effect","정상 v2.7 예비 인스턴스 용량은 현재 요청의 80%입니다. 영향은 줄지만 모든 요청을 수용하지 못하며 원인 앱의 풀은 여전히 고갈돼 있습니다.","safe",false);
  case "rollback"->Map.of("metrics",normal(),"effect","직전 정상 v2.7로 교체하여 연결 반환 결함을 제거합니다. 호환 스키마·예비 용량 확인 완료. 교체 중 요청 배출 후 정상화 검증이 필요합니다.","safe",true);
  default->throw new IllegalArgumentException("지원하지 않는 복구안입니다.");};}
 String role(String player){return roles.getOrDefault(player,ROLES.get(0));}
 void require(boolean ok,String text){if(!ok)throw new IllegalStateException(text);}
 void phase(String expected){require(stage.equals(expected),"현재 단계에서는 실행할 수 없습니다. 최신 상황판을 확인하세요.");}
 void role(String player,String expected){require(role(player).equals(expected),expected+"으로 역할을 전환해 주세요. 훈련 역할은 실제 권한이 아닙니다.");}
 void badge(String player,String label){badges.computeIfAbsent(player,k->new LinkedHashSet<>()).add(label);}
 void tick(long now){
  if(!Set.of("LOBBY","RESULT","TIMEOUT").contains(stage)&&!overtime&&now>=deadline){resumeStage=stage;stage="TIMEOUT";finished=deadline;revision++;return;}
  if(stage.equals("EXECUTING")&&now-executionAt>=8000){stage="VERIFY";verifyAt=now;revision++;}
 }
 void apply(String player,String name,JsonNode msg,long now){
  tick(now);require(msg.path("missionId").asText().equals(id)&&msg.path("revision").asLong(-1)==revision,"다른 팀원이 먼저 반영했습니다. 최신 상태에서 다시 시도하세요.");
  String op=msg.path("op").asText(),value=msg.path("value").asText();
  names.put(player,name);
  switch(op){
   case "role"->{require(ROLES.contains(value),"훈련 역할을 선택하세요.");roles.put(player,value);}
   case "start"->{phase("LOBBY");stage="CLUES";started=now;deadline=now+300_000;feedback="네 구역의 단서를 모아 상황판에 공유하세요.";}
   case "reset"->{require(Set.of("RESULT","TIMEOUT").contains(stage),"결과 화면에서 다시 도전할 수 있습니다.");id=UUID.randomUUID().toString();stage="LOBBY";started=deadline=finished=executionAt=verifyAt=0;overtime=approved=false;cause=selected=feedback="";votes.clear();privateClues.clear();shared.clear();trials.clear();badges.clear();pings.clear();messages.clear();}
   case "continue"->{phase("TIMEOUT");stage=resumeStage;overtime=true;finished=0;if(stage.equals("EXECUTING"))executionAt=now;feedback="시간제한 없는 연습입니다. 이전 조사 결과를 이어갑니다.";}
   case "inspect"->{require(!Set.of("LOBBY","RESULT","TIMEOUT").contains(stage),"미션 진행 중 구역을 조사하세요.");require(ZONES.contains(value),"구역을 확인하세요.");CLUE_ZONE.forEach((key,zone)->{if(zone.equals(value)&&role(player).equals(CLUE_ROLE.get(key)))privateClues.computeIfAbsent(player,k->new LinkedHashSet<>()).add(key);});}
   case "share"->{require(Set.of("CLUES","CAUSE").contains(stage),"단서 수집 단계에서 공유하세요.");require(privateClues.getOrDefault(player,Set.of()).contains(value),"담당 역할로 구역을 조사한 뒤 공유하세요.");require(!shared.containsKey(value),"이미 공유된 단서입니다.");if(shared.isEmpty())badge(player,"최초 단서 발견");badge(player,"협업 지원");shared.put(value,Map.of("id",value,"text",CLUES.get(value),"player",player,"name",name,"zone",CLUE_ZONE.get(value)));if(shared.size()==4){stage="CAUSE";feedback="단서 4개가 모였습니다. 팀 의견을 남기고 원인을 판단하세요.";}}
   case "ping"->{require(ZONES.contains(value),"구역을 확인하세요.");pings.removeIf(p->p.get("player").equals(player));pings.add(Map.of("player",player,"name",name,"zone",value,"at",now));}
   case "message"->{require(List.of("단서 발견","여기 확인","분석 완료","복구 시험 요청","승인 요청").contains(value),"빠른 메시지를 선택하세요.");messages.add(Map.of("name",name,"text",value,"at",now));if(messages.size()>12)messages.remove(0);}
   case "vote"->{phase("CAUSE");require(Set.of("leak","database","network").contains(value),"원인 후보를 선택하세요.");votes.put(player,value);}
   case "diagnose"->{phase("CAUSE");role(player,"분석 담당");require(votes.containsKey(player),"먼저 원인 후보에 의견을 남기세요.");cause=votes.get(player);if(cause.equals("leak")){stage="TRIAL";feedback="앱의 DB 연결 반환 누락으로 연결 풀이 고갈됐습니다. 복구안을 비교하세요.";votes.forEach((p,v)->{if(v.equals("leak"))badge(p,"정확한 원인 분석");});}else feedback="근거를 다시 확인하세요. DB 처리와 네트워크는 정상이며 배포 이후 앱 연결 대기가 증가했습니다.";}
   case "test"->{phase("TRIAL");role(player,"복구 담당");trials.put(value,simulate(value));feedback="시험 결과만 변경됐습니다. 훈련 도시에는 아직 적용되지 않았습니다.";}
   case "request"->{phase("TRIAL");role(player,"복구 담당");require(trials.containsKey(value),"복구안을 먼저 시험하세요.");selected=value;approved=false;stage="APPROVAL";feedback="상황 책임자가 공유 근거와 시험 결과를 검토해 주세요.";}
   case "reject"->{phase("APPROVAL");role(player,"상황 책임자");stage="TRIAL";selected="";approved=false;feedback="시험 단계로 돌아갑니다.";}
   case "approve"->{phase("APPROVAL");role(player,"상황 책임자");require(shared.size()==4&&cause.equals("leak")&&trials.containsKey(selected),"원인과 시험 근거가 필요합니다.");approved=true;stage="READY";feedback="훈련 내 승인 완료. 복구 담당자가 조치를 실행할 수 있습니다.";badge(player,"협업 지원");}
   case "execute"->{phase("READY");role(player,"복구 담당");require(approved,"훈련 내 승인이 필요합니다.");stage="EXECUTING";executionAt=now;feedback="시나리오 모델에서 조치를 실행 중입니다. 실제 서버 명령은 없습니다.";}
   case "verify"->{phase("VERIFY");role(player,"관제 담당");require(now-verifyAt>=3000,"3초의 안정화 관측이 끝난 뒤 확인하세요.");if(selected.equals("rollback")){stage="RESULT";finished=now;feedback="연결 풀·승인 성공률·대기열·재발 검사 모두 통과했습니다.";badge(player,"영향 최소화");}else{stage="TRIAL";approved=false;feedback=selected.equals("restart")?"검증 실패: 60초 관측 모델에서 연결 풀이 다시 고갈됩니다. 원인 제거가 필요합니다.":"검증 실패: 우회 용량이 부족하여 대기 요청이 남습니다. 정상화 기준을 충족하지 못했습니다.";if(selected.equals("bypass"))badge(player,"영향 최소화");}}
   default->throw new IllegalArgumentException("허용되지 않은 훈련 동작입니다.");
  }
  revision++;
 }
 Map<String,Object> view(String player,long now){
  tick(now);var out=new LinkedHashMap<String,Object>();
  out.put("id",id);out.put("revision",revision);out.put("stage",stage);out.put("role",role(player));out.put("roles",new LinkedHashMap<>(roles));out.put("started",started);out.put("deadline",deadline);out.put("finished",finished);out.put("overtime",overtime);out.put("cause",cause);out.put("selected",selected);out.put("approved",approved);out.put("feedback",feedback);out.put("executionAt",executionAt);out.put("verifyAt",verifyAt);
  var badgeSnapshot=new LinkedHashMap<String,List<String>>();badges.forEach((p,b)->badgeSnapshot.put(p,List.copyOf(b)));
  out.put("clues",List.copyOf(shared.values()));out.put("privateClues",privateClues.getOrDefault(player,Set.of()).stream().map(k->Map.of("id",k,"text",CLUES.get(k),"zone",CLUE_ZONE.get(k))).toList());out.put("votes",new LinkedHashMap<>(votes));out.put("names",new LinkedHashMap<>(names));out.put("trials",new LinkedHashMap<>(trials));out.put("badges",badgeSnapshot);out.put("pings",List.copyOf(pings));out.put("messages",List.copyOf(messages));
  out.put("before",fault());out.put("metrics",stage.equals("LOBBY")||stage.equals("RESULT")?normal():Set.of("EXECUTING","VERIFY").contains(stage)&&!selected.isEmpty()?simulate(selected).get("metrics"):fault());
  return out;
 }
}
