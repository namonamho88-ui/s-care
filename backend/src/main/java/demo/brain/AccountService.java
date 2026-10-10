package demo.brain;

import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.http.HttpStatus;
import javax.crypto.SecretKeyFactory;
import javax.crypto.spec.PBEKeySpec;
import java.security.*;
import java.nio.charset.StandardCharsets;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.*;

@Service
public class AccountService {
 private final Store s;
 private final SecureRandom random=new SecureRandom();
 private final String dummyPassword;
 // Bounded process-wide limit complements persistent per-account locks. Single-instance deployment.
 private long window=0;private int requests=0;
 public AccountService(Store s){this.s=s;dummyPassword=passwordHash(randomSecret());}
 private synchronized void throttle(){long now=System.currentTimeMillis()/60000;if(window!=now){window=now;requests=0;}if(++requests>120)throw new ResponseStatusException(HttpStatus.TOO_MANY_REQUESTS,"로그인 요청이 많습니다. 잠시 후 다시 시도하세요.");}
 private String randomSecret(){byte[] bytes=new byte[32];random.nextBytes(bytes);return Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);}
 static String digest(String text){try{return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(text.getBytes(StandardCharsets.UTF_8)));}catch(GeneralSecurityException e){throw new IllegalStateException(e);}}
 private String passwordHash(String password){byte[] salt=new byte[16];random.nextBytes(salt);return "pbkdf2-sha256$600000$"+Base64.getEncoder().encodeToString(salt)+"$"+Base64.getEncoder().encodeToString(derive(password,salt,600000));}
 private static byte[] derive(String password,byte[] salt,int count){var spec=new PBEKeySpec(password.toCharArray(),salt,count,256);try{return SecretKeyFactory.getInstance("PBKDF2WithHmacSHA256").generateSecret(spec).getEncoded();}catch(GeneralSecurityException e){throw new IllegalStateException(e);}finally{spec.clearPassword();}}
 private static boolean matches(String password,String hash){String[] parts=hash.split("\\$");return MessageDigest.isEqual(derive(password,Base64.getDecoder().decode(parts[2]),Integer.parseInt(parts[1])),Base64.getDecoder().decode(parts[3]));}
 private static String loginName(String name){if(name==null||!name.matches("[A-Za-z0-9][A-Za-z0-9._-]{2,59}"))throw new IllegalArgumentException("아이디는 영문·숫자로 시작하는 3~60자의 영문·숫자·점·밑줄·하이픈입니다.");return name.toLowerCase(Locale.ROOT);}
 private static void password(String value){if(value==null||value.length()<12||value.length()>128)throw new IllegalArgumentException("비밀번호는 12~128자로 입력하세요.");}
 private static ResponseStatusException invalid(){return new ResponseStatusException(HttpStatus.UNAUTHORIZED,"아이디 또는 인증 정보를 확인하세요. 반복 실패 시 15분 후 다시 시도하세요.");}
 private boolean locked(Map<String,Object> user){return user.get("locked_until") instanceof Timestamp until && until.toInstant().isAfter(Instant.now());}
 private void failed(Map<String,Object> user){int failures=((Number)user.get("failed_attempts")).intValue()+1;s.db.update("UPDATE app_users SET failed_attempts=?,locked_until=? WHERE id=?",failures,failures>=5?Timestamp.from(Instant.now().plusSeconds(900)):null,user.get("id"));}
 private List<Map<String,Object>> find(String login){return s.db.queryForList("SELECT * FROM app_users WHERE login=? FOR UPDATE",login);}
 private Access.Identity identity(Map<String,Object> row,String hash){return new Access.Identity(row.get("id").toString(),row.get("login").toString(),row.get("display_name").toString(),row.get("role").toString(),row.get("operator_id").toString(),"ACCOUNT",hash);}
 private Map<String,Object> session(Map<String,Object> row){
  String token=randomSecret();
  s.db.update("DELETE FROM app_sessions WHERE expires_at<=?",Store.now());
  s.db.update("INSERT INTO app_sessions(token_hash,user_id,expires_at,created_at) VALUES (?,?,?,?)",digest(token),row.get("id"),Timestamp.from(Instant.now().plusSeconds(28800)),Store.now());
  s.db.update("UPDATE app_users SET failed_attempts=0,locked_until=NULL WHERE id=?",row.get("id"));
  return Map.of("token",token,"user",identity(row,digest(token)).view());
 }
 public Map<String,Object> login(String name,String password){
  throttle();String login=loginName(name);if(password==null||password.length()>128)throw invalid();
  // Return failure from the transaction so failed-attempt accounting is committed.
  var result=s.tx(()->{var rows=find(login);if(rows.isEmpty()){matches(password,dummyPassword);return null;}var row=rows.get(0);if(locked(row))return null;
   if(row.get("locked_until")!=null){s.db.update("UPDATE app_users SET failed_attempts=0,locked_until=NULL WHERE id=?",row.get("id"));row.put("failed_attempts",0);}
   String hash=Objects.toString(row.get("password_hash"),dummyPassword);boolean valid=matches(password,hash);
   if(!Boolean.TRUE.equals(row.get("enabled"))||row.get("password_hash")==null||!valid){failed(row);s.audit(null,row.get("id").toString(),"LOGIN_FAILED",Map.of());return null;}
   s.audit(null,row.get("id").toString(),"LOGIN",Map.of());return session(row);
  });if(result==null)throw invalid();return result;
 }
 public Map<String,Object> activate(String name,String code,String password){
  throttle();String login=loginName(name);password(password);if(code==null||code.length()>100)throw invalid();
  var result=s.tx(()->{var rows=find(login);if(rows.isEmpty())return null;var row=rows.get(0);
   if(!Boolean.TRUE.equals(row.get("enabled"))||row.get("invite_hash")==null||!(row.get("invite_expires_at") instanceof Timestamp expiry)||expiry.toInstant().isBefore(Instant.now())||!MessageDigest.isEqual(digest(code).getBytes(StandardCharsets.US_ASCII),row.get("invite_hash").toString().getBytes(StandardCharsets.US_ASCII)))return null;
   s.db.update("UPDATE app_users SET password_hash=?,invite_hash=NULL,invite_expires_at=NULL,failed_attempts=0,locked_until=NULL WHERE id=?",passwordHash(password),row.get("id"));
   s.db.update("DELETE FROM app_sessions WHERE user_id=?",row.get("id"));s.audit(null,row.get("id").toString(),"ACCOUNT_ACTIVATED",Map.of());return session(row);
  });if(result==null)throw invalid();return result;
 }
 public Access.Identity authenticate(String token){if(token==null||token.length()!=43)return null;String hash=digest(token);var rows=s.db.queryForList("SELECT u.* FROM app_sessions x JOIN app_users u ON u.id=x.user_id WHERE x.token_hash=? AND x.expires_at>? AND u.enabled=TRUE AND u.password_hash IS NOT NULL",hash,Store.now());return rows.isEmpty()?null:identity(rows.get(0),hash);}
 public boolean active(Access.Identity identity){return identity.kind().equals("BOOTSTRAP")||s.db.queryForObject("SELECT COUNT(*) FROM app_sessions x JOIN app_users u ON u.id=x.user_id WHERE x.token_hash=? AND x.expires_at>? AND u.enabled=TRUE",Integer.class,identity.sessionHash(),Store.now())==1;}
 public void logout(){var me=Access.current();if(me.kind().equals("ACCOUNT")){s.db.update("DELETE FROM app_sessions WHERE token_hash=?",me.sessionHash());s.audit(null,me.id(),"LOGOUT",Map.of());}}
 public void changePassword(String oldPassword,String newPassword){throttle();var me=Access.current();if(!me.kind().equals("ACCOUNT"))throw new IllegalArgumentException("개인 계정으로 로그인한 후 변경하세요.");password(newPassword);if(oldPassword==null||oldPassword.length()>128)throw invalid();
  boolean ok=s.tx(()->{var row=s.one("SELECT * FROM app_users WHERE id=? FOR UPDATE",me.id());if(locked(row)||row.get("password_hash")==null)return false;if(!matches(oldPassword,row.get("password_hash").toString())){failed(row);return false;}
   s.db.update("UPDATE app_users SET password_hash=?,failed_attempts=0,locked_until=NULL WHERE id=?",passwordHash(newPassword),me.id());s.db.update("DELETE FROM app_sessions WHERE user_id=?",me.id());s.audit(null,me.id(),"PASSWORD_CHANGED",Map.of());return true;});if(!ok)throw new org.springframework.web.server.ResponseStatusException(org.springframework.http.HttpStatus.BAD_REQUEST,"현재 비밀번호를 확인하세요. 반복 실패 시 15분 후 다시 시도하세요.");
 }
 public Object list(){Access.admin();return s.db.queryForList("SELECT u.id,u.login,u.display_name,u.role,u.operator_id,u.enabled,u.created_at,u.invite_expires_at,CASE WHEN u.password_hash IS NULL THEN 'PENDING' ELSE 'ACTIVE' END account_status,o.name operator_name FROM app_users u JOIN operators o ON o.id=u.operator_id ORDER BY u.created_at,u.id");}
 public Map<String,Object> invite(Map<String,String> body){Access.admin();String login=loginName(body.get("login")),name=body.get("displayName"),role=body.getOrDefault("role","USER"),operator=body.get("operatorId");Harness.text(name,100,"표시 이름");if(!List.of("USER","ADMIN").contains(role))throw new IllegalArgumentException("잘못된 역할입니다.");s.one("SELECT id FROM operators WHERE id=?",operator);
  return s.tx(()->{String id=Store.id("USR-");if(s.db.queryForObject("SELECT COUNT(*) FROM app_users WHERE login=? OR operator_id=?",Integer.class,login,operator)>0)throw new IllegalStateException("이미 등록된 아이디 또는 담당자입니다.");s.db.update("INSERT INTO app_users(id,login,display_name,role,operator_id,created_at) VALUES (?,?,?,?,?,?)",id,login,name,role,operator,Store.now());return issue(id,"ACCOUNT_INVITED");});
 }
 private Map<String,Object> issue(String id,String action){String code=randomSecret();Timestamp expires=Timestamp.from(Instant.now().plusSeconds(86400));s.db.update("UPDATE app_users SET invite_hash=?,invite_expires_at=?,password_hash=NULL,failed_attempts=0,locked_until=NULL WHERE id=?",digest(code),expires,id);s.db.update("DELETE FROM app_sessions WHERE user_id=?",id);s.audit(null,Access.actor(),action,Map.of("userId",id));return Map.of("id",id,"inviteCode",code,"expiresAt",expires.toInstant().toString());}
 public Map<String,Object> reinvite(String id){Access.admin();if(id.equals(Access.current().id()))throw new IllegalArgumentException("본인 계정은 비밀번호 변경을 이용하세요.");return s.tx(()->{var row=s.one("SELECT * FROM app_users WHERE id=? FOR UPDATE",id);if(!Boolean.TRUE.equals(row.get("enabled")))throw new IllegalStateException("비활성 계정은 먼저 활성화하세요.");return issue(id,"ACCOUNT_REINVITED");});}
 public void enabled(String id,boolean enabled){Access.admin();if(id.equals(Access.current().id()))throw new IllegalArgumentException("본인 계정은 비활성화할 수 없습니다.");s.tx(()->{s.one("SELECT id FROM app_users WHERE id=? FOR UPDATE",id);s.db.update("UPDATE app_users SET enabled=? WHERE id=?",enabled,id);s.db.update("DELETE FROM app_sessions WHERE user_id=?",id);if(!enabled)s.db.update("UPDATE app_users SET invite_hash=NULL,invite_expires_at=NULL WHERE id=?",id);s.audit(null,Access.actor(),enabled?"ACCOUNT_ENABLED":"ACCOUNT_DISABLED",Map.of("userId",id));return null;});}
}
