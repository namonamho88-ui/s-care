package demo.brain;

import com.fasterxml.jackson.databind.JsonNode;
import org.springframework.stereotype.Service;
import java.util.*;

@Service
public class KnowledgeEngine {
 private final Store s;private final LocalSkillStore store;private final HttpHermesAdapter real;private final MockHermesAdapter mock;
 private volatile Map<String,Object> last=Map.of();
 public KnowledgeEngine(Store s,LocalSkillStore store,HttpHermesAdapter real,MockHermesAdapter mock){this.s=s;this.store=store;this.real=real;this.mock=mock;}
 public Map<String,Object> status(){var result=new LinkedHashMap<>(real.probe());result.put("provider","HERMES_AGENT");result.put("lastResult",last);result.put("llmVerified",Boolean.TRUE.equals(result.get("apiReachable"))&&Boolean.FALSE.equals(last.get("simulated")));result.put("knowledgeStore","POSTGRESQL_APPROVED_SKILLS");return result;}
 private Map<String,Object> context(Map<String,Object> incident){
  var approved=store.search(incident.get("type").toString());
  var result=new LinkedHashMap<String,Object>();result.put("fictional",true);result.put("incidentId",incident.get("id"));result.put("type",incident.get("type"));result.put("observations",incident.get("observations"));
  result.put("approvedSkills",approved.get("skills"));result.put("manuals",approved.get("manuals"));
  result.put("similarIncidents",new SimilarIncidents(s).find(incident));
  return result;
 }
 public Map<String,Object> search(Map<String,Object> incident){
  var context=context(incident);var result=generate("search",context,incident);
  var content=s.json.valueToTree(result.get("content"));
  result.put("skills",select(context.get("approvedSkills"),content.path("skillIds")));result.put("manuals",select(context.get("manuals"),content.path("manualIds")));
  result.put("similarIncidents",context.get("similarIncidents"));result.put("explanation",content.path("explanation").asText());result.put("approvedOnly",true);return result;
 }
 public Map<String,Object> draft(Map<String,Object> incident){
  var context=context(incident);context.put("decision",s.decode(incident.get("decision_json")));context.put("verification",incident.get("notes"));context.put("impact",s.decode(incident.get("impact_json")));
  context.put("approvals",s.db.queryForList("SELECT approved,actor,reason FROM approvals WHERE incident_id=?",incident.get("id")));
  return generate("draft",context,incident);
 }
 private Map<String,Object> generate(String operation,Map<String,Object> context,Map<String,Object> incident){
  long started=System.nanoTime();
  Map<String,Object> result;
  if("DEMO".equals(incident.get("mode")))result=new LinkedHashMap<>(mock.generate(operation,context));
  else try{result=new LinkedHashMap<>(real.generate(operation,context));validate(operation,result,context);}
  catch(Exception e){result=new LinkedHashMap<>(mock.generate(operation,context));result.put("provider","MOCK_HERMES_FALLBACK");result.put("fallback",true);result.put("fallbackReason",e.getMessage());result.put("latencyMs",(System.nanoTime()-started)/1_000_000);}
  result.put("requestedProvider","DEMO".equals(incident.get("mode"))?"MOCK_HERMES":"HERMES_AGENT");result.put("operation",operation);result.put("fictional",true);
  validate(operation,result,context);
  var metadata=new LinkedHashMap<>(result);metadata.remove("content");metadata.put("at",java.time.Instant.now().toString());last=Map.copyOf(metadata);
  var recorded=result;s.active(incident.get("id").toString(),()->{s.audit(incident.get("id").toString(),"hermes","HERMES_"+operation.toUpperCase(Locale.ROOT),recorded);return null;});return result;
 }
 private void validate(String op,Map<String,Object> result,Map<String,Object> context){
  var c=s.json.valueToTree(result.get("content"));
  if(op.equals("search")){
   select(context.get("approvedSkills"),c.path("skillIds"));select(context.get("manuals"),c.path("manualIds"));required(c,"explanation");
   if(c.path("skillIds").isEmpty()&&!((List<?>)context.get("approvedSkills")).isEmpty())throw new IllegalStateException("HERMES_NO_APPROVED_SKILL_SELECTED");
  }else for(String field:List.of("conditions","checks","solution","cautions"))required(c,field);
 }
 private void required(JsonNode c,String field){if(!c.path(field).isTextual()||c.path(field).asText().isBlank()||c.path(field).asText().length()>6000)throw new IllegalStateException("HERMES_INVALID_FIELD_"+field);}
 private List<Map<?,?>> select(Object available,JsonNode selected){
  if(!selected.isArray())throw new IllegalStateException("HERMES_INVALID_REFERENCES");
  Map<String,Map<?,?>> lookup=new LinkedHashMap<>();for(var item:(List<?>)available){var row=(Map<?,?>)item;lookup.put(row.get("id").toString(),row);}
  var result=new ArrayList<Map<?,?>>();var seen=new HashSet<String>();
  for(var id:selected){if(!id.isTextual()||!lookup.containsKey(id.asText()))throw new IllegalStateException("HERMES_UNAPPROVED_REFERENCE");if(seen.add(id.asText()))result.add(lookup.get(id.asText()));}return result;
 }
}
