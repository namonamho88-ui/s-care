package demo.brain;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import java.util.*;
import static org.assertj.core.api.Assertions.*;
class EvidencePolicyTest {
 final ObjectMapper json=new ObjectMapper();final EvidencePolicy policy=new EvidencePolicy();
 JevDecision decision(){return new MockJevProvider().decide("CPU saturation; customer outage");}
 Map<String,Object> check(String type,boolean review,boolean root,int approved,boolean reviewed){return policy.check(decision(),json.valueToTree(Map.of("relatedType",type,"schemaValid",true,"needsReview",review)),json.valueToTree(Map.of("root",root?"CMP-01":"CMP-02","affected",List.of("CMP-01"))),"CMP-01",approved,reviewed);}
 @Test void disagreementAndUncertainHypothesisPauseForReview(){assertThat(check("DATABASE",false,true,2,false)).containsEntry("needsReview",true).containsEntry("passed",false);assertThat(check("RESOURCE",true,true,2,false)).containsEntry("needsReview",true);}
 @Test void humanReviewCannotOverrideMissingGraphOrApprovedSkill(){assertThat(check("DATABASE",true,true,2,true)).containsEntry("passed",true);assertThat(check("RESOURCE",false,false,2,true)).containsEntry("blocked",true);assertThat(check("RESOURCE",false,true,0,true)).containsEntry("blocked",true);}
 @Test void alignedEvidenceStillRequiresApprovalAndVirtualTools(){assertThat(check("RESOURCE",false,true,2,false)).containsEntry("passed",true).containsEntry("approvalRequired",true).containsEntry("realChanges",false);}
}
