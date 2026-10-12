package demo.brain;
import org.springframework.stereotype.Service;
import java.util.*;
@Service
public class SimilarIncidents {
 private final Store s;public SimilarIncidents(Store s){this.s=s;}
 static Set<String> tokens(String text){var set=new HashSet<String>();for(String t:text.toLowerCase(Locale.ROOT).split("[^\\p{L}\\p{N}]+"))if(t.length()>1&&!Set.of("가상","장애","발생","확인","정상","the","and").contains(t))set.add(t);return set;}
 public List<Map<String,Object>> find(Map<String,Object> incident){var target=tokens(incident.get("observations").toString());var results=new ArrayList<Map<String,Object>>();
  for(var row:s.db.queryForList("SELECT id,title,type,asset_id,observations,notes,prevention,resolved_at,mode,provider FROM incidents WHERE id<>? AND status='CLOSED' AND deleted_at IS NULL ORDER BY created_at DESC LIMIT 1000",incident.get("id"))){
   var words=tokens(row.get("observations").toString());var overlap=new HashSet<>(target);overlap.retainAll(words);var union=new HashSet<>(target);union.addAll(words);
   double text=union.isEmpty()?0:overlap.size()/(double)union.size();boolean sameType=row.get("type").equals(incident.get("type")),sameAsset=row.get("asset_id").equals(incident.get("asset_id"));double score=text*.65+(sameType?.25:0)+(sameAsset?.10:0);
   if(score<.12)continue;row.put("similarity",Math.round(score*100));row.put("matchedTerms",overlap.stream().sorted().limit(8).toList());row.put("sameType",sameType);row.put("sameAsset",sameAsset);row.put("method","TEXT_JACCARD_TYPE_ASSET");results.add(row);
  }
  results.sort(Comparator.<Map<String,Object>>comparingLong(x->((Number)x.get("similarity")).longValue()).reversed().thenComparing(x->x.get("id").toString()));return results.stream().limit(5).toList();
 }
}
