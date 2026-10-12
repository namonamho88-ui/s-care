package demo.brain;
import org.springframework.stereotype.Service;
import java.util.*;
@Service
public class SkillEditing {
 private final Store s;private final KnowledgeEngine knowledge;public SkillEditing(Store s,KnowledgeEngine knowledge){this.s=s;this.knowledge=knowledge;}
 static final List<String> FIELDS=List.of("title","conditions","checks","solution","cautions");
 public Object edit(String id,Map<String,Object> body,boolean regenerate){Access.admin();String reason=Objects.toString(body.get("reason"),"");Harness.text(reason,1000,"수정 사유");if(!(body.get("revision") instanceof Number))throw new IllegalArgumentException("초안 버전이 필요합니다.");int revision=((Number)body.get("revision")).intValue();var original=s.one("SELECT * FROM skills WHERE id=?",id);check(original,revision);
  Map<String,Object> generated=null;var content=new LinkedHashMap<String,Object>();
  if(regenerate){if(original.get("incident_id")==null)throw new IllegalStateException("연결된 복구 이력이 없습니다.");var incident=s.incident(original.get("incident_id").toString());if(incident.get("deleted_at")!=null||!List.of("RESOLVED","CLOSED").contains(incident.get("status")))throw new IllegalStateException("복구 검증이 끝난 장애만 재생성할 수 있습니다.");generated=knowledge.draft(incident);content.putAll(s.json.convertValue(generated.get("content"),Map.class));content.put("title",original.get("title"));}
  else for(String field:FIELDS)content.put(field,body.get(field));
  for(String field:FIELDS)Harness.text(Objects.toString(content.get(field),""),field.equals("title")?200:6000,field);
  var provenance=generated;java.util.function.Supplier<Object> save=()->{var before=s.one("SELECT * FROM skills WHERE id=? FOR UPDATE",id);check(before,revision);
   s.db.update("UPDATE skills SET title=?,conditions=?,checks=?,solution=?,cautions=?,revision=revision+1 WHERE id=?",content.get("title"),content.get("conditions"),content.get("checks"),content.get("solution"),content.get("cautions"),id);
   if(provenance!=null)s.db.update("UPDATE skills SET source_provider=?,source_model=?,simulated=?,provenance_json=? WHERE id=?",provenance.get("provider"),provenance.get("model"),provenance.get("simulated"),s.encode(provenance),id);
   var after=s.one("SELECT * FROM skills WHERE id=?",id);String action=regenerate?"REGENERATE":"EDIT";
   s.db.update("INSERT INTO skill_revisions(skill_id,revision,action,actor,reason,before_json,after_json,created_at) VALUES (?,?,?,?,?,?,?,?)",id,revision+1,action,Access.actor(),reason,s.encode(before),s.encode(after),Store.now());
   s.audit((String)before.get("incident_id"),Access.actor(),"SKILL_"+action,Map.of("skillId",id,"revision",revision+1,"reason",reason));return after;
  };return regenerate?s.active(original.get("incident_id").toString(),save):s.tx(save);
 }
 private void check(Map<String,Object> row,int revision){if(!"DRAFT".equals(row.get("status")))throw new IllegalStateException("승인 전 초안만 수정할 수 있습니다.");if(((Number)row.get("revision")).intValue()!=revision)throw new IllegalStateException("다른 관리자가 초안을 변경했습니다. 새로고침 후 비교하세요.");}
}
