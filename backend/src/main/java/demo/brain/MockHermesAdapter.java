package demo.brain;
import org.springframework.stereotype.Component;
import java.util.*;
@Component
public class MockHermesAdapter implements HermesAdapter {
 public String provider(){return "MOCK_HERMES";}
 public Map<String,Object> generate(String operation,Map<String,Object> context){
  Object content;
  if(operation.equals("search"))content=Map.of("skillIds",ids(context.get("approvedSkills")),"manualIds",ids(context.get("manuals")),"explanation","유형이 일치하는 승인 Skill과 가상 매뉴얼을 규칙으로 검색했습니다.");
  else content=Map.of("conditions",context.get("observations"),"checks","판단 근거, 의존 관계, 승인 기록과 가상 복구 지표를 확인한다.",
   "solution","승인된 가상 복구 조치의 검증 기록: "+context.get("verification"),"cautions","100% 가상 데이터. 실제 시스템 변경 금지. 관리자 검토 및 승인 후 지식 검색에 사용한다.");
  var result=new LinkedHashMap<String,Object>();result.put("content",content);result.put("provider",provider());result.put("model","deterministic-template-v1");result.put("simulated",true);result.put("fallback",false);result.put("latencyMs",0);result.put("hermesConnected",false);return result;
 }
 private List<String> ids(Object rows){return ((List<?>)rows).stream().map(r->((Map<?,?>)r).get("id").toString()).toList();}
}
