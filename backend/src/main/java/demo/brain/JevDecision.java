package demo.brain;
import java.util.*;
public record JevDecision(String type,String severity,int priority,String department,boolean recurrence,double confidence,double evidenceScore,String provider,String model,long latencyMs,boolean simulated,boolean fallback,String fallbackReason,boolean needsReview,List<String> evidence,Map<String,Object> answers) {
 public static final List<String> TYPES=List.of("RESOURCE","DATABASE","NETWORK","APPLICATION","SECURITY");
 public static final List<String> DEPARTMENTS=List.of("PLATFORM","DATABASE","NETWORK","APPLICATION","SECURITY");
 public JevDecision withExecution(Map<String,Object> execution,long elapsed){var enriched=new LinkedHashMap<String,Object>(answers);enriched.put("_execution",execution);return new JevDecision(type,severity,priority,department,recurrence,confidence,evidenceScore,provider,model,elapsed,simulated,fallback,fallbackReason,needsReview,evidence,enriched);}
 public JevDecision asFallback(String reason,long elapsed){return new JevDecision(type,severity,priority,department,recurrence,confidence,evidenceScore,"MOCK_FALLBACK",model,elapsed,true,true,reason,needsReview,evidence,answers);}
 public JevDecision reviewed(String type,String severity,String department,String reason){return new JevDecision(type,severity,Integer.parseInt(severity.substring(1)),department,recurrence,confidence,evidenceScore,provider,model,latencyMs,simulated,fallback,fallbackReason,false,List.of("Operator reviewed: "+reason,"Original observations: "+String.join("; ",evidence)),answers);}
 public void validate(){if(!TYPES.contains(type)||!List.of("P1","P2","P3").contains(severity)||!DEPARTMENTS.contains(department)||!Double.isFinite(confidence)||confidence<0||confidence>1||!Double.isFinite(evidenceScore)||evidenceScore<0||evidenceScore>1||evidence==null||evidence.isEmpty())throw new IllegalArgumentException("Invalid Jev decision schema");}
}
