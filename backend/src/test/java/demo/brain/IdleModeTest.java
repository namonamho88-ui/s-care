package demo.brain;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.SimpleTransactionStatus;
import java.sql.Timestamp;
import java.time.*;
import java.util.*;
import java.util.concurrent.*;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;
import static org.mockito.ArgumentMatchers.*;

class IdleModeTest {
 static class MutableClock extends Clock {
  long millis;public ZoneId getZone(){return ZoneOffset.UTC;}public Clock withZone(ZoneId zone){return this;}public Instant instant(){return Instant.ofEpochMilli(millis);}
 }
 private Store store(JdbcTemplate db){var manager=mock(PlatformTransactionManager.class);when(manager.getTransaction(any())).thenReturn(new SimpleTransactionStatus());return new Store(db,new ObjectMapper(),manager);}
 @Test void activityUsesNoNetworkAndDoesNotIdleWhileWorkIsRunning(){
  var clock=new MutableClock();var activity=new BackgroundActivity(true,60,clock);
  clock.millis=60000;assertThat(activity.idle()).isTrue();assertThat(activity.touch()).isTrue();assertThat(activity.idle()).isFalse();
  activity.jobStarted();clock.millis=120000;assertThat(activity.idle()).isFalse();activity.jobFinished();assertThat(activity.idle()).isTrue();
  assertThat(new BackgroundActivity(false,1,clock).idle()).isFalse();
 }
 @Test void idleSchedulersStopDatabaseCallsButPendingNotificationsDrainAndResume(){
  var db=mock(JdbcTemplate.class);var s=store(db);var clock=new MutableClock();var activity=new BackgroundActivity(true,1,clock);
  var notifications=new MockNotificationChannel(s,"http://127.0.0.1:1","fictional-test-token");ReflectionTestUtils.setField(notifications,"activity",activity);
  var operations=new OperationsController(s,mock(SimilarIncidents.class),mock(SkillEditing.class),15);ReflectionTestUtils.setField(operations,"activity",activity);
  clock.millis=1000;notifications.deliver(); // One startup drain, even with no active visitor.
  verify(db,times(1)).queryForList(anyString());clearInvocations(db);
  for(int i=0;i<5;i++){notifications.deliver();operations.alerts();}verifyNoInteractions(db);
  activity.notificationQueued();notifications.deliver();verify(db,times(1)).queryForList(anyString());clearInvocations(db);
  activity.touch();operations.alerts();verify(db,times(1)).queryForList(anyString());
 }
 @Test void notificationAddedDuringDrainIsNotLost(){
  var clock=new MutableClock();var activity=new BackgroundActivity(true,1,clock);clock.millis=1000;
  long draining=activity.notificationVersion();activity.notificationQueued();activity.notificationsDrained(draining);
  assertThat(activity.shouldDrainNotifications()).isTrue();activity.notificationsDrained(activity.notificationVersion());assertThat(activity.shouldDrainNotifications()).isFalse();
 }
 @Test void anEmptyDurableQueueStopsPollingAndExplicitWakeChecksAgain()throws Exception{
  var db=mock(JdbcTemplate.class);var provider=mock(ObjectProvider.class);var queue=spy(new DurableQueue(store(db),provider));
  doReturn(null).when(queue).claim();
  try{
   queue.start();verify(queue,timeout(1000)).claim();Thread.sleep(1200);verify(queue,times(1)).claim();
   queue.wake();verify(queue,timeout(1000).times(2)).claim();
  }finally{queue.stop();}
 }
 @Test void persistedFutureDeadlineRunsWithoutAVisitorAndThenStops()throws Exception{
  var db=mock(JdbcTemplate.class);var provider=mock(ObjectProvider.class);var harness=mock(Harness.class);when(provider.getObject()).thenReturn(harness);
  var done=new CountDownLatch(1);doAnswer(inv->{done.countDown();return null;}).when(harness).executePhase("fictional-incident","ANALYZE");
  var queue=spy(new DurableQueue(store(db),provider));
  var job=Map.<String,Object>of("id","fictional-job","token","lease-token","incident_id","fictional-incident","phase","ANALYZE");
  doReturn(null,job,null).when(queue).claim();
  when(db.queryForList(startsWith("SELECT MIN"))).thenReturn(List.of(Map.of("next_at",new Timestamp(System.currentTimeMillis()+250))),List.of());
  try{queue.start();assertThat(done.await(2,TimeUnit.SECONDS)).isTrue();verify(harness,times(1)).executePhase("fictional-incident","ANALYZE");verify(db,timeout(1000)).update(startsWith("UPDATE work_jobs SET status="),eq("COMPLETED"),isNull(),eq("fictional-job"),eq("lease-token"));}
  finally{queue.stop();}
 }
 @Test void activeVisitorsCanRecoverAnExhaustedDatabaseRetryWithoutReintroducingPolling()throws Exception{
  var db=mock(JdbcTemplate.class);var queue=spy(new DurableQueue(store(db),mock(ObjectProvider.class)));doReturn(null).when(queue).claim();
  try{
   ReflectionTestUtils.setField(queue,"databaseFailures",4);ReflectionTestUtils.setField(queue,"retryAfterVisit",System.nanoTime()+TimeUnit.SECONDS.toNanos(30));
   for(int i=0;i<10;i++)queue.authenticatedVisit(false);verify(queue,never()).claim();
   ReflectionTestUtils.setField(queue,"retryAfterVisit",0L);queue.authenticatedVisit(false);verify(queue,timeout(1000)).claim();
   Thread.sleep(50);clearInvocations(queue);for(int i=0;i<10;i++)queue.authenticatedVisit(false);verify(queue,never()).claim();
  }finally{queue.stop();}
 }
 @Test void failedEvaluationSubmissionDoesNotLeakTheActivityCounterOrEvaluationLock(){
  var db=mock(JdbcTemplate.class);var eval=new EvaluationService(store(db),mock(JevRouter.class),mock(Harness.class));var clock=new MutableClock();var activity=new BackgroundActivity(true,1,clock);
  ReflectionTestUtils.setField(eval,"activity",activity);clock.millis=1000;
  when(db.update(startsWith("INSERT INTO evaluations"),any(),any(),any(),any())).thenThrow(new IllegalStateException("isolated database unavailable"));
  try{
   assertThatThrownBy(()->eval.start("DEMO","MOCK")).hasMessage("isolated database unavailable");assertThat(activity.idle()).isTrue();
   assertThatThrownBy(()->eval.start("DEMO","MOCK")).hasMessage("isolated database unavailable");assertThat(activity.idle()).isTrue();
  }finally{eval.stop();}
 }
 @Test void ordinaryPageReadDoesNotWaitForAQueueDatabaseClaim()throws Exception{
  var queue=new DurableQueue(store(mock(JdbcTemplate.class)),mock(ObjectProvider.class));var holding=new CountDownLatch(1);var release=new CountDownLatch(1);var pool=Executors.newFixedThreadPool(2);
  try{
   pool.submit(()->{synchronized(queue){holding.countDown();try{release.await(3,TimeUnit.SECONDS);}catch(InterruptedException e){Thread.currentThread().interrupt();}}});
   assertThat(holding.await(1,TimeUnit.SECONDS)).isTrue();pool.submit(()->queue.authenticatedVisit(false)).get(500,TimeUnit.MILLISECONDS);
  }finally{release.countDown();pool.shutdownNow();queue.stop();}
 }
 @Test void runningEvaluationIsProtectedAfterVisitorsHaveLeft()throws Exception{
  var db=mock(JdbcTemplate.class);var eval=spy(new EvaluationService(store(db),mock(JevRouter.class),mock(Harness.class)));var clock=new MutableClock();var activity=new BackgroundActivity(true,1,clock);
  ReflectionTestUtils.setField(eval,"activity",activity);var entered=new CountDownLatch(1);var release=new CountDownLatch(1);
  doAnswer(inv->{entered.countDown();assertThat(release.await(3,TimeUnit.SECONDS)).isTrue();return Map.of();}).when(eval).evaluate("DEMO","MOCK");
  try{
   eval.start("DEMO","MOCK");assertThat(entered.await(1,TimeUnit.SECONDS)).isTrue();clock.millis=1000;assertThat(activity.idle()).isFalse();release.countDown();
   for(int i=0;i<100&&!activity.idle();i++)Thread.sleep(10);assertThat(activity.idle()).isTrue();
  }finally{release.countDown();eval.stop();}
 }
 @Test void graphPoolClosesOnlyWhenIdleAndNeverChangesStoredData(){
  var db=mock(JdbcTemplate.class);var graph=new Ontology(store(db),"disabled","",false,"neo4j","neo4j");var clock=new MutableClock();var activity=new BackgroundActivity(true,1,clock);var driver=mock(org.neo4j.driver.Driver.class);
  ReflectionTestUtils.setField(graph,"activity",activity);ReflectionTestUtils.setField(graph,"driver",driver);
  graph.releaseIdleConnections();verifyNoInteractions(driver);clock.millis=1000;activity.jobStarted();graph.releaseIdleConnections();verifyNoInteractions(driver);
  activity.jobFinished();graph.releaseIdleConnections();verify(driver).close();assertThat(ReflectionTestUtils.getField(graph,"driver")).isNull();verifyNoInteractions(db);
 }
}
