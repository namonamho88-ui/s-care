package demo.brain;
import org.springframework.stereotype.Component;
import org.springframework.beans.factory.annotation.Value;
import java.net.URI;
import java.net.http.*;
import java.time.Duration;
import java.util.*;
@Component
public class RpcClient {
 private final Store s;private final String base,token;private final HttpClient http=HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(3)).build();
 public RpcClient(Store s,@Value("${brain.internal-url}") String base,@Value("${brain.admin-token}") String token){this.s=s;this.base=base;this.token=token;}
 public Object call(String path,String method,Object params,String id){
  try{var builder=HttpRequest.newBuilder(URI.create(base+path)).timeout(Duration.ofSeconds(180)).header("Authorization","Bearer "+token).header("Content-Type","application/json").header("Accept","application/json, text/event-stream").header("MCP-Protocol-Version","2025-03-26").POST(HttpRequest.BodyPublishers.ofString(s.encode(Map.of("jsonrpc","2.0","id",id,"method",method,"params",params))));var lease=WorkContext.get();if(lease!=null)builder.header("X-Work-Id",lease.id()).header("X-Work-Token",lease.token());var request=builder.build();var response=http.send(request,HttpResponse.BodyHandlers.ofString());if(response.statusCode()!=200)throw new IllegalStateException("RPC HTTP "+response.statusCode());var root=s.json.readTree(response.body());if(root.has("error"))throw new IllegalStateException(root.path("error").path("message").asText());return s.decode(root.path("result").toString());}
  catch(InterruptedException e){Thread.currentThread().interrupt();throw new IllegalStateException("RPC interrupted");}catch(Exception e){throw new IllegalStateException("RPC "+method+" failed: "+e.getMessage());}
 }
 public Object agent(String agent,String incident,long version){String messageId=incident+"-"+agent+"-"+version+(WorkContext.get()==null?"":"-"+WorkContext.get().token().substring(0,8));return call("/a2a/"+agent,"message/send",Map.of("configuration",Map.of("blocking",true),"message",Map.of("kind","message","messageId",messageId,"role","user","parts",List.of(Map.of("kind","data","data",Map.of("incidentId",incident))))),messageId);}
 public Object tool(String name,String incident){call("/mcp","initialize",Map.of("protocolVersion","2025-03-26","capabilities",Map.of(),"clientInfo",Map.of("name","harness","version","3.0.0")),Store.id("RPC-"));Object result=call("/mcp","tools/call",Map.of("name",name,"arguments",Map.of("incidentId",incident)),Store.id("RPC-"));var tree=s.json.valueToTree(result);if(tree.path("isError").asBoolean())throw new IllegalStateException(tree.path("content").path(0).path("text").asText());return s.decode(tree.path("content").path(0).path("text").asText());}
}
