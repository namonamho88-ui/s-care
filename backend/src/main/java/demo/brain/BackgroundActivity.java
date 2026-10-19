package demo.brain;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
import java.time.Clock;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicLong;

/** In-memory activity only: checking whether to sleep must never itself query a service. */
@Component
public class BackgroundActivity {
 private final boolean enabled;private final long idleMillis;private final Clock clock;
 private volatile long lastActivity;private final AtomicInteger jobs=new AtomicInteger();
 private final AtomicLong notificationVersion=new AtomicLong(1);private volatile long drainedNotificationVersion;
 @org.springframework.beans.factory.annotation.Autowired
 public BackgroundActivity(@Value("${brain.idle-enabled:false}") boolean enabled,@Value("${brain.idle-after-seconds:60}") long seconds){this(enabled,seconds,Clock.systemUTC());}
 BackgroundActivity(boolean enabled,long seconds,Clock clock){this.enabled=enabled;this.idleMillis=Math.max(1,seconds)*1000;this.clock=clock;lastActivity=clock.millis();}
 public synchronized boolean touch(){boolean resumed=idle();lastActivity=clock.millis();return resumed;}
 public boolean idle(){return enabled&&jobs.get()==0&&clock.millis()-lastActivity>=idleMillis;}
 public void jobStarted(){jobs.incrementAndGet();}
 public void jobFinished(){jobs.decrementAndGet();}
 public void notificationQueued(){notificationVersion.incrementAndGet();}
 public boolean shouldDrainNotifications(){return !idle()||notificationVersion.get()!=drainedNotificationVersion;}
 public long notificationVersion(){return notificationVersion.get();}
 public void notificationsDrained(long version){drainedNotificationVersion=version;}
}
