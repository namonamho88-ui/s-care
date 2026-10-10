package demo.brain;

import org.junit.jupiter.api.Test;
import org.springframework.mock.env.MockEnvironment;
import static org.assertj.core.api.Assertions.*;

class CloudSecurityTest {
 @Test void cloudRejectsLocalDefaultsPlaceholdersAndWeakValues(){
  var env=new MockEnvironment();env.setActiveProfiles("cloud");
  for(String token:new String[]{"local-demo-admin-change-me","local-demo-admin-change-me-extended","REPLACE_WITH_RANDOM_TOKEN_AT_LEAST_32_CHARS","a".repeat(64)})
   assertThatThrownBy(()->new SecurityFilter(token,env)).isInstanceOf(IllegalArgumentException.class).hasMessageContaining("Cloud ADMIN_TOKEN");
 }
 @Test void configuredCloudSecretStarts(){
  var env=new MockEnvironment();env.setActiveProfiles("cloud");
  assertThatCode(()->new SecurityFilter("fictional-ci-admin-7b3f9c10a4e562d8",env)).doesNotThrowAnyException();
 }
 @Test void localDemonstrationRetainsDocumentedDefault(){
  assertThatCode(()->new SecurityFilter("local-demo-admin-change-me",new MockEnvironment())).doesNotThrowAnyException();
 }
}
