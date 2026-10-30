package demo.brain;

import org.springframework.stereotype.Component;
import org.springframework.web.socket.*;
import org.springframework.web.socket.handler.*;
import java.util.*;
import java.util.concurrent.ConcurrentHashMap;

@Component
public class WarRoomSocket extends TextWebSocketHandler {
 private final WarRoom rooms; private final Store store;
 private record Client(WebSocketSession session,long opened){}
 private final Map<String,Client> clients=new ConcurrentHashMap<>();
 private final Map<String,Long> sent=new ConcurrentHashMap<>();
 private final Map<String,Integer> presence=new ConcurrentHashMap<>();
 private final Map<String,Integer> collaboration=new ConcurrentHashMap<>();
 private final java.util.concurrent.ScheduledExecutorService ticker=java.util.concurrent.Executors.newSingleThreadScheduledExecutor(r->{Thread t=new Thread(r,"war-room-broadcast");t.setDaemon(true);return t;});
 public WarRoomSocket(WarRoom rooms,Store store){this.rooms=rooms;this.store=store;}
 @Override public synchronized void afterConnectionEstablished(WebSocketSession raw)throws Exception{
  rooms.enabled();if(clients.size()>=180){raw.close(CloseStatus.POLICY_VIOLATION);return;}raw.setTextMessageSizeLimit(1024);raw.setBinaryMessageSizeLimit(0);
  clients.put(raw.getId(),new Client(new ConcurrentWebSocketSessionDecorator(raw,2000,256*1024),System.currentTimeMillis()));
 }
 @Override protected void handleTextMessage(WebSocketSession raw,TextMessage message)throws Exception{
  Client c=clients.get(raw.getId());if(c==null)return;
  try{var msg=store.json.readTree(message.getPayload());if(rooms.connectionRoom(raw.getId())==null){if(!"join".equals(msg.path("type").asText()))throw Access.denied();var g=rooms.connect(msg.path("ticket").asText(),raw.getId());send(c,Map.of("type","welcome","id",g.id));}else {rooms.input(raw.getId(),msg);if("sync".equals(msg.path("type").asText()))sent.remove(raw.getId());}}
  catch(Exception e){send(c,Map.of("type","error","message","요청이 거부되었습니다. 입력 또는 접속 상태를 확인하세요."));close(c);}
 }
 private void send(Client c,Object value)throws Exception{c.session().sendMessage(new TextMessage(store.encode(value)));}
 private void close(Client c){try{c.session().close(CloseStatus.POLICY_VIOLATION);}catch(Exception ignored){}remove(c.session().getId());}
 private void remove(String id){clients.remove(id);sent.remove(id);presence.remove(id);collaboration.remove(id);rooms.disconnect(id);}
 @Override public void afterConnectionClosed(WebSocketSession s,CloseStatus status){remove(s.getId());}
 @Override public void handleTransportError(WebSocketSession s,Throwable e){Client c=clients.get(s.getId());if(c!=null)close(c);}
 @jakarta.annotation.PostConstruct public void start(){if(rooms.available())ticker.scheduleWithFixedDelay(this::broadcast,100,100,java.util.concurrent.TimeUnit.MILLISECONDS);}
 public void broadcast(){
  if(clients.isEmpty())return;Map<String,Map<String,Object>> snapshots=new HashMap<>();
  for(Client c:clients.values())try{
   String id=c.session().getId(),room=rooms.connectionRoom(id);
   if(room==null){if(System.currentTimeMillis()-c.opened()>5000)close(c);continue;}
   if(!rooms.live(id)){close(c);continue;}
   var state=snapshots.computeIfAbsent(room,rooms::state);long revision=((Number)state.get("revision")).longValue();
   int fingerprint=state.get("players").hashCode(),discussion=31*state.get("chat").hashCode()+state.get("checks").hashCode();
   if(!Objects.equals(sent.get(id),revision)){send(c,state);sent.put(id,revision);presence.put(id,fingerprint);collaboration.put(id,discussion);}
   else {
    if(!Objects.equals(presence.get(id),fingerprint)){send(c,Map.of("type","presence","players",state.get("players")));presence.put(id,fingerprint);}
    if(!Objects.equals(collaboration.get(id),discussion)){send(c,Map.of("type","collaboration","chat",state.get("chat"),"checks",state.get("checks")));collaboration.put(id,discussion);}
   }
  }catch(Exception e){close(c);}
 }
 @jakarta.annotation.PreDestroy public void shutdown(){ticker.shutdownNow();clients.values().forEach(this::close);}
}
