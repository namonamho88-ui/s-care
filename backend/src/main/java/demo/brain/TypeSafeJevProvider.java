package demo.brain;
import org.springframework.stereotype.Component;
import org.springframework.beans.factory.annotation.Value;
@Component
public class TypeSafeJevProvider implements JevDecisionProvider {
 private final JevHttpClient http;private final String url,key;
 public TypeSafeJevProvider(JevHttpClient http,@Value("${brain.jev.typesafe-url}") String url,@Value("${brain.jev.typesafe-key}") String key){this.http=http;this.url=url;this.key=key;}
 public String name(){return "TYPESAFE_JEV";}
 public boolean configured(){return !key.isBlank();}
 public JevDecision decide(String observations){if(!configured())throw new IllegalStateException("TYPESAFE_API_KEY is not configured");return http.call(name(),url,key,observations);}
}
