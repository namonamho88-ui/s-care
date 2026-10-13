package demo.brain;
import org.springframework.context.annotation.*;
import org.springframework.beans.factory.config.BeanFactoryPostProcessor;
import org.springframework.core.env.Environment;
/** Reject unsafe demo configuration before Flyway or data-source initialization. */
@Configuration
public class DemoIsolation {
 @Bean static BeanFactoryPostProcessor demoIsolationGuard(Environment env){return factory->validate(env);}
 static void validate(Environment e){
  boolean enabled=e.getProperty("DEMO_ACCESS_ENABLED",Boolean.class,false);
  boolean isolated="isolated-demo".equals(e.getProperty("DEMO_DEPLOYMENT_ENV",""));
  if(enabled&&!isolated)throw new IllegalStateException("DEMO requires an isolated-demo deployment");
  if(!isolated)return;
  String schema=e.getProperty("spring.datasource.hikari.schema","");
  if(!e.getProperty("spring.datasource.url","").startsWith("jdbc:h2:mem:")&&!e.getProperty("spring.datasource.username","").matches("brain_demo_[a-z0-9_]{1,30}(?:\\.[a-z0-9]+)?"))throw new IllegalStateException("DEMO requires a dedicated database role");
  if(!schema.matches("brain_demo_[a-z0-9_]{1,30}")||!schema.equals(e.getProperty("spring.flyway.default-schema",""))||!schema.equals(e.getProperty("spring.flyway.schemas","")))throw new IllegalStateException("DEMO requires a dedicated brain_demo_* schema");
  if(!"disabled".equals(e.getProperty("brain.hermes-publish-mode","")))throw new IllegalStateException("DEMO external Skill publication must be disabled");
  if(!e.getProperty("brain.graph-namespace","").matches("Demo_[A-Za-z0-9_]{1,30}"))throw new IllegalStateException("DEMO requires a separate graph namespace");
  if(enabled&&(e.getProperty("DEMO_GATEWAY_KEY","").length()<32||e.getProperty("DEMO_CONTROL_KEY","").length()<32||e.getProperty("DEMO_ALLOWED_ORIGIN","").isBlank()||e.getProperty("DEMO_ACCESS_EXPIRES_AT","").isBlank()))throw new IllegalStateException("DEMO requires gateway/control secrets, origin and expiry");
  if(enabled&&e.getProperty("DEMO_GATEWAY_KEY").equals(e.getProperty("DEMO_CONTROL_KEY")))throw new IllegalStateException("DEMO gateway and control keys must differ");
 }
}
