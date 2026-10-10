package demo.brain;
import org.springframework.stereotype.Component;
import java.util.*;
@Component
public class MockJevProvider implements JevDecisionProvider {
 public String name(){return "MOCK";}
 public JevDecision decide(String observations){long start=System.nanoTime();String s=observations.toLowerCase(Locale.ROOT);int i=s.contains("database")||s.contains("pool exhausted")?1:s.contains("packet")||s.contains("dns")?2:s.contains("http 500")||s.contains("regression")?3:s.contains("authentication")?4:0;
  boolean known=s.contains("cpu")||s.contains("memory")||i>0;String severity=s.contains("customer outage")||s.contains("service unavailable")?"P1":"P2";
  return new JevDecision(JevDecision.TYPES.get(i),severity,Integer.parseInt(severity.substring(1)),JevDecision.DEPARTMENTS.get(i),s.contains("repeated"),known?0.94:0.35,known?0.95:0.25,name(),"deterministic-rules-300",(System.nanoTime()-start)/1_000_000,true,false,"",!known,List.of(observations,"Matched deterministic signature: "+JevDecision.TYPES.get(i)),Map.of("signatureMatched",known));
 }
}
