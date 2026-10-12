package demo.brain;
import org.springframework.web.bind.annotation.*;
import org.springframework.http.*;
import java.util.Map;
@RestControllerAdvice
public class ApiErrors {
 @ExceptionHandler(org.springframework.web.server.ResponseStatusException.class) public ResponseEntity<?> access(org.springframework.web.server.ResponseStatusException e){return ResponseEntity.status(e.getStatusCode()).body(Map.of("error",java.util.Objects.toString(e.getReason(),"요청을 처리할 수 없습니다.")));}
 @ExceptionHandler(IllegalArgumentException.class) public ResponseEntity<?> invalid(IllegalArgumentException e){return ResponseEntity.badRequest().body(Map.of("error",String.valueOf(e.getMessage())));}
 @ExceptionHandler(java.util.concurrent.CancellationException.class) public ResponseEntity<?> canceled(java.util.concurrent.CancellationException e){return ResponseEntity.status(409).body(Map.of("error",String.valueOf(e.getMessage())));}
 @ExceptionHandler(IllegalStateException.class) public ResponseEntity<?> state(IllegalStateException e){return ResponseEntity.status(409).body(Map.of("error",String.valueOf(e.getMessage())));}
}
