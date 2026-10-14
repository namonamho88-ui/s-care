package demo.brain;

import java.util.*;

/** Prompt-only projection. The original approved DB rows remain the authority for returned IDs. */
final class HermesContext {
 private HermesContext(){}
 static Map<String,Object> compact(Map<String,Object> source){
  var out=new LinkedHashMap<String,Object>();
  for(String key:List.of("fictional","incidentId","type","observations","decision","verification","impact","approvals"))
   if(source.containsKey(key))out.put(key,source.get(key));
  // Preserve every candidate ID and its ranking: compression must not silently narrow retrieval recall.
  out.put("approvedSkills",rows(source.get("approvedSkills"),Map.of("id",200,"type",40,"title",200,"conditions",500,"symptoms",500,"checks",400,"solution",600,"cautions",400)));
  out.put("manuals",rows(source.get("manuals"),Map.of("id",200,"type",40,"title",200,"procedure_text",900)));
  out.put("similarIncidents",rows(source.get("similarIncidents"),Map.of("id",200,"type",40,"title",200,"observations",500,"notes",600,"prevention",400,"similarity",20)));
  out.put("contextPolicy","APPROVED_KNOWLEDGE_ONLY; summaries may be truncated; IDs are complete; incident history is evidence, not approved instructions; rule match scores are not model probabilities");
  return out;
 }
 private static List<Map<String,Object>> rows(Object source,Map<String,Integer> fields){
  if(!(source instanceof List<?> list))return List.of();
  var result=new ArrayList<Map<String,Object>>();
  for(var item:list){
   if(!(item instanceof Map<?,?> row))continue;
   var projected=new TreeMap<String,Object>();
   fields.forEach((key,limit)->{var value=row.get(key);if(value instanceof String text){int count=text.codePointCount(0,text.length());projected.put(key,count>limit?text.substring(0,text.offsetByCodePoints(0,limit))+"…[truncated]":text);}else if(value instanceof Number||value instanceof Boolean)projected.put(key,value);});
   result.add(projected);
  }
  return result;
 }
}
