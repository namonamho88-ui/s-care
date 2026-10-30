package demo.brain;

import java.util.*;
import java.security.MessageDigest;
import java.nio.charset.StandardCharsets;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/war-room")
public class WarRoomController {
 private final WarRoom rooms; private final String gateway;
 public WarRoomController(WarRoom rooms,@Value("${WAR_ROOM_GATEWAY_KEY:}") String gateway){this.rooms=rooms;this.gateway=gateway;}
 @PostMapping("/guest") public Object guest(@RequestHeader(value="X-War-Gateway",defaultValue="") String key,@RequestBody Map<String,String> body){
  rooms.enabled();if(gateway.length()<32||!MessageDigest.isEqual(gateway.getBytes(StandardCharsets.UTF_8),key.getBytes(StandardCharsets.UTF_8)))throw Access.denied();return rooms.join(body.getOrDefault("room","briefing"),body.get("resume"));
 }
 @GetMapping("/rooms/{id}/context") public Object context(@PathVariable String id){return rooms.context(id);}
 @PostMapping("/rooms/{id}/{op}") public Object command(@PathVariable String id,@PathVariable String op,@RequestBody Map<String,Object> body){return rooms.command(id,op,body);}
}
