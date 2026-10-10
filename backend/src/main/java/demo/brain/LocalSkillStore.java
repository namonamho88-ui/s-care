package demo.brain;
import org.springframework.stereotype.Service;
import java.util.*;
@Service
public class LocalSkillStore {
 private final Store s;public LocalSkillStore(Store s){this.s=s;}
 public String provider(){return "LOCAL_SKILL_STORE";}
 public Map<String,Object> search(String type){return Map.of("provider",provider(),"hermesConnected",false,"skills",s.db.queryForList("SELECT * FROM skills WHERE type=? AND status='APPROVED' ORDER BY id",type),"manuals",s.db.queryForList("SELECT * FROM manuals WHERE type=? ORDER BY id",type));}
 public String saveDraft(Map<String,Object> i,Map<String,Object> generated){String id=Store.id("SKL-");var content=s.json.valueToTree(generated.get("content"));String title=i.get("title").toString();if(title.length()>185)title=title.substring(0,185);
  s.db.update("INSERT INTO skills(id,type,title,status,conditions,checks,solution,cautions,incident_id,created_at,source_provider,source_model,simulated,provenance_json) VALUES (?,?,?,'DRAFT',?,?,?,?,?,?,?,?,?,?)",id,i.get("type"),title+" 해결 초안",content.path("conditions").asText(),content.path("checks").asText(),content.path("solution").asText(),content.path("cautions").asText(),i.get("id"),Store.now(),generated.get("provider"),generated.get("model"),generated.get("simulated"),s.encode(generated));return id;}
}
