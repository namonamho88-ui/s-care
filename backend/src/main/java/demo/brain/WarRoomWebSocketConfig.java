package demo.brain;
import org.springframework.context.annotation.Configuration;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.web.socket.config.annotation.*;

@Configuration
@EnableWebSocket
public class WarRoomWebSocketConfig implements WebSocketConfigurer {
 private final WarRoomSocket socket;private final String origins;
 public WarRoomWebSocketConfig(WarRoomSocket socket,@Value("${WAR_ROOM_ALLOWED_ORIGINS:http://127.0.0.1:3100}") String origins){this.socket=socket;this.origins=origins;}
 @Override public void registerWebSocketHandlers(WebSocketHandlerRegistry registry){String[] allowed=origins.split(",");for(String origin:allowed)if(origin.contains("*")||!origin.matches("https?://[^/]+"))throw new IllegalArgumentException("워룸 Origin은 정확한 http(s) Origin이어야 합니다.");registry.addHandler(socket,"/api/war-room/socket").setAllowedOrigins(allowed);}
}
