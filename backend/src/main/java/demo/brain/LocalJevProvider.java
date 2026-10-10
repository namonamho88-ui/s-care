package demo.brain;
import org.springframework.stereotype.Component;
import org.springframework.beans.factory.annotation.Value;
@Component
public class LocalJevProvider implements JevDecisionProvider {
 private final JevHttpClient http;private final String url,key;
 public LocalJevProvider(JevHttpClient http,@Value("${brain.jev.local-url}") String url,@Value("${brain.jev.local-key}") String key){this.http=http;this.url=url;this.key=key;}
 public String name(){return "LOCAL_JEV";}
 public JevDecision decide(String observations){return http.call(name(),url,key,observations);}
}
