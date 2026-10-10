package demo.brain;

import org.springframework.stereotype.Service;
import org.springframework.beans.factory.annotation.Value;
import java.nio.file.*;
import java.nio.charset.StandardCharsets;
import java.util.*;
import java.net.URI;
import java.net.http.*;
import java.time.Duration;
import java.security.MessageDigest;

/** Approved-only publication; HTTP targets our bridge, not an undocumented Hermes API. */
@Service
public class HermesSkillPublisher {
 private final Store s;private final String directory,mode,url,key;
 private final HttpClient http=HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(3)).build();
 public HermesSkillPublisher(Store s,@Value("${brain.hermes-skills-dir:}") String directory,
  @Value("${brain.hermes-publish-mode:filesystem}") String mode,@Value("${brain.hermes-publish-url:}") String url,
  @Value("${brain.hermes-publish-key:}") String key){
  this.s=s;this.directory=directory;this.mode=mode;this.url=url.replaceAll("/+$","");this.key=key;
  if(!List.of("filesystem","http","disabled").contains(mode))throw new IllegalArgumentException("Invalid HERMES_PUBLISH_MODE");
  if(mode.equals("http")){
   var uri=URI.create(this.url);
   if(!List.of("http","https").contains(uri.getScheme())||uri.getHost()==null||uri.getUserInfo()!=null||uri.getQuery()!=null||uri.getFragment()!=null||key.length()<32)
    throw new IllegalArgumentException("HTTP Skill publishing requires a server URL and a separate key of at least 32 characters");
  }
 }
 public boolean configured(){return mode.equals("http")||mode.equals("filesystem")&&!directory.isBlank();}
 public String transport(){return mode;}
 public synchronized Map<String,Object> publish(String id){
  var skill=s.one("SELECT * FROM skills WHERE id=?",id);
  if(!"APPROVED".equals(skill.get("status")))throw new IllegalStateException("Only approved skills can be exported");
  if(!configured())return Map.of("skillId",id,"status","NOT_CONFIGURED");
  if(!id.matches("[A-Za-z0-9-]{1,40}"))throw new IllegalArgumentException("Invalid skill id");
  try{
   String body="---\nname: incident-brain-"+id.toLowerCase(Locale.ROOT)+"\ndescription: "+s.encode(skill.get("title"))+"\n---\n\n# "+skill.get("title")+"\n\n100% 가상 데이터 · 관리자 승인 지식 · 실제 시스템 변경 금지\n\n"+
    "출처: "+skill.get("source_provider")+" / "+skill.get("source_model")+" · simulated="+skill.get("simulated")+"\n\n## 적용 조건\n"+skill.get("conditions")+"\n\n## 점검 절차\n"+skill.get("checks")+"\n\n## 해결 방법\n"+skill.get("solution")+"\n\n## 주의사항\n"+skill.get("cautions")+"\n";
   if(mode.equals("http"))publishHttp(id,body);else publishFile(id,body);
   s.db.update("UPDATE skills SET export_status='EXPORTED' WHERE id=?",id);s.audit(null,"hermes","SKILL_EXPORTED",Map.of("skillId",id,"approved",true,"transport",mode));return Map.of("skillId",id,"status","EXPORTED","transport",mode);
  }catch(Exception e){s.db.update("UPDATE skills SET export_status='FAILED' WHERE id=?",id);s.audit(null,"hermes","SKILL_EXPORT_FAILED",Map.of("skillId",id,"reason",e.getClass().getSimpleName()));return Map.of("skillId",id,"status","FAILED");}
 }
 private void publishFile(String id,String body)throws Exception{
  Path root=Path.of(directory).toAbsolutePath().normalize();Files.createDirectories(root);root=root.toRealPath();
  Path folder=root.resolve("incident-brain-"+id.toLowerCase(Locale.ROOT));
  if(Files.isSymbolicLink(folder))throw new IllegalStateException("Symbolic link not allowed");
  Files.createDirectories(folder);if(!folder.toRealPath().startsWith(root))throw new IllegalStateException("Invalid export path");
  Path temp=Files.createTempFile(folder,"skill-",".tmp");
  try{Files.writeString(temp,body,StandardCharsets.UTF_8);Files.move(temp,folder.resolve("SKILL.md"),StandardCopyOption.REPLACE_EXISTING,StandardCopyOption.ATOMIC_MOVE);}
  finally{Files.deleteIfExists(temp);}
 }
 private void publishHttp(String id,String body)throws Exception{
  String digest=HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(body.getBytes(StandardCharsets.UTF_8)));
  var request=HttpRequest.newBuilder(URI.create(url+"/skills/"+id)).timeout(Duration.ofSeconds(10))
   .header("Authorization","Bearer "+key).header("Content-Type","application/json")
   .PUT(HttpRequest.BodyPublishers.ofString(s.encode(Map.of("approved",true,"fictional",true,"markdown",body,"sha256",digest)))).build();
  final HttpResponse<String> response;
  try{response=http.send(request,HttpResponse.BodyHandlers.ofString());}
  catch(InterruptedException e){Thread.currentThread().interrupt();throw e;}
  if(response.statusCode()!=200)throw new IllegalStateException("Skill bridge HTTP "+response.statusCode());
  var result=s.json.readTree(response.body());
  if(!result.path("status").asText().equals("EXPORTED")||!result.path("skillId").asText().equals(id)||!result.path("sha256").asText().equals(digest))
   throw new IllegalStateException("Skill bridge receipt mismatch");
 }
 public Map<String,Object> sync(String after,int limit){
  if(limit<1||limit>5)throw new IllegalArgumentException("Skill sync limit must be between 1 and 5");
  if(!after.isEmpty()&&!after.matches("[A-Za-z0-9-]{1,40}"))throw new IllegalArgumentException("Invalid Skill sync cursor");
  if(!configured())return Map.of("configured",false,"results",List.of(),"hasMore",false,"nextCursor","");
  // At most five 10-second HTTP calls per request, with one look-ahead row.
  var rows=s.db.queryForList("SELECT id FROM skills WHERE status='APPROVED' AND id>? ORDER BY id LIMIT ?",after,limit+1);
  var results=new ArrayList<Map<String,Object>>();String cursor=after;
  for(var row:rows.subList(0,Math.min(rows.size(),limit))){cursor=row.get("id").toString();results.add(publish(cursor));}
  boolean hasMore=rows.size()>limit;
  return Map.of("configured",true,"results",results,"hasMore",hasMore,"nextCursor",hasMore?cursor:"");
 }
}
