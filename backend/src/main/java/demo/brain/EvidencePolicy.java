package demo.brain;

import com.fasterxml.jackson.databind.JsonNode;
import java.util.*;
import org.springframework.stereotype.Service;

/** Cross-checks independent model output and database evidence; never executes recovery. */
@Service
public class EvidencePolicy {
  public Map<String,Object> check(JevDecision decision, JsonNode diagnosis, JsonNode impact,
      String assetId, int approvedSkills, boolean operatorReviewed) {
    decision.validate();
    var reviews=new ArrayList<String>();
    var blocks=new ArrayList<String>();
    if (diagnosis.isMissingNode() || diagnosis.isNull()) blocks.add("Diagnosis Agent 결과가 없습니다.");
    else {
      if (!diagnosis.path("schemaValid").asBoolean(true)) reviews.add("원인 분석 응답 형식 확인 필요");
      if (diagnosis.path("needsReview").asBoolean(true)) reviews.add("원인 후보의 신뢰도 또는 근거가 부족합니다.");
      if (!decision.type().equals(diagnosis.path("relatedType").asText())) reviews.add("Jev 장애 분류와 Diagnosis 원인 후보가 일치하지 않습니다.");
    }
    if (decision.needsReview()) reviews.add("Jev 담당자 판단 확인이 필요합니다.");
    boolean rootIncluded=false;
    for (var node : impact.path("affected")) if (node.asText().equals(assetId)) rootIncluded=true;
    if (!impact.path("root").asText().equals(assetId) || !rootIncluded) blocks.add("Ontology 발생 지점과 영향 범위가 일치하지 않습니다.");
    if (approvedSkills<1) blocks.add("승인된 대응 Skill이 없습니다.");
    boolean needsReview=!reviews.isEmpty() && !operatorReviewed;
    return Map.ofEntries(Map.entry("passed",blocks.isEmpty() && !needsReview),Map.entry("needsReview",needsReview),
        Map.entry("blocked",!blocks.isEmpty()),Map.entry("reviewReasons",reviews),Map.entry("blockReasons",blocks),
        Map.entry("operatorReviewed",operatorReviewed),Map.entry("approvedSkills",approvedSkills),
        Map.entry("approvalRequired",true),Map.entry("realChanges",false),
        Map.entry("tools",List.of("apply_simulated_recovery","verify_simulated_recovery")));
  }
}
