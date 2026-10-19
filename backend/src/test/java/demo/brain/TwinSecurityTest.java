package demo.brain;
import org.junit.jupiter.api.Test;
import org.springframework.mock.env.MockEnvironment;
import org.springframework.mock.web.*;
import jakarta.servlet.FilterChain;
import static org.mockito.Mockito.*;
import static org.assertj.core.api.Assertions.*;
class TwinSecurityTest {
 @Test void userCannotInjectCallAiEvaluateApproveOrAccessMcp()throws Exception{
  for(String path:new String[]{"/api/twin/runs","/api/twin/runs/TWIN-test/inject","/api/twin/runs/TWIN-test/analyze","/api/twin/runs/TWIN-test/decision","/api/twin/evaluations","/mcp"}){
   var accounts=mock(AccountService.class);when(accounts.authenticate("user-test")).thenReturn(new Access.Identity("u","u","가상 사용자","USER","OP-01","ACCOUNT",""));var filter=new SecurityFilter("fictional-test-bootstrap-secret",new MockEnvironment(),accounts);var request=new MockHttpServletRequest("POST",path);request.addHeader("Authorization","Bearer user-test");var response=new MockHttpServletResponse();var chain=mock(FilterChain.class);filter.doFilter(request,response,chain);assertThat(response.getStatus()).isEqualTo(403);verifyNoInteractions(chain);
  }
 }
}
