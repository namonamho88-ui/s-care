package demo.brain;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfSystemProperty;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.client.TestRestTemplate;
import org.springframework.http.*;
import java.nio.file.*;
import java.util.*;
import static org.assertj.core.api.Assertions.*;

/** Opt-in, disposable H2 + loopback-only failures. Never connects to a model or production DB. */
@EnabledIfSystemProperty(named="performanceBenchmark",matches="true")
@org.springframework.context.annotation.Import(BenchmarkJdbcLatency.class)
@SpringBootTest(webEnvironment=SpringBootTest.WebEnvironment.DEFINED_PORT,properties={
 "server.port=18091","spring.datasource.url=jdbc:h2:mem:latency_benchmark;MODE=PostgreSQL;DATABASE_TO_LOWER=TRUE;DB_CLOSE_DELAY=-1",
 "spring.datasource.username=sa","spring.datasource.password=","brain.admin-token=isolated-benchmark-only",
 "brain.neo4j-uri=disabled","brain.graph-required=false","brain.internal-url=http://127.0.0.1:18091",
 "brain.jev.local-url=http://127.0.0.1:19998/v1/systemone","brain.jev.typesafe-key=",
 "brain.hermes-url=http://127.0.0.1:19997/v1","brain.hermes-key=isolated-unreachable",
 "brain.hermes-skills-dir=","brain.hermes-publish-mode=filesystem"})
class AnalysisLatencyBenchmarkTest {
 @Autowired Store s; @Autowired TestRestTemplate http;
 private static final String OBSERVATIONS="가상 결제 서비스 CPU 96%, cpu throttling 관측, memory 92%, process queue pressure. 응답 지연 3200ms, service remains available. 재발 이력은 조회되지 않았다.";
 private Map post(String path,Object body){var headers=new HttpHeaders();headers.setBearerAuth("isolated-benchmark-only");var response=http.exchange(path,HttpMethod.POST,new HttpEntity<>(body,headers),Map.class);assertThat(response.getStatusCode().is2xxSuccessful()).as(path+" "+response.getBody()).isTrue();return response.getBody();}
 @Test void isolatedRepeatedPipeline() throws Exception {
  int repetitions=Integer.getInteger("benchmarkRepetitions",12);assertThat(repetitions).isGreaterThanOrEqualTo(10);
  boolean recovery=Boolean.getBoolean("benchmarkRecovery");BenchmarkJdbcLatency.enabled=true;
  s.tx(()->{assertThat(org.springframework.transaction.support.TransactionSynchronizationManager.hasResource(s.db.getDataSource())).as("latency wrapper must preserve the transaction-bound DataSource").isTrue();return null;});
  var samples=new ArrayList<Map<String,Object>>();
  for(String mode:List.of("DEMO","REAL"))for(int n=0;n<repetitions;n++){
   long start=System.nanoTime();
   String id=post("/api/incidents",Map.of("title","격리된 가상 지연 벤치마크","assetId","CMP-01","ownerId","OP-01","observations",OBSERVATIONS,"mode",mode,"provider",mode.equals("DEMO")?"MOCK":"LOCAL")).get("id").toString();
   Map<String,Object> row;long deadline=System.nanoTime()+120_000_000_000L;
   do{row=s.incident(id);if(!List.of("REGISTERED","ANALYZING").contains(row.get("status")))break;Thread.sleep(10);}while(System.nanoTime()<deadline);
   double elapsed=(System.nanoTime()-start)/1_000_000.0;
   assertThat(row.get("status")).as("benchmark "+id).isEqualTo("WAITING_APPROVAL");
   var decision=s.json.valueToTree(s.decode(row.get("decision_json")));
   assertThat(decision.path("simulated").asBoolean()).isTrue();
   String category=mode.equals("DEMO")?"DEMO_MOCK":"MOCK_FALLBACK";
   if(mode.equals("REAL"))assertThat(decision.path("provider").asText()).isEqualTo("MOCK_FALLBACK");
   var sample=new LinkedHashMap<String,Object>();sample.put("iteration",n+1);sample.put("category",category);sample.put("elapsedMs",elapsed);sample.put("status",row.get("status"));sample.put("actualProvider",decision.path("provider").asText());sample.put("classification",decision.path("type").asText());
   if(recovery){
    long recoveryStart=System.nanoTime();post("/api/incidents/"+id+"/approval",Map.of("approved",true,"reason","격리된 가상 복구 성능 검증"));deadline=System.nanoTime()+120_000_000_000L;
    do{row=s.incident(id);if(!"RECOVERING".equals(row.get("status")))break;Thread.sleep(25);}while(System.nanoTime()<deadline);
    assertThat(row.get("status")).isEqualTo("RESOLVED");double recoveryMs=(System.nanoTime()-recoveryStart)/1_000_000.0;
    sample.put("analysisMs",elapsed);sample.put("recoveryMs",recoveryMs);sample.put("elapsedMs",elapsed+recoveryMs);sample.put("status",row.get("status"));
   }
   sample.put("events",s.db.queryForList("SELECT stage,state,created_at FROM events WHERE incident_id=? ORDER BY id",id));
   if(s.db.queryForObject("SELECT COUNT(*) FROM information_schema.tables WHERE table_name='analysis_stage_metrics'",Integer.class)>0)
    sample.put("metrics",s.db.queryForList("SELECT stage,state,duration_ms,http_elapsed_ms,model_inference_ms,network_wait_ms,retry_count,category FROM analysis_stage_metrics WHERE incident_id=? ORDER BY started_at",id));
   samples.add(sample);
   if(!recovery)post("/api/incidents/"+id+"/approval",Map.of("approved",false,"reason","격리 성능 측정 종료: 복구 미실행"));
  }
  var summaries=new LinkedHashMap<String,Object>();
  for(String category:List.of("DEMO_MOCK","MOCK_FALLBACK")){
   double[] times=samples.stream().filter(x->category.equals(x.get("category"))).mapToDouble(x->((Number)x.get("elapsedMs")).doubleValue()).sorted().toArray();
   summaries.put(category,Map.of("count",times.length,"meanMs",Arrays.stream(times).average().orElseThrow(),"medianMs",(times[(times.length-1)/2]+times[times.length/2])/2,"p95Ms",times[(int)Math.ceil(times.length*.95)-1]));
  }
  summaries.put("REAL_AI",Map.of("count",0,"reason","No actual model available/called. Not inferred from mock timings."));
  var result=new LinkedHashMap<String,Object>();result.put("label",System.getProperty("benchmarkLabel","optimized"));result.put("environment","ISOLATED_H2_LOOPBACK_ONLY");result.put("fictional",true);result.put("observations",OBSERVATIONS);result.put("measurement","POST /api/incidents to WAITING_APPROVAL; includes durable queue wait; no human approval or recovery");result.put("p95Method","nearest-rank");result.put("summaries",summaries);result.put("samples",samples);
  Files.createDirectories(Path.of("target"));
  result.put("measurement",recovery?"Registration through WAITING_APPROVAL plus approval through RESOLVED; excludes human input time":"Registration through WAITING_APPROVAL");
  result.put("injectedJdbcLatencyMs",BenchmarkJdbcLatency.delayMs);result.put("productionLatencyEstimate",false);BenchmarkJdbcLatency.enabled=false;
  Files.writeString(Path.of("target","analysis-benchmark.json"),s.json.writerWithDefaultPrettyPrinter().writeValueAsString(result));
 }
}
