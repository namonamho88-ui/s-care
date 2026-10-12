package demo.brain;
/** Fencing context is propagated only on authenticated internal RPC requests. */
public final class WorkContext {
 public record Lease(String id,String token) {}
 private static final ThreadLocal<Lease> CURRENT=new ThreadLocal<>();
 public static Lease get(){return CURRENT.get();}
 public static void set(String id,String token){CURRENT.set(new Lease(id,token));}
 public static void clear(){CURRENT.remove();}
}
