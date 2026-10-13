package demo.brain;
import jakarta.servlet.*;
import jakarta.servlet.http.*;
import org.springframework.stereotype.Component;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.env.Environment;
import org.springframework.core.env.Profiles;
import org.springframework.web.filter.OncePerRequestFilter;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
@Component
public class SecurityFilter extends OncePerRequestFilter {
 private final byte[] expected;
 private final AccountService accounts;
 @org.springframework.beans.factory.annotation.Autowired private DemoAccess demo;
 public SecurityFilter(@Value("${brain.admin-token}") String token,Environment env,AccountService accounts){
  this.accounts=accounts;
  if(token.length()<16)throw new IllegalArgumentException("ADMIN_TOKEN requires at least 16 characters");
  String normalized=token.toLowerCase(java.util.Locale.ROOT);
  if(env.acceptsProfiles(Profiles.of("cloud"))&&(token.length()<32||normalized.contains("local-demo-admin")||normalized.contains("replace_with")||normalized.contains("change-me")||token.chars().distinct().count()<10))
   throw new IllegalArgumentException("Cloud ADMIN_TOKEN must be a generated secret of at least 32 characters; defaults and placeholders are forbidden");
  expected=("Bearer "+token).getBytes(StandardCharsets.UTF_8);
 }
 @Override protected void doFilterInternal(HttpServletRequest request,HttpServletResponse response,FilterChain chain)throws ServletException,IOException{
  response.setHeader("Cache-Control","no-store");
  String path=request.getRequestURI(),method=request.getMethod();
  if(method.equals("GET")&&(path.equals("/api/health")||path.matches("/agents/[a-z]+/\\.well-known/agent-card\\.json"))||method.equals("POST")&&(path.equals("/api/auth/login")||path.equals("/api/auth/activate"))){chain.doFilter(request,response);return;}
  if(path.equals("/api/demo/session")){if(!method.equals("POST")||!demo.gateway(request)){deny(response,403,"허용된 시연 게이트웨이가 아닙니다.");return;}chain.doFilter(request,response);return;}
  if(path.equals("/api/demo/control")){if(!demo.control(request)){deny(response,403,"시연 설정 권한이 없습니다.");return;}chain.doFilter(request,response);return;}
  String auth=request.getHeader("Authorization");Access.Identity identity=null;
  if(auth!=null&&MessageDigest.isEqual(expected,auth.getBytes(StandardCharsets.UTF_8)))identity=new Access.Identity("bootstrap-admin","bootstrap-admin","초기 설정 관리자","ADMIN","","BOOTSTRAP","");
  else if(auth!=null&&auth.startsWith("Bearer "))identity=auth.substring(7).startsWith("demo_")?(demo.gateway(request)?demo.authenticate(auth.substring(7)):null):accounts.authenticate(auth.substring(7));
  if(identity==null){deny(response,401,"로그인이 필요하거나 세션이 만료되었습니다.");return;}
  if(identity.kind().equals("DEMO")&&!demoAllowed(method,path)){deny(response,403,"시연 세션은 계정·외부 관리 기능을 사용할 수 없습니다.");return;}
  request.setAttribute("brain.identity",identity);
  boolean service=path.startsWith("/a2a/")||path.equals("/mcp");
  if(service&&!identity.kind().equals("BOOTSTRAP")||!identity.admin()&&!userAllowed(method,path)){
   deny(response,403,"이 작업을 수행할 권한이 없습니다.");return;
  }
  try{if(identity.kind().equals("BOOTSTRAP")&&service&&request.getHeader("X-Work-Id")!=null)WorkContext.set(request.getHeader("X-Work-Id"),request.getHeader("X-Work-Token"));chain.doFilter(request,response);}finally{WorkContext.clear();}
 }
 private static boolean demoAllowed(String method,String path){
  if(path.equals("/api/auth/me")||path.equals("/api/auth/logout"))return true;
  return path.matches("/api/(?:config|catalog|graph|dashboard|incidents|simulate|skills|evaluations|audit|operations|notifications|message-intake|assets)(?:/.*)?");
 }
 private static boolean userAllowed(String method,String path){
  if(method.equals("GET")&&(path.matches("/api/assets/[A-Za-z0-9_-]+/context")||path.matches("/api/skills/[A-Za-z0-9_-]+/revisions")))return true;
  if(method.equals("GET"))return java.util.List.of("/api/auth/me","/api/config","/api/catalog","/api/graph","/api/dashboard","/api/incidents","/api/skills").contains(path)||path.matches("/api/incidents/[A-Za-z0-9_-]+(?:/events|/similar|/knowledge|/report/(?:pdf|xlsx))?");
  if(method.equals("POST")&&(path.equals("/api/skills")||path.matches("/api/skills/[A-Za-z0-9_-]+/submit")))return true;
  if(method.equals("PATCH")&&path.matches("/api/skills/[A-Za-z0-9_-]+"))return true;
  if(method.equals("POST"))return java.util.List.of("/api/incidents","/api/message-intake/preview","/api/message-intake/register","/api/auth/logout","/api/auth/password").contains(path);
  return method.equals("PATCH")&&path.matches("/api/incidents/[A-Za-z0-9_-]+");
 }
 private static void deny(HttpServletResponse response,int status,String message)throws IOException{response.setStatus(status);response.setCharacterEncoding("UTF-8");response.setContentType("application/json");response.getWriter().write("{\"error\":\""+message+"\"}");}
}
