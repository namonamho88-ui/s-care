package demo.brain;
import java.util.*;
public final class Rpc {
 private Rpc(){}
 public static Map<String,Object> result(Object id,Object result){return Map.of("jsonrpc","2.0","id",id,"result",result);}
 public static Map<String,Object> error(Object id,int code,String message){Map<String,Object> body=new LinkedHashMap<>();body.put("jsonrpc","2.0");body.put("id",id);body.put("error",Map.of("code",code,"message",message));return body;}
}
