package demo.brain;

import org.springframework.web.context.request.RequestContextHolder;
import org.springframework.web.context.request.ServletRequestAttributes;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.http.HttpStatus;
import java.util.Map;

/** Request identity comes exclusively from SecurityFilter, never from client JSON. */
public final class Access {
 public record Identity(String id,String login,String displayName,String role,String operatorId,String kind,String sessionHash) {
  public boolean admin(){return role.equals("ADMIN");}
  public Map<String,Object> view(){return Map.of("id",id,"login",login,"displayName",displayName,"role",role,"operatorId",operatorId,"kind",kind);}
 }
 public static Identity current(){
  var attributes=RequestContextHolder.getRequestAttributes();
  if(attributes instanceof ServletRequestAttributes r && r.getRequest().getAttribute("brain.identity") instanceof Identity identity)return identity;
  throw new ResponseStatusException(HttpStatus.UNAUTHORIZED,"로그인이 필요합니다.");
 }
 public static String actor(){
  var attributes=RequestContextHolder.getRequestAttributes();
  if(attributes instanceof ServletRequestAttributes r && r.getRequest().getAttribute("brain.identity") instanceof Identity identity)return identity.id();
  return "system";
 }
 public static void admin(){if(!current().admin())throw denied();}
 public static ResponseStatusException denied(){return new ResponseStatusException(HttpStatus.FORBIDDEN,"이 작업을 수행할 권한이 없습니다.");}
 private Access(){}
}
