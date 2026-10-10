package demo.brain;
import java.util.Map;
/** Generation is separate from the application's approval and publication. */
public interface HermesAdapter {
 String provider();
 Map<String,Object> generate(String operation, Map<String,Object> context);
}
