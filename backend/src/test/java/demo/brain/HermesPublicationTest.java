package demo.brain;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.PlatformTransactionManager;
import java.nio.file.*;
import java.util.*;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;
class HermesPublicationTest {
 @TempDir Path root;
 @Test void onlyApprovedKnowledgeIsPublishedAndRetryIsIdempotent()throws Exception{
  var db=mock(JdbcTemplate.class);var s=new Store(db,new ObjectMapper(),mock(PlatformTransactionManager.class));
  var row=new HashMap<String,Object>();row.put("id","SKL-TEST");row.put("status","DRAFT");row.put("title","가상 해결 Skill");row.put("conditions","가상 관측");row.put("checks","점검");row.put("solution","복구");row.put("cautions","실제 변경 금지");row.put("source_provider","MOCK_HERMES");row.put("source_model","template");row.put("simulated",true);
  when(db.queryForList("SELECT * FROM skills WHERE id=?","SKL-TEST")).thenReturn(List.of(row));
  var publisher=new HermesSkillPublisher(s,root.toString(),"filesystem","","");
  assertThatThrownBy(()->publisher.publish("SKL-TEST")).hasMessageContaining("approved");assertThat(Files.list(root).findAny()).isEmpty();
  row.put("status","APPROVED");assertThat(publisher.publish("SKL-TEST")).containsEntry("status","EXPORTED");assertThat(publisher.publish("SKL-TEST")).containsEntry("status","EXPORTED");
  String text=Files.readString(root.resolve("incident-brain-skl-test/SKILL.md"));assertThat(text).contains("관리자 승인","MOCK_HERMES","## 적용 조건","## 점검 절차","## 해결 방법","## 주의사항");
 }
}
