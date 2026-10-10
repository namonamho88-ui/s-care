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
 public SecurityFilter(@Value("${brain.admin-token}") String token,Environment env){
  if(token.length()<16)throw new IllegalArgumentException("ADMIN_TOKEN requires at least 16 characters");
  String normalized=token.toLowerCase(java.util.Locale.ROOT);
  if(env.acceptsProfiles(Profiles.of("cloud"))&&(token.length()<32||normalized.contains("local-demo-admin")||normalized.contains("replace_with")||normalized.contains("change-me")||token.chars().distinct().count()<10))
   throw new IllegalArgumentException("Cloud ADMIN_TOKEN must be a generated secret of at least 32 characters; defaults and placeholders are forbidden");
  expected=("Bearer "+token).getBytes(StandardCharsets.UTF_8);
 }
 @Override protected void doFilterInternal(HttpServletRequest request,HttpServletResponse response,FilterChain chain)throws ServletException,IOException{
  String path=request.getRequestURI();if(path.equals("/api/health")||path.endsWith("/.well-known/agent-card.json")){chain.doFilter(request,response);return;}
  String auth=request.getHeader("Authorization");if(auth==null||!MessageDigest.isEqual(expected,auth.getBytes(StandardCharsets.UTF_8))){response.setStatus(401);response.setContentType("application/json");response.getWriter().write("{\"error\":\"Administrator token required\"}");return;}
  chain.doFilter(request,response);
 }
}
