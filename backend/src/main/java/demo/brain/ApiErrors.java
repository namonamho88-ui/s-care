package demo.brain;
import org.springframework.web.bind.annotation.*;
import org.springframework.http.*;
import java.util.Map;
@RestControllerAdvice
public class ApiErrors {
 @ExceptionHandler(IllegalArgumentException.class) public ResponseEntity<?> invalid(IllegalArgumentException e){return ResponseEntity.badRequest().body(Map.of("error",String.valueOf(e.getMessage())));}
 @ExceptionHandler(IllegalStateException.class) public ResponseEntity<?> state(IllegalStateException e){return ResponseEntity.status(409).body(Map.of("error",String.valueOf(e.getMessage())));}
}
