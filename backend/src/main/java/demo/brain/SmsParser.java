package demo.brain;

import org.springframework.stereotype.Component;
import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.*;
import java.time.format.*;
import java.util.*;
import java.util.regex.*;

/** Deterministic intake rules. Raw messages, sender headers and recipient names are never returned. */
@Component
public class SmsParser {
 private static final Pattern BATCH=Pattern.compile("\\[운영]\\s*(END_OK|ABEND|DELAY_END)\\s*:\\s*([A-Za-z0-9_-]{1,80})(?:\\[배치ID])?\\s+(.+?)\\s+(\\d{8})\\s+(.+)");
 private static final DateTimeFormatter DAY=DateTimeFormatter.ofPattern("uuuuMMdd").withResolverStyle(ResolverStyle.STRICT);
 private static final DateTimeFormatter STAMP=DateTimeFormatter.ofPattern("uuuu-MM-dd HH:mm:ss").withResolverStyle(ResolverStyle.STRICT);
 private static final DateTimeFormatter CLOCK=DateTimeFormatter.ofPattern("HH:mm").withResolverStyle(ResolverStyle.STRICT);
 private static final List<String> TMS_KEYS=List.of("IF아이디","IF명","업무코드","서비스코드","대외기관","거래일자","거래시간","거래집계일시","비교일수","비교기간평균거래건수","비교기간평균오류건수","비교기간평균오류율","오류율임계치","현재거래건수","현재오류건수","현재오류율","메시지 발생일시");
 public record Parsed(String kind,String status,boolean eligible,String title,Map<String,String> fields,List<String> warnings) {
  public String sourceKey(){return kind.equals("BATCH")?"BATCH:"+fields.get("배치ID"):"TMS:"+fields.get("IF아이디")+":"+fields.get("서비스코드");}
  public String fingerprint(){
   String identity=sourceKey()+"|"+status+"|"+(kind.equals("BATCH")?fields.get("업무일자")+"|"+fields.getOrDefault("발생일시",fields.get("종료기한")):fields.get("거래일자")+"|"+fields.get("메시지 발생일시"));
   try{return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(identity.getBytes(StandardCharsets.UTF_8)));}catch(Exception e){throw new IllegalStateException(e);}
  }
  public String observations(){return "문자에서 추출한 관측값 (KST). 원인·심각도는 미확정이며 추가 검토가 필요합니다.\n"+String.join("\n",fields.entrySet().stream().map(e->e.getKey()+": "+e.getValue()).toList());}
 }
 public Parsed parse(String raw){
  Harness.text(raw,10000,"문자");String input=raw.replace("\r","").strip();
  if(count(input,"[Web발신]")>1||count(input,"[운영]")>1)throw bad("한 번에 문자 한 건만 붙여넣어 주세요.");
  if(input.contains("[운영]"))return batch(input);
  if(input.contains("TMS")&&input.contains("임계치"))return tms(input);
  throw bad("지원하는 배치 또는 TMS 알림 형식을 찾지 못했습니다. 내용을 확인하거나 직접 등록해 주세요.");
 }
 private Parsed batch(String input){
  String body=input.replaceFirst("^\\[Web발신]\\s*","").replaceAll("\\s+"," ");Matcher m=BATCH.matcher(body);
  if(!m.matches())throw bad("배치 상태, ID, 배치명, 업무일자와 발생일시(또는 종료기한)를 확인해 주세요.");
  String status=m.group(1),name=m.group(3).replaceFirst("\\[배치명]$","").strip();
  Harness.text(name,120,"배치명");var f=new LinkedHashMap<String,String>();var warnings=new ArrayList<String>();
  f.put("배치ID",m.group(2));f.put("배치명",name);f.put("업무일자",day(m.group(4)));
  if(status.equals("DELAY_END")){
   Matcher deadline=Pattern.compile("MUST BE END BY (\\d{2}:\\d{2})!(?:\\s+(.+))?").matcher(m.group(5));
   if(!deadline.matches())throw bad("DELAY_END 종료기한은 MUST BE END BY HH:mm! 형식이어야 합니다.");
   try{LocalTime.parse(deadline.group(1),CLOCK);}catch(DateTimeException e){throw bad("종료기한 시간이 올바르지 않습니다.");}
   f.put("종료기한",deadline.group(1));if(deadline.group(2)!=null)f.put("오류 상세",errorDetail(deadline.group(2)));warnings.add("종료기한은 발생 시각이 아닙니다. 이 문자에는 실제 발생일시가 없어 등록 시각과 구분해 저장합니다.");
  }else {
   Matcher timestamp=Pattern.compile("(\\d{4}-\\d{2}-\\d{2} \\d{2}:\\d{2}:\\d{2})(?:\\s+(.+))?").matcher(m.group(5));
   if(!timestamp.matches())throw bad("발생일시 형식 또는 오류 상세 항목을 확인해 주세요.");
   f.put("발생일시",stamp(timestamp.group(1)));if(timestamp.group(2)!=null)f.put("오류 상세",errorDetail(timestamp.group(2)));
  }
  if(name.endsWith("..")||name.endsWith("…"))warnings.add("배치명이 생략되어 있습니다. 전체 이름을 추정하지 않으며 대상 구성요소를 확인해야 합니다.");
  String label=switch(status){case "END_OK"->"정상 종료";case "ABEND"->"비정상 종료";default->"종료 지연";};
  f.put("알림 상태",status);
  return new Parsed("BATCH",status,!status.equals("END_OK"),title("["+label+"] "+m.group(2)+" "+name),Collections.unmodifiableMap(f),List.copyOf(warnings));
 }
 private String errorDetail(String value){
  if(!Pattern.compile("^(?:\\[?(?:오류\\s*(?:코드|내용|메시지|상세)|에러\\s*(?:코드|내용)|ERROR(?: CODE| MESSAGE)?|RC|SQLCODE)\\]?\\s*[:=]|ORA-\\d{5}|SQLSTATE[=:])",Pattern.CASE_INSENSITIVE).matcher(value).find())throw bad("추가 정보는 오류코드: 또는 오류내용: 항목으로 입력해 주세요.");
  String safe=value.split("(?:메시지\\s*)?수신자|발신자|수신인",2)[0].strip();
  safe=safe.replaceAll("(?i)(password|passwd|token|api[_ -]?key|secret)\\s*[:=]\\s*[^\\s,;]+","$1=[비공개]");
  safe=safe.replaceAll("[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\\.[A-Za-z]{2,}","[이메일 제외]");
  Harness.text(safe,1000,"오류 상세");return safe;
 }
 private Parsed tms(String input){
  Map<String,String> values=new HashMap<>();
  for(String line:input.split("\n")){
   Matcher m=Pattern.compile("^\\s*▶?\\s*([^:]+?)\\s*:\\s*(.*?)\\s*$").matcher(line);
   if(!m.matches()||!TMS_KEYS.contains(m.group(1)))continue;
   String key=m.group(1),value=m.group(2);
   if(values.putIfAbsent(key,value)!=null)throw bad("같은 항목이 반복됩니다. 문자 한 건만 입력해 주세요: "+key);
  }
  var f=new LinkedHashMap<String,String>();
  for(String key:TMS_KEYS){if(!values.containsKey(key))continue;String v=values.get(key);
   if(key.equals("거래시간")||key.equals("비교일수"))v=v.replaceFirst("\\([^()]*\\).*$","").strip();
   if(v.endsWith("%"))v=v.substring(0,v.length()-1).strip();
   if(v.startsWith("[")&&v.endsWith("]"))v=v.substring(1,v.length()-1).strip();
   Harness.text(v,key.equals("IF명")?180:100,key);f.put(key,v);
  }
  for(String key:List.of("IF아이디","IF명","업무코드","서비스코드","거래일자","거래시간","메시지 발생일시","오류율임계치","현재거래건수","현재오류건수","현재오류율"))if(!f.containsKey(key))throw bad("필수 항목이 없습니다: "+key);
  for(String key:List.of("IF아이디","업무코드","서비스코드"))if(!f.get(key).matches("[A-Za-z0-9_-]{1,80}"))throw bad(key+" 형식이 올바르지 않습니다.");
  f.put("거래일자",day(f.get("거래일자")));f.put("메시지 발생일시",stamp(f.get("메시지 발생일시")));
  if(f.containsKey("거래집계일시"))f.put("거래집계일시",stamp(f.get("거래집계일시")));
  if(!f.get("거래시간").matches("\\d{4}~\\d{4}"))throw bad("거래시간은 HHmm~HHmm 형식이어야 합니다.");
  try{for(String clock:f.get("거래시간").split("~"))LocalTime.parse(clock,DateTimeFormatter.ofPattern("HHmm").withResolverStyle(ResolverStyle.STRICT));}catch(DateTimeException e){throw bad("거래시간이 올바르지 않습니다.");}
  for(String key:List.of("현재거래건수","현재오류건수","비교일수","비교기간평균거래건수","비교기간평균오류건수"))if(f.containsKey(key)){BigDecimal n=number(f,key);if(n.signum()<0||n.compareTo(new BigDecimal("1000000000000"))>0||key.startsWith("현재")&&n.stripTrailingZeros().scale()>0)throw bad(key+" 값이 올바르지 않습니다.");}
  for(String key:List.of("현재오류율","오류율임계치","비교기간평균오류율"))if(f.containsKey(key)){BigDecimal n=number(f,key);if(n.signum()<0||n.compareTo(new BigDecimal("100"))>0)throw bad(key+"은 0~100 범위여야 합니다.");}
  double total=number(f,"현재거래건수").doubleValue(),errors=number(f,"현재오류건수").doubleValue(),rate=number(f,"현재오류율").doubleValue();
  if(total<=0||errors>total||Math.abs(errors/total*100-rate)>0.02)throw bad("현재 거래·오류 건수와 오류율이 일치하지 않습니다. 원문을 확인해 주세요.");
  BigDecimal difference=number(f,"현재오류율").subtract(number(f,"오류율임계치"));
  boolean exceeded=difference.signum()>0;f.put("임계치 초과폭",difference.stripTrailingZeros().toPlainString()+"%p");
  var warnings=new ArrayList<String>();warnings.add("수신자 이름과 발신 기관명은 저장하거나 AI에 전달하지 않습니다. 원인과 심각도는 별도 분석합니다.");
  if(!exceeded)warnings.add("현재 오류율이 임계치를 초과하지 않아 장애 등록을 보류합니다. 직접 확인해 주세요.");
  return new Parsed("TMS",exceeded?"THRESHOLD_EXCEEDED":"REVIEW_REQUIRED",exceeded,title("[TMS 오류율 초과] "+f.get("IF아이디")+" "+f.get("IF명")),Collections.unmodifiableMap(f),List.copyOf(warnings));
 }
 private static String title(String value){return value.length()<=200?value:value.substring(0,197)+"...";}
 private static BigDecimal number(Map<String,String> f,String key){try{if(!f.get(key).matches("\\d+(?:\\.\\d+)?"))throw new NumberFormatException();return new BigDecimal(f.get(key));}catch(Exception e){throw bad(key+"은 숫자로 입력되어야 합니다.");}}
 private static String day(String value){try{LocalDate.parse(value,DAY);return value;}catch(DateTimeException e){throw bad("업무/거래일자가 올바르지 않습니다.");}}
 private static String stamp(String value){try{LocalDateTime.parse(value,STAMP);return value;}catch(DateTimeException e){throw bad("발생/집계일시가 올바르지 않습니다.");}}
 private static int count(String text,String fragment){return (text.length()-text.replace(fragment,"").length())/fragment.length();}
 private static IllegalArgumentException bad(String message){return new IllegalArgumentException(message);}
}
