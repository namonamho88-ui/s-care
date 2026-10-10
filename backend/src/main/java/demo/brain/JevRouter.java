package demo.brain;
import org.springframework.stereotype.Service;
@Service
public class JevRouter {
 private final MockJevProvider mock;private final LocalJevProvider local;private final TypeSafeJevProvider cloud;
 public JevRouter(MockJevProvider mock,LocalJevProvider local,TypeSafeJevProvider cloud){this.mock=mock;this.local=local;this.cloud=cloud;}
 public JevDecision decide(String observations,String mode,String provider){
  if(mode.equals("DEMO"))return mock.decide(observations);
  if(!mode.equals("REAL"))throw new IllegalArgumentException("Invalid mode");
  if(provider.equals("TYPESAFE"))return cloud.decide(observations);
  if(!provider.equals("LOCAL"))throw new IllegalArgumentException("Invalid provider");
  long start=System.nanoTime();String reason="";for(int i=0;i<2;i++)try{return local.decide(observations);}catch(JevHttpClient.Unavailable e){reason=e.getMessage();}
  return mock.decide(observations).asFallback(reason,(System.nanoTime()-start)/1_000_000);
 }
 public boolean cloudConfigured(){return cloud.configured();}
}
