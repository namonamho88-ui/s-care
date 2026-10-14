package demo.brain;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.*;
import java.util.concurrent.*;
import java.util.concurrent.atomic.AtomicInteger;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;
import static org.mockito.ArgumentMatchers.*;

@SpringBootTest(webEnvironment=SpringBootTest.WebEnvironment.NONE,properties={
 "spring.datasource.url=jdbc:h2:mem:performance_contract;MODE=PostgreSQL;DATABASE_TO_LOWER=TRUE;DB_CLOSE_DELAY=-1",
 "spring.datasource.username=sa","spring.datasource.password=","brain.neo4j-uri=disabled","brain.graph-required=false",
 "brain.jev.local-url=http://127.0.0.1:19998/v1/systemone","brain.hermes-key=","brain.step-ms=0"})
class PerformanceIntegrationTest {
 @Autowired Store s; @Autowired DurableQueue queue;
 private String fixture(){String id=Store.id("INC-PERF-");s.db.update("INSERT INTO incidents(id,title,asset_id,owner_id,type,severity,status,mode,provider,observations,created_at) VALUES (?,'가상 병렬 검증','CMP-01','OP-01','RESOURCE','P2','ANALYZING','DEMO','MOCK','cpu 96%',?)",id,Store.now());return id;}
 private String job(String id,String token){String job=Store.id("JOB-");s.db.update("INSERT INTO work_jobs(id,incident_id,phase,status,token,lease_until,available_at,created_at) VALUES (?,?,'CONTINUE','RUNNING',?,?,?,?)",job,id,token,Timestamp.from(Instant.now().plusSeconds(120)),Store.now(),Store.now());return job;}
 private Harness harness(RpcClient rpc){return new Harness(s,mock(JevRouter.class),mock(Ontology.class),rpc,mock(LocalSkillStore.class),mock(EvidencePolicy.class),mock(KnowledgeEngine.class),0);}
 @Test void independentAgentsOverlapCarryLeaseAndReuseCompletedCheckpoints()throws Exception{
  String id=fixture(),token=UUID.randomUUID().toString(),job=job(id,token);var entered=new CountDownLatch(4);var release=new CountDownLatch(1);var calls=new AtomicInteger();var rpc=mock(RpcClient.class);
  when(rpc.agent(anyString(),eq(id),anyLong())).thenAnswer(inv->{
   assertThat(WorkContext.get()).isEqualTo(new WorkContext.Lease(job,token));assertThat(TransactionSynchronizationManager.isActualTransactionActive()).isFalse();s.checkLease(false);
   calls.incrementAndGet();entered.countDown();assertThat(release.await(5,TimeUnit.SECONDS)).isTrue();return Map.of("status",Map.of("state","completed"));
  });
  var h=harness(rpc);var executor=Executors.newSingleThreadExecutor();
  try{
   var run=executor.submit(()->{try{WorkContext.set(job,token);ReflectionTestUtils.invokeMethod(h,"runIndependentAgents",id);}finally{WorkContext.clear();}});
   assertThat(entered.await(5,TimeUnit.SECONDS)).as("all four agents start before any result is released").isTrue();release.countDown();run.get(10,TimeUnit.SECONDS);
   assertThat(s.db.queryForObject("SELECT COUNT(*) FROM work_checkpoints WHERE job_id=?",Integer.class,job)).isEqualTo(4);
   WorkContext.set(job,token);try{ReflectionTestUtils.invokeMethod(h,"runIndependentAgents",id);}finally{WorkContext.clear();}
   assertThat(calls).hasValue(4);assertThat(s.db.queryForObject("SELECT COUNT(*) FROM analysis_stage_metrics WHERE incident_id=? AND state='COMPLETED'",Integer.class,id)).isEqualTo(4);
   assertThat(executor.submit(WorkContext::get).get()).isNull();
  }finally{release.countDown();executor.shutdownNow();h.shutdown();s.db.update("UPDATE work_jobs SET status='COMPLETED' WHERE id=?",job);}
 }
 @Test void expiredParallelWorkerCannotCommitLateResults()throws Exception{
  String id=fixture(),token=UUID.randomUUID().toString(),job=job(id,token);var entered=new CountDownLatch(4);var release=new CountDownLatch(1);var rpc=mock(RpcClient.class);
  when(rpc.agent(anyString(),eq(id),anyLong())).thenAnswer(inv->{entered.countDown();release.await(5,TimeUnit.SECONDS);return Map.of("status",Map.of("state","completed"));});
  var h=harness(rpc);var executor=Executors.newSingleThreadExecutor();
  try{
   var run=executor.submit(()->{try{WorkContext.set(job,token);ReflectionTestUtils.invokeMethod(h,"runIndependentAgents",id);}finally{WorkContext.clear();}});
   assertThat(entered.await(5,TimeUnit.SECONDS)).isTrue();s.db.update("UPDATE work_jobs SET token=? WHERE id=?",UUID.randomUUID().toString(),job);release.countDown();
   assertThatThrownBy(()->run.get(10,TimeUnit.SECONDS)).hasCauseInstanceOf(CancellationException.class);
   assertThat(s.db.queryForObject("SELECT COUNT(*) FROM work_checkpoints WHERE job_id=?",Integer.class,job)).isZero();
   assertThat(s.db.queryForObject("SELECT COUNT(*) FROM events WHERE incident_id=? AND state='COMPLETED'",Integer.class,id)).isZero();
   assertThat(s.db.queryForObject("SELECT COUNT(*) FROM analysis_stage_metrics WHERE incident_id=? AND state='CANCELLED'",Integer.class,id)).isEqualTo(4);
  }finally{release.countDown();executor.shutdownNow();h.shutdown();s.db.update("UPDATE work_jobs SET status='COMPLETED' WHERE id=?",job);}
 }
 @Test void timingDoesNotInventModelOrNetworkMeasurementsAndSeparatesFallback(){
  String id=fixture();var traces=new PerformanceTrace(s);
  traces.measure(id,"JEV",()->{PerformanceTrace.recordHttp("JEV",120,null);PerformanceTrace.retry();PerformanceTrace.recordHttp("JEV",80,null);return Map.of("provider","MOCK_FALLBACK","simulated",true,"fallback",true);});
  var row=s.one("SELECT * FROM analysis_stage_metrics WHERE incident_id=?",id);
  assertThat(row).containsEntry("category","MOCK_FALLBACK").containsEntry("http_elapsed_ms",200L).containsEntry("retry_count",1).containsEntry("http_calls",2).containsEntry("model_inference_ms",null).containsEntry("network_wait_ms",null);
  assertThat(row.get("started_at")).isNotNull();assertThat(row.get("ended_at")).isNotNull();assertThat(((Number)row.get("duration_ms")).longValue()).isGreaterThanOrEqualTo(0);
  assertThat(traces.snapshot(id)).containsEntry("timingsAreAdditive",false);
 }
 @Test void queueResumeWaitsForIncidentLockAndHonorsConcurrentStop()throws Exception{
  String id=fixture(),token=UUID.randomUUID().toString(),job=job(id,token);var locked=new CountDownLatch(1);var release=new CountDownLatch(1);var pool=Executors.newFixedThreadPool(2);
  try{
   var stop=pool.submit(()->s.tx(()->{s.one("SELECT id FROM incidents WHERE id=? FOR UPDATE",id);locked.countDown();try{release.await(5,TimeUnit.SECONDS);}catch(InterruptedException e){throw new RuntimeException(e);}s.db.update("UPDATE incidents SET status='CANCELLED' WHERE id=?",id);return null;}));
   assertThat(locked.await(5,TimeUnit.SECONDS)).isTrue();
   var claim=pool.submit(()->s.tx(()->{s.db.update("UPDATE work_jobs SET lease_until=? WHERE id=?",Timestamp.from(Instant.now().minusSeconds(1)),job);return queue.claim();}));Thread.sleep(50);assertThat(claim.isDone()).isFalse();release.countDown();stop.get(5,TimeUnit.SECONDS);assertThat(claim.get(5,TimeUnit.SECONDS)).isNull();
   assertThat(s.one("SELECT status,token FROM work_jobs WHERE id=?",job)).containsEntry("status","CANCELLED").containsEntry("token",null);
  }finally{release.countDown();pool.shutdownNow();}
 }
}
