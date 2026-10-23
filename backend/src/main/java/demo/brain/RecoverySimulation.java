package demo.brain;

import java.util.*;
import java.util.regex.Pattern;

/** Rule-selected, deterministic synthetic sandbox. No commands or external system changes. */
public final class RecoverySimulation {
 private RecoverySimulation() {}
 private record Rule(String code,String label,String regex,String action,String prevention) {}
 private static final List<Rule> RULES=List.of(
  new Rule("FILE","입력 파일 누락","file not found|no such file|입력.?파일.{0,12}(없|누락|미도착)|파일.{0,8}(미수신|미도착)|파일 누락","입력 파일 복원 및 형식 검사","입력 파일 도착·크기·체크섬 사전 점검"),
  new Rule("PERMISSION","파일·실행 권한 부족","permission denied|access denied|권한\\s*부족|접근\\s*거부|ora-01031(?!\\d)","실행 계정에 필요한 범위의 권한만 복원","실행 계정 최소 권한과 경로 접근권한 정기 점검"),
  new Rule("LOCK","DB 잠금·교착","ora-00060(?!\\d)|ora-00054(?!\\d)|deadlock|lock wait|교착|잠금 대기|락 경합","차단 트랜잭션을 롤백하고 잠금 해제","잠금 대기 감시와 트랜잭션 처리 범위 점검"),
  new Rule("CONNECTION","DB 연결 실패","ora-12514(?!\\d)|ora-12541(?!\\d)|ora-12170(?!\\d)|connection refused|connection reset|connection pool.{0,12}(exhaust|timeout)|db\\s*연결\\s*실패|커넥션.{0,8}(고갈|부족)","DB 연결 경로 및 연결 풀 복구","연결 풀 대기·사용률과 DB 연결 상태 감시"),
  new Rule("MEMORY","메모리 부족","outofmemory|out of memory|메모리\\s*부족|heap space|oom killed|s80a","작업 청크를 축소하고 메모리 한도 내 재배치","청크 크기·메모리 상한·처리량 부하 검증"),
  new Rule("DISK","저장 공간 부족","no space left|disk full|디스크\\s*부족|디스크.{0,5}가득|저장\\s*공간\\s*부족|sb37|sd37|se37|ora-01653(?!\\d)","임시 파일을 정리하고 여유 공간 확보","디스크·테이블스페이스 임계치 사전 알림"),
  new Rule("DUPLICATE","중복 실행·중복 키","ora-00001(?!\\d)|duplicate key|unique constraint|already running|중복\\s*실행|중복\\s*키","중복 실행을 차단하고 미처리 키만 선별","업무일자·배치ID별 처리 이력과 중복 실행 방지 점검"),
  new Rule("DATA","데이터 건수·금액 불일치","금액\\s*불일치|건수\\s*불일치|대사\\s*불일치|정합성\\s*오류|amount mismatch|count mismatch|ora-01722(?!\\d)|invalid number|s0c7|날짜\\s*형식\\s*오류","오류 레코드를 분리하고 검증된 데이터로 재처리","입력 스키마·건수·금액 대사와 예외 레코드 관리"),
  new Rule("DEPENDENCY","선행 작업 실패","선행.{0,8}(실패|미완료|미종료)|upstream failed|dependency failed|predecessor failed","선행 작업 복구 후 완료 상태 확인","선행 작업 완료 조건과 후속 실행 의존성 점검"),
  new Rule("TIMEOUT","실행 시간 초과","timed? out|timeout|시간\\s*초과|타임아웃|s322","처리 범위를 분할하고 제한 시간 내 재시도","처리 구간별 소요 시간·진행률과 제한 시간 점검")
 );
 @SuppressWarnings("unchecked")
 public static Map<String,Object> plan(String observations,String type,boolean batch) {
  // A batch's name describes its business function, not necessarily the cause of its failure.
  String evidence=observations;
  if(observations.contains("문자에서 추출한 관측값")) evidence=String.join("\n",observations.lines().filter(l->l.startsWith("오류 상세:")||l.startsWith("추가 오류 근거:")).toList());
  var hits=new ArrayList<Rule>();var reasons=new ArrayList<String>();
  for(var rule:RULES){var match=Pattern.compile(rule.regex,Pattern.CASE_INSENSITIVE|Pattern.UNICODE_CASE).matcher(evidence);if(match.find()){hits.add(rule);reasons.add(rule.label+": "+match.group());}}
  // Timeout in a specific connection/lock error is a symptom of that same failure.
  if(hits.stream().anyMatch(r->Set.of("LOCK","CONNECTION").contains(r.code)))hits.removeIf(r->r.code.equals("TIMEOUT"));
  String code,label,action,prevention;
  boolean supported=true;
  if(batch){
   if(hits.size()!=1){supported=false;code=hits.isEmpty()?"UNKNOWN":"AMBIGUOUS";label=hits.isEmpty()?"배치 원인 근거 부족":"복합 오류 · 조치 순서 검토 필요";action="";prevention="오류 코드·실패 단계·선행 작업 상태를 보완한 뒤 재검토";}
   else{var r=hits.get(0);code=r.code;label=r.label;action=r.action;prevention=r.prevention;}
  }else{
   code=switch(type){case "RESOURCE"->"RESOURCE";case "DATABASE"->"DATABASE";case "NETWORK"->"NETWORK";case "APPLICATION"->"APPLICATION";case "SECURITY"->"SECURITY";default->"UNKNOWN";};
   label=switch(code){case "RESOURCE"->"자원 부족";case "DATABASE"->"DB 연결 상태";case "NETWORK"->"네트워크 연결";case "APPLICATION"->"애플리케이션 오류";case "SECURITY"->"접근 통제";default->"분류 미확정";};
   action=switch(code){case "RESOURCE"->"작업 부하를 축소하고 자원 여유 확보";case "DATABASE"->"DB 연결 풀 복원";case "NETWORK"->"대체 경로로 전환";case "APPLICATION"->"애플리케이션을 정상 버전으로 롤백";case "SECURITY"->"비인가 세션 차단 및 접근 정책 복원";default->"";};
   supported=!code.equals("UNKNOWN");prevention="선택한 조치의 전제 조건과 서비스 지표 사전 점검";reasons.add("담당자 확인을 거친 장애 분류: "+type);
  }
  var initial=new LinkedHashMap<String,Object>();initial.put("errorRate",12.5);initial.put("latencyMs",3200);initial.put("healthyDependencies",false);initial.put("blockerResolved",false);
  if(batch){initial.put("jobStatus","ABEND");initial.put("expectedCount",1000);initial.put("sourceCount",1000);initial.put("unitAmount",10000);initial.put("processedCount",984);initial.put("expectedAmount",10000000);initial.put("processedAmount",9840000);initial.put("duplicateCount",code.equals("DUPLICATE")?2:0);initial.put("unresolvedRecords",code.equals("DATA")?16:0);}
  initial.put("profileState",switch(code){case "FILE"->"FILE_MISSING";case "PERMISSION"->"ACCESS_DENIED";case "LOCK"->"LOCKED";case "CONNECTION","DATABASE"->"DISCONNECTED";case "MEMORY"->"HEAP_EXHAUSTED";case "DISK"->"DISK_FULL";case "DUPLICATE"->"DUPLICATE_KEYS";case "DATA"->"UNRECONCILED";case "DEPENDENCY"->"UPSTREAM_FAILED";case "TIMEOUT"->"DEADLINE_EXCEEDED";default->"UNHEALTHY";});
  switch(code){
   case "FILE"->initial.put("fileAvailable",false);
   case "PERMISSION"->initial.put("accessGranted",false);
   case "LOCK"->initial.put("blockingTransactions",2);
   case "CONNECTION","DATABASE"->initial.put("dbConnected",false);
   case "MEMORY","RESOURCE"->initial.put("memoryUsedPercent",98);
   case "DISK"->initial.put("freeDiskMb",0);
   case "DEPENDENCY"->initial.put("upstreamComplete",false);
   case "TIMEOUT"->initial.put("chunkDurationSeconds",180);
   case "NETWORK"->initial.put("routeAvailable",false);
   case "APPLICATION"->initial.put("releaseHealthy",false);
   case "SECURITY"->initial.put("unauthorizedSessions",3);
   default->{}
  }
  var actions=new ArrayList<Map<String,Object>>();
  if(supported){actions.add(Map.of("code","PRECHECK","label","대상 시스템·장애 상태 및 재실행 조건 확인"));actions.add(Map.of("code","REMEDIATE","label",action));if(batch){actions.add(Map.of("code","RERUN","label","기존 처리 이력을 확인하고 미처리 구간만 재실행"));actions.add(Map.of("code","RECONCILE","label","처리 건수·금액·중복·미해결 레코드 대조"));}else actions.add(Map.of("code","PROBE","label","오류율·응답시간·연결 상태 재측정"));}
  var plan=new LinkedHashMap<String,Object>();plan.put("version",2);plan.put("profile",code);plan.put("label",label);plan.put("batch",batch);plan.put("supported",supported);plan.put("basis",reasons.isEmpty()?List.of("ABEND·DELAY_END만으로 근본 원인을 특정하지 않습니다."):reasons);plan.put("actions",actions);plan.put("initial",initial);plan.put("prevention",prevention);plan.put("provider","SYNTHETIC_ACTION_MODEL");plan.put("realChanges",false);plan.put("dataSource","시연 환경의 데이터 기준입니다. 실제 운영 측정값이나 처리 결과가 아닙니다.");plan.put("caution","운영 재실행은 별도 원인 확인·중복 처리 방지·담당자 승인이 필요합니다. 이 모델은 실제 명령을 실행하지 않습니다.");return plan;
 }
 @SuppressWarnings("unchecked")
 public static Map<String,Object> execute(Map<String,Object> plan) {
  if(!Boolean.TRUE.equals(plan.get("supported")))throw new IllegalStateException("오류 근거가 부족하거나 복합 오류입니다. 추가 오류 근거를 입력하세요.");
  var state=new LinkedHashMap<String,Object>((Map<String,Object>)plan.get("initial"));var before=new LinkedHashMap<>(state);var steps=new ArrayList<Map<String,Object>>();
  for(var action:(List<Map<String,Object>>)plan.get("actions")){
   var previous=new LinkedHashMap<>(state);String code=action.get("code").toString();boolean passed=true;
   switch(code){
    case "PRECHECK"->state.put("prechecked",true);
    case "REMEDIATE"->{passed=Boolean.TRUE.equals(state.get("prechecked"));if(passed){switch(plan.get("profile").toString()){
     case "FILE"->state.put("fileAvailable",true);
     case "PERMISSION"->state.put("accessGranted",true);
     case "LOCK"->state.put("blockingTransactions",0);
     case "CONNECTION","DATABASE"->state.put("dbConnected",true);
     case "MEMORY","RESOURCE"->state.put("memoryUsedPercent",65);
     case "DISK"->state.put("freeDiskMb",2048);
     case "DUPLICATE"->state.put("duplicateCount",0);
     case "DATA"->state.put("unresolvedRecords",0);
     case "DEPENDENCY"->state.put("upstreamComplete",true);
     case "TIMEOUT"->state.put("chunkDurationSeconds",45);
     case "NETWORK"->state.put("routeAvailable",true);
     case "APPLICATION"->state.put("releaseHealthy",true);
     case "SECURITY"->state.put("unauthorizedSessions",0);
     default->{passed=false;}
    }
    state.put("blockerResolved",passed);state.put("profileState",passed?"READY":"UNHEALTHY");state.put("healthyDependencies",passed);}}
    case "RERUN"->{
     passed=Boolean.TRUE.equals(state.get("blockerResolved"))&&Objects.equals(state.get("duplicateCount"),0)&&Objects.equals(state.get("unresolvedRecords"),0);
     if(passed){
      int source=((Number)state.get("sourceCount")).intValue(),checkpoint=((Number)state.get("processedCount")).intValue();
      passed=source>0&&source<=5000&&checkpoint>=0&&checkpoint<=source;
      if(passed){
       // Process synthetic record keys, retaining checkpoint keys and rejecting duplicates.
       Set<Integer> completed=new HashSet<>();for(int n=0;n<checkpoint;n++)completed.add(n);
       int replayed=0;for(int n=0;n<source;n++)if(!completed.add(n))replayed++;
       long amount=completed.stream().mapToLong(key->((Number)state.get("unitAmount")).longValue()).sum();
       state.put("skippedCheckpointKeys",replayed);state.put("processedCount",completed.size());state.put("processedAmount",amount);state.put("jobStatus","END_OK");
      }
     }
    }
    case "RECONCILE"->passed="END_OK".equals(state.get("jobStatus"))&&Objects.equals(state.get("processedCount"),state.get("expectedCount"))&&((Number)state.get("processedAmount")).longValue()==((Number)state.get("expectedAmount")).longValue()&&Objects.equals(state.get("duplicateCount"),0)&&Objects.equals(state.get("unresolvedRecords"),0);
    case "PROBE"->{passed=Boolean.TRUE.equals(state.get("blockerResolved"));}
    default->passed=false;
   }
   if(passed&&(code.equals("RERUN")||code.equals("PROBE"))){state.put("errorRate",0.02);state.put("latencyMs",switch(plan.get("profile").toString()){case "DATABASE","CONNECTION"->180;case "NETWORK"->140;default->120;});}
   steps.add(Map.of("code",code,"label",action.get("label"),"passed",passed,"before",previous,"after",new LinkedHashMap<>(state)));
   if(!passed)break;
  }
  return Map.of("plan",plan,"before",before,"after",state,"steps",steps,"provider","SYNTHETIC_ACTION_MODEL","realChanges",false);
 }
 public static List<Map<String,Object>> checks(Map<String,Object> state,boolean batch) {
  var out=new ArrayList<Map<String,Object>>();
  check(out,"원인별 조치 반영",true,state.get("blockerResolved"));
  if(state.containsKey("fileAvailable"))check(out,"입력 파일 준비",true,state.get("fileAvailable"));
  if(state.containsKey("accessGranted"))check(out,"필수 권한 확보",true,state.get("accessGranted"));
  if(state.containsKey("blockingTransactions"))check(out,"차단 트랜잭션 해소",0,state.get("blockingTransactions"));
  if(state.containsKey("dbConnected"))check(out,"DB 연결 정상",true,state.get("dbConnected"));
  if(state.containsKey("upstreamComplete"))check(out,"선행 작업 완료",true,state.get("upstreamComplete"));
  if(state.containsKey("routeAvailable"))check(out,"대체 경로 연결",true,state.get("routeAvailable"));
  if(state.containsKey("releaseHealthy"))check(out,"정상 버전 응답",true,state.get("releaseHealthy"));
  if(state.containsKey("unauthorizedSessions"))check(out,"비인가 세션 차단",0,state.get("unauthorizedSessions"));
  for(String key:List.of("memoryUsedPercent","freeDiskMb","chunkDurationSeconds"))if(state.containsKey(key)){
   Object value=state.get(key);boolean valid=value instanceof Number n&&Double.isFinite(n.doubleValue())&&n.doubleValue()>=0&&(key.equals("freeDiskMb")?n.doubleValue()>=1024:key.equals("memoryUsedPercent")?n.doubleValue()<80:n.doubleValue()<=60);
   out.add(Map.of("label",key.equals("freeDiskMb")?"디스크 여유 1024MB 이상":key.equals("memoryUsedPercent")?"메모리 사용률 80% 미만":"청크 처리 시간 60초 이내","expected",key.equals("freeDiskMb")?">= 1024":key.equals("memoryUsedPercent")?"< 80":"<= 60","actual",Objects.toString(value,"미기록"),"passed",valid));
  }
  if(batch){check(out,"배치 종료 상태","END_OK",state.get("jobStatus"));check(out,"처리 건수 일치",state.get("expectedCount"),state.get("processedCount"));check(out,"처리 금액 일치",state.get("expectedAmount"),state.get("processedAmount"));check(out,"중복 처리 건수",0,state.get("duplicateCount"));check(out,"미해결 레코드",0,state.get("unresolvedRecords"));}
  else{Object error=state.get("errorRate"),latency=state.get("latencyMs");out.add(Map.of("label","오류율 0.1% 미만","expected","< 0.1%","actual",Objects.toString(error,"미기록"),"passed",error instanceof Number n&&Double.isFinite(n.doubleValue())&&n.doubleValue()>=0&&n.doubleValue()<0.1));out.add(Map.of("label","응답시간 500ms 미만","expected","< 500ms","actual",Objects.toString(latency,"미기록"),"passed",latency instanceof Number n&&Double.isFinite(n.doubleValue())&&n.doubleValue()>=0&&n.doubleValue()<500));check(out,"의존 시스템 정상",true,state.get("healthyDependencies"));}
  return out;
 }
 private static void check(List<Map<String,Object>> out,String label,Object expected,Object actual){out.add(Map.of("label",label,"expected",Objects.toString(expected,"미기록"),"actual",Objects.toString(actual,"미기록"),"passed",expected!=null&&actual!=null&&(expected instanceof Number a&&actual instanceof Number b?Double.compare(a.doubleValue(),b.doubleValue())==0:expected.equals(actual))));}
}
