package demo.brain;
import org.springframework.stereotype.Component;
import java.util.*;
@Component
public class MockJevProvider implements JevDecisionProvider {
 public String name(){return "MOCK";}
 public JevDecision decide(String observations){
  if(!observations.matches("(?s).*[가-힣].*")){var d=new LegacyKeywordBaseline().decide(observations);return new JevDecision(d.type(),d.severity(),d.priority(),d.department(),d.recurrence(),d.confidence(),d.evidenceScore(),name(),"bilingual-rules-v1",d.latencyMs(),true,false,"",d.needsReview(),d.evidence(),d.answers());}
  long start=System.nanoTime();String text=observations.toLowerCase(Locale.ROOT);
  var signatures=List.of(List.of("oomkilled","메모리 부족","메모리 제한","cpu throttling","힙 점유","too many open files","inode","남은 공간은 0","수거 후에도"),List.of("ora-","행 잠금","연결 풀","connection pool","테이블스페이스","복제본","미완료 거래","relation lock"),List.of("nxdomain","패킷 손실","dns resolution","syn이","인증서 만료","crc 오류","mtu","반환 경로"),List.of("nullpointerexception","indexoutofboundsexception","classnotfoundexception","필드 누락","필수값 누락","반올림","캐시 키","직렬화"),List.of("토큰 유출","서명 검증에 실패","폐기된 api 키","권한 변경 api","다중 인증","union select","암호를 반복"));
  var hits=new ArrayList<Integer>();for(int i=0;i<signatures.size();i++)if(signatures.get(i).stream().anyMatch(text::contains))hits.add(i);
  boolean uncertain=hits.size()!=1||text.contains("미확인")||text.contains("상충")||text.contains("단정할 수 없")||text.contains("원인·심각도는 미확정")||text.contains("정상이다")&&text.contains("없다");int i=hits.isEmpty()?0:hits.get(0);
  String severity=(text.contains("모두 실패")&&text.contains("우회 경로도 사용할 수 없다"))?"P1":"P2";boolean recurrence=text.contains("이력")&&text.contains("일치함을 비교 확인");
  return new JevDecision(JevDecision.TYPES.get(i),severity,Integer.parseInt(severity.substring(1)),JevDecision.DEPARTMENTS.get(i),recurrence,uncertain?.35:.70,uncertain?.25:.70,name(),"bilingual-rules-v1",(System.nanoTime()-start)/1_000_000,true,false,"",uncertain,List.of(observations,uncertain?"규칙으로 원인을 확정할 수 없어 담당자 검토 필요":"한글·오류코드 규칙에 따른 모의 분류이며 실제 모델 판단이 아닙니다."),Map.of("matchedCategories",hits.size(),"severityProvisional",severity.equals("P2"),"recurrenceUnknown",!recurrence&&!text.contains("조회되지 않았다")));
 }
}
