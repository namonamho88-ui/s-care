package demo.brain;

import org.springframework.boot.test.web.client.TestRestTemplate;
import org.springframework.http.*;
import java.util.*;
import static org.assertj.core.api.Assertions.*;

/** Real HTTP/SQL checks, reused by H2 and PostgreSQL CI runs. Only fictional accounts. */
class AccountChecks {
 final Store s;final TestRestTemplate http;final String admin;
 static final String PASSWORD="fictional-account-password-2026";
 AccountChecks(Store s,TestRestTemplate http,String admin){this.s=s;this.http=http;this.admin=admin;}
 ResponseEntity<Map> request(String token,HttpMethod method,String path,Object body){var headers=new HttpHeaders();if(token!=null)headers.setBearerAuth(token);return http.exchange(path,method,new HttpEntity<>(body,headers),Map.class);}
 ResponseEntity<Map> post(String token,String path,Object body){return request(token,HttpMethod.POST,path,body);}
 ResponseEntity<Map> get(String token,String path){return request(token,HttpMethod.GET,path,null);}
 Map invite(String login,String role,String operator){var r=post(admin,"/api/auth/users",Map.of("login",login,"displayName","가상 검증 계정","role",role,"operatorId",operator));assertThat(r.getStatusCode().value()).isEqualTo(200);return r.getBody();}
 Map activate(String login,Object code){var r=post(null,"/api/auth/activate",Map.of("login",login,"inviteCode",code,"password",PASSWORD));assertThat(r.getStatusCode().value()).isEqualTo(200);return r.getBody();}
 String login(String login,String password){var r=post(null,"/api/auth/login",Map.of("login",login,"password",password));assertThat(r.getStatusCode().value()).isEqualTo(200);return r.getBody().get("token").toString();}
 void invitationAndSessionLifecycle(){
  var invitation=invite("fictional.lifecycle","USER","OP-11");String id=invitation.get("id").toString(),code=invitation.get("inviteCode").toString();
  assertThat(s.one("SELECT * FROM app_users WHERE id=?",id).toString()).doesNotContain(code);
  var activated=activate("FICTIONAL.LIFECYCLE",code);String token=activated.get("token").toString();
  assertThat(s.one("SELECT * FROM app_users WHERE id=?",id).get("password_hash").toString()).startsWith("pbkdf2-sha256$600000$").doesNotContain(PASSWORD);
  assertThat(s.db.queryForList("SELECT * FROM app_sessions").toString()).doesNotContain(token);
  assertThat(post(null,"/api/auth/activate",Map.of("login","fictional.lifecycle","inviteCode",code,"password",PASSWORD)).getStatusCode().value()).isEqualTo(401);
  assertThat(get(token,"/api/auth/me").getBody()).containsEntry("role","USER").doesNotContainKeys("sessionHash","password_hash","inviteCode");
  String second=login("fictional.lifecycle",PASSWORD);
  assertThat(post(token,"/api/auth/password",Map.of("oldPassword",PASSWORD,"newPassword",PASSWORD+"-new")).getStatusCode().value()).isEqualTo(200);
  assertThat(get(token,"/api/config").getStatusCode().value()).isEqualTo(401);assertThat(get(second,"/api/config").getStatusCode().value()).isEqualTo(401);
  String changed=login("fictional.lifecycle",PASSWORD+"-new");assertThat(post(changed,"/api/auth/logout",null).getStatusCode().value()).isEqualTo(200);assertThat(get(changed,"/api/config").getStatusCode().value()).isEqualTo(401);
  String expired=login("fictional.lifecycle",PASSWORD+"-new");s.db.update("UPDATE app_sessions SET expires_at=TIMESTAMP '2000-01-01 00:00:00' WHERE user_id=?",id);assertThat(get(expired,"/api/config").getStatusCode().value()).isEqualTo(401);
  String disabled=login("fictional.lifecycle",PASSWORD+"-new");assertThat(request(admin,HttpMethod.PATCH,"/api/auth/users/"+id,Map.of("enabled",false)).getStatusCode().value()).isEqualTo(200);assertThat(get(disabled,"/api/config").getStatusCode().value()).isEqualTo(401);
  assertThat(post(null,"/api/auth/login",Map.of("login","fictional.lifecycle","password",PASSWORD+"-new")).getStatusCode().value()).isEqualTo(401);
 }
 void rolesAndOwnership()throws Exception{
  var inv=invite("fictional.operator","USER","OP-01");String token=activate("fictional.operator",inv.get("inviteCode")).get("token").toString();
  for(String path:List.of("/api/auth/users","/api/audit","/api/evaluations"))assertThat(get(token,path).getStatusCode().value()).as(path).isEqualTo(403);
  for(String path:List.of("/api/simulate","/api/evaluations","/api/hermes/sync","/api/auth/users","/api/incidents/INC-SEED-001/review","/api/incidents/INC-SEED-001/approval","/api/incidents/INC-SEED-001/retry","/api/incidents/INC-SEED-001/close","/api/skills/SKL-01/review","/mcp","/a2a/recovery"))assertThat(post(token,path,Map.of()).getStatusCode().value()).as(path).isEqualTo(403);
  var own=s.one("SELECT * FROM incidents WHERE owner_id='OP-01' AND status='CLOSED' LIMIT 1");String id=own.get("id").toString();
  try {
   assertThat(request(token,HttpMethod.PATCH,"/api/incidents/"+id,Map.of("notes","가상 담당자 후기 검증","prevention","가상 예방 검증")).getStatusCode().value()).isEqualTo(200);
   assertThat(s.one("SELECT actor FROM audit WHERE incident_id=? AND action='EDIT' ORDER BY id DESC LIMIT 1",id).get("actor")).isEqualTo(inv.get("id"));
   for(var denied:List.of(Map.of("ownerId","OP-01"),Map.of("title","권한 초과"),Map.of("role","ADMIN")))assertThat(request(token,HttpMethod.PATCH,"/api/incidents/"+id,denied).getStatusCode().value()).isEqualTo(403);
   String other=s.one("SELECT id FROM incidents WHERE owner_id<>'OP-01' LIMIT 1").get("id").toString();assertThat(request(token,HttpMethod.PATCH,"/api/incidents/"+other,Map.of("notes","권한 초과")).getStatusCode().value()).isEqualTo(403);
   assertThat((List<?>)get(token,"/api/incidents/"+id).getBody().get("audit")).isEmpty();
   var headers=new HttpHeaders();headers.setBearerAuth(token);
   byte[] report=http.exchange("/api/incidents/"+id+"/report/xlsx",HttpMethod.GET,new HttpEntity<>(headers),byte[].class).getBody();
   try(var workbook=new org.apache.poi.xssf.usermodel.XSSFWorkbook(new java.io.ByteArrayInputStream(report))){assertThat(workbook.getNumberOfSheets()).isEqualTo(3);assertThat(workbook.getSheet("audit")).isNull();}
   var knowledge=http.exchange("/api/skills",HttpMethod.GET,new HttpEntity<>(headers),List.class).getBody();assertThat(knowledge).allMatch(row -> ((Map)row).get("status").equals("APPROVED"));
   assertThat(get(token,"/api/graph").getStatusCode().value()).isEqualTo(200);
   var registered=post(token,"/api/incidents",Map.of("title","가상 개인 계정 등록 검증","assetId","CMP-01","observations","fictional insufficient evidence","mode","DEMO","provider","MOCK","ownerId","OP-01"));assertThat(registered.getStatusCode().value()).isEqualTo(200);
   String created=registered.getBody().get("id").toString();assertThat(s.one("SELECT actor FROM audit WHERE incident_id=? AND action='CREATE'",created).get("actor")).isEqualTo(inv.get("id"));
  } finally {s.db.update("UPDATE incidents SET notes=?,prevention=? WHERE id=?",own.get("notes"),own.get("prevention"),id);}
 }
 void adminIdentityAndRecovery()throws Exception{
  var inv=invite("fictional.admin","ADMIN","OP-13");String token=activate("fictional.admin",inv.get("inviteCode")).get("token").toString(),id=inv.get("id").toString();
  var headers=new HttpHeaders();headers.setBearerAuth(token);
  var users=http.exchange("/api/auth/users",HttpMethod.GET,new HttpEntity<>(headers),String.class);assertThat(users.getStatusCode().value()).isEqualTo(200);assertThat(users.getBody()).doesNotContain("password_hash","invite_hash","token_hash");
  assertThat(post(token,"/mcp",Map.of()).getStatusCode().value()).isEqualTo(403);
  assertThat(request(token,HttpMethod.PATCH,"/api/auth/users/"+id,Map.of("enabled",false)).getStatusCode().value()).isEqualTo(400);
  String incident=s.one("SELECT id FROM incidents WHERE title='가상 개인 계정 등록 검증'").get("id").toString();
  long end=System.nanoTime()+15_000_000_000L;while(!s.incident(incident).get("status").equals("NEEDS_REVIEW")&&System.nanoTime()<end)Thread.sleep(30);
  var review=Map.of("type","RESOURCE","severity","P2","department","PLATFORM","reason","가상 계정 권한 검증: 관측과 미확정 가설을 검토함");
  assertThat(post(token,"/api/incidents/"+incident+"/review",review).getStatusCode().value()).isEqualTo(200);
  end=System.nanoTime()+15_000_000_000L;while(s.incident(incident).get("status").equals("ANALYZING")&&System.nanoTime()<end)Thread.sleep(30);
  if(s.incident(incident).get("status").equals("NEEDS_REVIEW")){assertThat(post(token,"/api/incidents/"+incident+"/review",review).getStatusCode().value()).isEqualTo(200);end=System.nanoTime()+15_000_000_000L;while(s.incident(incident).get("status").equals("ANALYZING")&&System.nanoTime()<end)Thread.sleep(30);}
  assertThat(post(token,"/api/incidents/"+incident+"/approval",Map.of("approved",false,"reason","가상 권한 테스트 종료")).getStatusCode().value()).isEqualTo(200);
  assertThat(s.one("SELECT actor FROM approvals WHERE incident_id=?",incident).get("actor")).isEqualTo(id);
  assertThat(s.one("SELECT actor FROM audit WHERE incident_id=? AND action='REVIEW_DECISION' ORDER BY id DESC LIMIT 1",incident).get("actor")).isEqualTo(id);
 }
 void resetsAndLockout(){
  var inv=invite("fictional.reset","USER","OP-14");String id=inv.get("id").toString(),token=activate("fictional.reset",inv.get("inviteCode")).get("token").toString();
  var reset=post(admin,"/api/auth/users/"+id+"/invite",Map.of());assertThat(reset.getStatusCode().value()).isEqualTo(200);assertThat(get(token,"/api/config").getStatusCode().value()).isEqualTo(401);
  assertThat(post(null,"/api/auth/login",Map.of("login","fictional.reset","password",PASSWORD)).getStatusCode().value()).isEqualTo(401);
  s.db.update("UPDATE app_users SET invite_expires_at=TIMESTAMP '2000-01-01 00:00:00' WHERE id=?",id);assertThat(post(null,"/api/auth/activate",Map.of("login","fictional.reset","inviteCode",reset.getBody().get("inviteCode"),"password",PASSWORD)).getStatusCode().value()).isEqualTo(401);
  var fresh=post(admin,"/api/auth/users/"+id+"/invite",Map.of());activate("fictional.reset",fresh.getBody().get("inviteCode"));
  for(int n=0;n<5;n++)assertThat(post(null,"/api/auth/login",Map.of("login","fictional.reset","password","fictional-wrong-password")).getStatusCode().value()).isEqualTo(401);
  assertThat(post(null,"/api/auth/login",Map.of("login","fictional.reset","password",PASSWORD)).getStatusCode().value()).isEqualTo(401);
  assertThat(s.one("SELECT failed_attempts,locked_until FROM app_users WHERE id=?",id)).containsEntry("failed_attempts",5).doesNotContainValue(null);
  s.db.update("UPDATE app_users SET locked_until=TIMESTAMP '2000-01-01 00:00:00' WHERE id=?",id);login("fictional.reset",PASSWORD);
 }
}
