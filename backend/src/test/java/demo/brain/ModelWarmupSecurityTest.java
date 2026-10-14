package demo.brain;

import jakarta.servlet.FilterChain;
import org.junit.jupiter.api.Test;
import org.springframework.mock.env.MockEnvironment;
import org.springframework.mock.web.*;
import org.springframework.test.util.ReflectionTestUtils;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;

class ModelWarmupSecurityTest {
 @Test void filterDeniesUserAndDemoSessionsForBothReadAndInvocation()throws Exception{
  for(String method:new String[]{"GET","POST"})for(String kind:new String[]{"PERSONAL","DEMO"}){
   var accounts=mock(AccountService.class);var demo=mock(DemoAccess.class);var filter=new SecurityFilter("fictional-test-bootstrap-secret",new MockEnvironment(),accounts);ReflectionTestUtils.setField(filter,"demo",demo);
   var identity=new Access.Identity("actor","test","가상 사용자",kind.equals("DEMO")?"DEMO_ADMIN":"USER","OP-01",kind,"");
   when(accounts.authenticate("personal-test")).thenReturn(identity);when(demo.gateway(any())).thenReturn(true);when(demo.authenticate("demo_test")).thenReturn(identity);
   var request=new MockHttpServletRequest(method,"/api/admin/models/warmup");request.addHeader("Authorization","Bearer "+(kind.equals("DEMO")?"demo_test":"personal-test"));var response=new MockHttpServletResponse();var chain=mock(FilterChain.class);
   filter.doFilter(request,response,chain);assertThat(response.getStatus()).isEqualTo(403);verifyNoInteractions(chain);
  }
 }
 @Test void personalAdminCanReachWarmupController()throws Exception{
  var accounts=mock(AccountService.class);var filter=new SecurityFilter("fictional-test-bootstrap-secret",new MockEnvironment(),accounts);
  var identity=new Access.Identity("admin-1","admin","가상 관리자","ADMIN","","PERSONAL","");when(accounts.authenticate("personal-admin")).thenReturn(identity);
  var request=new MockHttpServletRequest("POST","/api/admin/models/warmup");request.addHeader("Authorization","Bearer personal-admin");var response=new MockHttpServletResponse();var chain=mock(FilterChain.class);
  filter.doFilter(request,response,chain);verify(chain).doFilter(request,response);assertThat(request.getAttribute("brain.identity")).isEqualTo(identity);
 }
}
