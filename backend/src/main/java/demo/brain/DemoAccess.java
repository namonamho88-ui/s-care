package demo.brain;
import org.springframework.stereotype.Service;
import org.springframework.core.env.Environment;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.http.HttpStatus;
import java.time.Instant;
import java.sql.Timestamp;
import java.util.*;
import java.security.*;
import jakarta.servlet.http.HttpServletRequest;
@Service
public class DemoAccess {
 private final Store s;private final Environment e;private long window;private int issues;
 public DemoAccess(Store s,Environment e){this.s=s;this.e=e;}
 @jakarta.annotation.PostConstruct void revokeDisabled(){if(!permitted())s.db.update("DELETE FROM demo_sessions");}
 boolean isolated(){return "isolated-demo".equals(e.getProperty("DEMO_DEPLOYMENT_ENV",""));}
 private boolean permitted(){return isolated()&&e.getProperty("DEMO_ACCESS_ENABLED",Boolean.class,false);}
 private Instant expiry(){try{return Instant.parse(e.getProperty("DEMO_ACCESS_EXPIRES_AT",""));}catch(Exception ex){return Instant.EPOCH;}}
 public boolean active(){return permitted()&&Instant.now().isBefore(expiry())&&Boolean.TRUE.equals(s.one("SELECT enabled FROM demo_access_settings WHERE id=1").get("enabled"));}
 private boolean secret(String actual,String key){String expected=e.getProperty(key,"");return expected.length()>=32&&actual!=null&&MessageDigest.isEqual(expected.getBytes(java.nio.charset.StandardCharsets.UTF_8),actual.getBytes(java.nio.charset.StandardCharsets.UTF_8));}
 public boolean gateway(HttpServletRequest r){return isolated()&&secret(r.getHeader("X-Demo-Gateway"),"DEMO_GATEWAY_KEY")&&Objects.equals(e.getProperty("DEMO_ALLOWED_ORIGIN"),r.getHeader("X-Demo-Origin"));}
 public boolean control(HttpServletRequest r){return isolated()&&secret(r.getHeader("X-Demo-Control"),"DEMO_CONTROL_KEY");}
 public Map<String,Object> status(){return Map.of("allowed",permitted(),"enabled",active(),"expiresAt",expiry().toString(),"isolated",isolated());}
 public Object toggle(boolean enabled,String actor){if(enabled&&!permitted())throw Access.denied();if(enabled&&!Instant.now().isBefore(expiry()))throw new IllegalStateException("시연 허용 시간이 지났습니다.");Harness.text(actor,60,"관리자");return s.tx(()->{s.one("SELECT id FROM demo_access_settings WHERE id=1 FOR UPDATE");s.db.update("UPDATE demo_access_settings SET enabled=?,epoch=epoch+1 WHERE id=1",enabled);s.db.update("DELETE FROM demo_sessions");s.audit(null,actor,"DEMO_ACCESS_CHANGED",Map.of("enabled",enabled));return status();});}
 public synchronized Object issue(){
  long minute=System.currentTimeMillis()/60000;if(window!=minute){window=minute;issues=0;}if(++issues>120)throw new ResponseStatusException(HttpStatus.TOO_MANY_REQUESTS,"시연 접속 요청이 많습니다.");
  return s.tx(()->{var setting=s.one("SELECT * FROM demo_access_settings WHERE id=1 FOR UPDATE");if(!active())throw new ResponseStatusException(HttpStatus.UNAUTHORIZED,"시연 접속이 종료되었거나 허용되지 않습니다.");
   byte[] random=new byte[32];new SecureRandom().nextBytes(random);String token="demo_"+Base64.getUrlEncoder().withoutPadding().encodeToString(random),hash=AccountService.digest(token),actor=Store.id("DEMO-");Instant until=Instant.now().plusSeconds(3600);if(until.isAfter(expiry()))until=expiry();
   s.db.update("DELETE FROM demo_sessions WHERE expires_at<=?",Store.now());s.db.update("INSERT INTO demo_sessions VALUES (?,?,?,?)",hash,actor,setting.get("epoch"),Timestamp.from(until));return Map.of("token",token,"user",identity(actor,hash).view(),"expiresAt",until.toString());});
 }
 private Access.Identity identity(String actor,String hash){return new Access.Identity(actor,actor,"시연 참가자","DEMO_ADMIN","OP-01","DEMO",hash);}
 public Access.Identity authenticate(String token){if(token==null||token.length()!=48||!token.startsWith("demo_"))return null;return byHash(AccountService.digest(token));}
 private Access.Identity byHash(String hash){if(!active())return null;var rows=s.db.queryForList("SELECT d.actor FROM demo_sessions d JOIN demo_access_settings s ON s.id=1 AND s.epoch=d.epoch WHERE d.token_hash=? AND d.expires_at>?",hash,Store.now());return rows.isEmpty()?null:identity(rows.get(0).get("actor").toString(),hash);}
 public boolean active(Access.Identity identity){return byHash(identity.sessionHash())!=null;}
 public void logout(){s.db.update("DELETE FROM demo_sessions WHERE token_hash=?",Access.current().sessionHash());}
}
