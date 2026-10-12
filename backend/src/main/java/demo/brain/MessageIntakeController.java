package demo.brain;
import org.springframework.web.bind.annotation.*;
import java.util.*;

@RestController
@RequestMapping("/api/message-intake")
public class MessageIntakeController {
 private final Store s;private final SmsParser parser;private final Harness harness;
 public MessageIntakeController(Store s,SmsParser parser,Harness harness){this.s=s;this.parser=parser;this.harness=harness;}
 @PostMapping("/preview") public Object preview(@RequestBody Map<String,String> body){
  var parsed=parser.parse(body.get("message"));var result=new LinkedHashMap<String,Object>();
  result.put("parsed",parsed);result.put("observations",parsed.observations());
  var existing=s.db.queryForList("SELECT incident_id FROM message_intakes WHERE fingerprint=?",String.class,parsed.fingerprint());
  boolean deleted=!existing.isEmpty()&&s.incident(existing.get(0)).get("deleted_at")!=null;
  if(deleted)throw new IllegalStateException("삭제된 장애에 등록된 문자입니다. 관리자에게 복원을 요청하세요.");
  result.put("existingIncidentId",existing.isEmpty()?"":existing.get(0));
  var assets=s.db.queryForList("SELECT DISTINCT i.asset_id FROM message_intakes m JOIN incidents i ON i.id=m.incident_id WHERE m.source_key=?",String.class,parsed.sourceKey());
  // A code becomes a suggestion only after a human has explicitly selected it at registration.
  result.put("suggestedAssetId",assets.size()==1?assets.get(0):"");
  result.put("matchReason",assets.size()==1?"이 코드로 이전에 등록한 구성요소입니다. 이번 문자에도 맞는지 확인해 주세요.":"자동 연결 정보가 없습니다. 장애가 발생한 구성요소를 선택해 주세요.");
  return result;
 }
 @PostMapping("/register") public Object register(@RequestBody Map<String,String> body){
  var parsed=parser.parse(body.get("message"));
  if(!parsed.eligible())throw new IllegalArgumentException("정상 종료 또는 확인이 필요한 알림은 문자 장애로 등록할 수 없습니다.");
  String asset=body.getOrDefault("assetId","");var a=s.one("SELECT owner_id FROM assets WHERE id=? AND kind<>'SYSTEM'",asset);
  String owner=Access.current().admin()?a.get("owner_id").toString():Access.current().operatorId();
  return harness.createMessage(parsed,body.getOrDefault("mode","REAL"),body.getOrDefault("provider","LOCAL"),asset,owner);
 }
}
