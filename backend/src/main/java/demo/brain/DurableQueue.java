package demo.brain;
import org.springframework.stereotype.Service;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.context.event.EventListener;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import jakarta.annotation.PreDestroy;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.*;
import java.util.concurrent.*;
import java.util.concurrent.atomic.AtomicInteger;

@Service
public class DurableQueue {
 private final Store s;private final ObjectProvider<Harness> harness;
 @org.springframework.beans.factory.annotation.Autowired(required=false) private BackgroundActivity activity;
 private final ScheduledExecutorService timer=Executors.newScheduledThreadPool(2);
 private final ExecutorService workers=Executors.newFixedThreadPool(4);
 private final AtomicInteger running=new AtomicInteger();private volatile boolean stopping;
 private ScheduledFuture<?> pendingPoll;private long pendingAt,pollGeneration;private volatile long retryAfterVisit;private volatile int databaseFailures;
 public DurableQueue(Store s,ObjectProvider<Harness> harness){this.s=s;this.harness=harness;}
 public void enqueue(String incident,String phase){
  s.db.update("INSERT INTO work_jobs(id,incident_id,phase,status,available_at,created_at) VALUES (?,?,?,'QUEUED',?,?)",Store.id("JOB-"),incident,phase,Store.now(),Store.now());
  // Wake only after commit: polling must never see an uncommitted incident or hold its transaction.
  if(org.springframework.transaction.support.TransactionSynchronizationManager.isSynchronizationActive())
   org.springframework.transaction.support.TransactionSynchronizationManager.registerSynchronization(new org.springframework.transaction.support.TransactionSynchronization(){@Override public void afterCommit(){wake();}});
  else wake();
 }
 public void wake(){schedulePoll(0);}
 public void authenticatedVisit(boolean resumed){
  // Normal page reads must not wait behind a queue claim's database transaction.
  if(!resumed&&(databaseFailures<=3||System.nanoTime()<retryAfterVisit))return;
  synchronized(this){if(resumed||(databaseFailures>3&&System.nanoTime()>=retryAfterVisit)){retryAfterVisit=System.nanoTime()+TimeUnit.SECONDS.toNanos(30);wake();}}
 }
 private synchronized void schedulePoll(long delay){
  if(stopping)return;long due=System.nanoTime()+TimeUnit.MILLISECONDS.toNanos(delay);
  if(pendingPoll!=null&&!pendingPoll.isDone()){if(pendingAt<=due)return;pendingPoll.cancel(false);}
  try{pendingAt=due;long generation=++pollGeneration;pendingPoll=timer.schedule(()->{synchronized(this){if(generation!=pollGeneration)return;pendingPoll=null;poll();}},delay,TimeUnit.MILLISECONDS);}
  catch(RejectedExecutionException ignored){/* Durable rows remain available to the next process. */}
 }
 @EventListener(ApplicationReadyEvent.class) public void start(){wake();}
 public Map<String,Object> claim(){return s.tx(()->{
  var rows=s.db.queryForList("SELECT * FROM work_jobs WHERE (status='QUEUED' AND available_at<=?) OR (status='RUNNING' AND lease_until<?) ORDER BY created_at LIMIT 1 FOR UPDATE SKIP LOCKED",Store.now(),Store.now());
  if(rows.isEmpty())return null;var job=rows.get(0);String id=job.get("id").toString();
  // Same lock order as Store.active: job then incident. Serialize resume with admin stop/delete.
  var incident=s.one("SELECT status,deleted_at FROM incidents WHERE id=? FOR UPDATE",job.get("incident_id"));
  if("CANCELLED".equals(incident.get("status"))||incident.get("deleted_at")!=null){s.db.update("UPDATE work_jobs SET status='CANCELLED',token=NULL WHERE id=?",id);return null;}
  if(((Number)job.get("attempts")).intValue()>=3){s.db.update("UPDATE work_jobs SET status='FAILED',token=NULL,error='작업 재개 횟수 초과' WHERE id=?",id);harness.getObject().fail(job.get("incident_id").toString(),"작업 재개 횟수 초과 · 관리자 재시도 필요");return null;}
  if(((Number)job.get("attempts")).intValue()>0){s.db.update("UPDATE analysis_stage_metrics SET state='ABANDONED',ended_at=?,duration_ms=NULL,timing_source='INTERRUPTED_DURATION_UNKNOWN' WHERE job_id=? AND state='RUNNING'",Store.now(),id);for(var task:s.db.queryForList("SELECT id,result_json FROM agent_tasks WHERE incident_id=? AND status='working'",job.get("incident_id"))){var result=s.json.convertValue(s.decode(task.get("result_json")),LinkedHashMap.class);result.put("status",Map.of("state","failed","timestamp",Instant.now().toString()));s.db.update("UPDATE agent_tasks SET status='failed',result_json=?,updated_at=? WHERE id=?",s.encode(result),Store.now(),task.get("id"));}s.audit(job.get("incident_id").toString(),"queue","WORK_RESUMED",Map.of("jobId",id,"previousAttempts",job.get("attempts")));}
  String token=UUID.randomUUID().toString();s.db.update("UPDATE work_jobs SET status='RUNNING',attempts=attempts+1,token=?,lease_until=? WHERE id=?",token,Timestamp.from(Instant.now().plusSeconds(45)),id);job.put("token",token);return job;
 });}
 private synchronized void poll(){
  if(stopping||running.get()>=4)return;
  try{
   var job=claim();
   if(job==null){
    // No perpetual idle polling. Persisted retry deadlines and abandoned leases still wake us.
    var deadlines=s.db.queryForList("SELECT MIN(CASE WHEN status='QUEUED' THEN available_at ELSE lease_until END) AS next_at FROM work_jobs WHERE status IN ('QUEUED','RUNNING')");
    databaseFailures=0;
    if(!deadlines.isEmpty()&&deadlines.get(0).get("next_at") instanceof Timestamp next)schedulePoll(Math.max(10,next.getTime()-System.currentTimeMillis()+10));
    return;
   }
   databaseFailures=0;running.incrementAndGet();if(activity!=null)activity.jobStarted();workers.submit(()->execute(job));schedulePoll(0);
  }catch(Exception ignored){
   // A disconnected database must not cause endless outbound traffic. Startup or the next
   // authenticated visit retries after these bounded attempts; no durable work is acknowledged.
   if(++databaseFailures<=3)schedulePoll(5000L*databaseFailures);
   else retryAfterVisit=System.nanoTime()+TimeUnit.SECONDS.toNanos(30);
  }
 }
 private void execute(Map<String,Object> job){String id=job.get("id").toString(),token=job.get("token").toString(),incident=job.get("incident_id").toString();
  var heartbeat=timer.scheduleWithFixedDelay(()->{try{s.db.update("UPDATE work_jobs SET lease_until=? WHERE id=? AND token=? AND status='RUNNING'",Timestamp.from(Instant.now().plusSeconds(45)),id,token);}catch(Exception ignored){}},10,10,TimeUnit.SECONDS);
  WorkContext.set(id,token);
  try{harness.getObject().executePhase(incident,job.get("phase").toString());finish(id,token,"COMPLETED",null);}
  catch(CancellationException e){finish(id,token,"CANCELLED",e.getMessage());}
  catch(Exception e){if(!stopping){var row=s.one("SELECT attempts FROM work_jobs WHERE id=?",id);boolean exhausted=((Number)row.get("attempts")).intValue()>=3;if(exhausted){s.active(incident,()->{harness.getObject().fail(incident,"작업 실패: "+e.getClass().getSimpleName());return null;});}s.db.update("UPDATE work_jobs SET status=?,error=?,available_at=?,token=NULL WHERE id=? AND token=?",exhausted?"FAILED":"QUEUED",e.getClass().getSimpleName(),Timestamp.from(Instant.now().plusSeconds(5)),id,token);}}
  finally{heartbeat.cancel(false);WorkContext.clear();running.decrementAndGet();if(activity!=null)activity.jobFinished();wake();}
 }
 private void finish(String id,String token,String state,String error){s.db.update("UPDATE work_jobs SET status=?,error=?,token=NULL WHERE id=? AND token=?",state,error,id,token);}
 @PreDestroy public synchronized void stop(){stopping=true;timer.shutdownNow();workers.shutdownNow();/* Lease expires; a new process resumes without trusting this process to finish. */}
}
