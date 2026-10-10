package demo.brain;
import org.springframework.web.bind.annotation.*;
import java.util.Map;

@RestController
@RequestMapping("/api/auth")
public class AccountController {
 private final AccountService accounts;
 public AccountController(AccountService accounts){this.accounts=accounts;}
 @PostMapping("/login") public Object login(@RequestBody Map<String,String> b){return accounts.login(b.get("login"),b.get("password"));}
 @PostMapping("/activate") public Object activate(@RequestBody Map<String,String> b){return accounts.activate(b.get("login"),b.get("inviteCode"),b.get("password"));}
 @GetMapping("/me") public Object me(){return Access.current().view();}
 @PostMapping("/logout") public Object logout(){accounts.logout();return Map.of("ok",true);}
 @PostMapping("/password") public Object password(@RequestBody Map<String,String> b){accounts.changePassword(b.get("oldPassword"),b.get("newPassword"));return Map.of("ok",true);}
 @GetMapping("/users") public Object users(){return accounts.list();}
 @PostMapping("/users") public Object invite(@RequestBody Map<String,String> b){return accounts.invite(b);}
 @PostMapping("/users/{id}/invite") public Object reinvite(@PathVariable String id){return accounts.reinvite(id);}
 @PatchMapping("/users/{id}") public Object enabled(@PathVariable String id,@RequestBody Map<String,Object> b){if(!(b.get("enabled") instanceof Boolean enabled)||b.size()!=1)throw new IllegalArgumentException("enabled 값만 변경할 수 있습니다.");accounts.enabled(id,enabled);return Map.of("ok",true);}
}
