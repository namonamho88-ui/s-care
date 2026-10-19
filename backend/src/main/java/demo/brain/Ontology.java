package demo.brain;
import org.springframework.stereotype.Service;
import org.springframework.beans.factory.annotation.Value;
import org.neo4j.driver.*;
import jakarta.annotation.PreDestroy;
import java.util.*;
@Service
public class Ontology {
 @org.springframework.beans.factory.annotation.Value("${brain.graph-namespace:Asset}") private String namespace="Asset";
 private String query(String q){if(!namespace.matches("(?:Asset|Demo_[A-Za-z0-9_]{1,30})"))throw new IllegalStateException("Invalid graph namespace");return q.replace(":Asset",":"+namespace).replace("asset_id IF",namespace.toLowerCase(java.util.Locale.ROOT)+"_id IF");}
 private final Store s;private Driver driver;private final boolean required;private final SessionConfig sessionConfig;private volatile String status="NOT_INITIALIZED";
 private final String uri,user,password;
 @org.springframework.beans.factory.annotation.Autowired(required=false) private BackgroundActivity activity;
 public Ontology(Store s,@Value("${brain.neo4j-uri}") String uri,@Value("${brain.neo4j-password}") String password,@Value("${brain.graph-required}") boolean required,@Value("${brain.neo4j-user:neo4j}") String user,@Value("${brain.neo4j-database:neo4j}") String database){this.s=s;this.required=required;this.uri=uri;this.user=user;this.password=password;sessionConfig=SessionConfig.forDatabase(database);}
 private Driver driver(){if(driver==null&&!uri.equals("disabled"))driver=GraphDatabase.driver(uri,AuthTokens.basic(user,password),Config.builder().withConnectionTimeout(3,java.util.concurrent.TimeUnit.SECONDS).withMaxConnectionPoolSize(8).withEventLoopThreads(2).withTelemetryDisabled(true).build());return driver;}
 public String status(){return status;}
 public List<Map<String,Object>> nodes(){return s.db.queryForList("SELECT * FROM assets ORDER BY id");}
 public List<Map<String,Object>> edges(){return s.db.queryForList("SELECT * FROM dependencies ORDER BY source_id,target_id");}
 public synchronized void sync(){if(driver()==null){status="SQL_FALLBACK";return;}try(var session=driver.session(sessionConfig)){
  session.run(query("CREATE CONSTRAINT asset_id IF NOT EXISTS FOR (a:Asset) REQUIRE a.id IS UNIQUE")).consume();session.executeWrite(tx->{for(var node:nodes())tx.run(query("MERGE (a:Asset {id:$id}) SET a.name=$name,a.kind=$kind,a.system_id=$system_id"),node).consume();for(var edge:edges())tx.run(query("MATCH (a:Asset {id:$source_id}),(b:Asset {id:$target_id}) MERGE (a)-[:DEPENDS_ON]->(b)"),edge).consume();return null;});status="NEO4J";
 }catch(Exception e){status="UNAVAILABLE";throw new IllegalStateException("Neo4j unavailable");}}
 public synchronized Map<String,Object> impact(String root){
  if(driver()!=null){if(!status.equals("NEO4J"))sync();try(var session=driver.session(sessionConfig)){var affected=session.run(query("MATCH (root:Asset {id:$id}) MATCH p=(a:Asset)-[:DEPENDS_ON*0..6]->(root) WHERE all(n IN nodes(p) WHERE n:"+namespace+") RETURN DISTINCT a.id AS id ORDER BY id"),Map.of("id",root)).list(r->r.get("id").asString());if(affected.isEmpty())throw new IllegalStateException("Asset missing from graph");return enrich("NEO4J",root,affected);}}
  if(required)throw new IllegalStateException("Neo4j is required");Set<String> seen=new TreeSet<>(List.of(root));Set<String> frontier=new HashSet<>(seen);var edges=edges();for(int depth=0;depth<6;depth++){Set<String> next=new HashSet<>();for(var e:edges)if(frontier.contains(e.get("target_id"))&&seen.add(e.get("source_id").toString()))next.add(e.get("source_id").toString());frontier=next;}return enrich("SQL_FALLBACK",root,seen);
 }
 private Map<String,Object> enrich(String engine,String root,Collection<String> affected){
  var direct=edges().stream().filter(e->root.equals(e.get("target_id"))).map(e->e.get("source_id").toString()).filter(affected::contains).filter(id->!id.equals(root)).distinct().sorted().toList();
  var indirect=affected.stream().filter(id->!id.equals(root)&&!direct.contains(id)).sorted().toList();
  var all=nodes();var systemIds=new TreeSet<String>();for(var a:all)if(affected.contains(a.get("id"))){if("SYSTEM".equals(a.get("kind")))systemIds.add(a.get("id").toString());else if(a.get("system_id")!=null)systemIds.add(a.get("system_id").toString());}
  return Map.of("engine",engine,"root",root,"affected",affected,"direct",direct,"indirect",indirect,"systems",all.stream().filter(a->systemIds.contains(a.get("id"))).toList(),"depth",6,"analyzedAt",java.time.Instant.now().toString());
 }
 // Driver 5.x has no idle-pool eviction setting. The same monitor protects every graph
 // session, so closing idle sockets cannot interrupt a running query. Next use opens anew.
 @org.springframework.scheduling.annotation.Scheduled(fixedDelay=30000,initialDelay=30000)
 public synchronized void releaseIdleConnections(){if(activity!=null&&activity.idle())close();}
 @PreDestroy synchronized void close(){if(driver!=null){driver.close();driver=null;}}
}
