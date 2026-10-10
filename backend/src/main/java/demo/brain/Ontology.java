package demo.brain;
import org.springframework.stereotype.Service;
import org.springframework.beans.factory.annotation.Value;
import org.neo4j.driver.*;
import jakarta.annotation.PreDestroy;
import java.util.*;
@Service
public class Ontology {
 private final Store s;private final Driver driver;private final boolean required;private final SessionConfig sessionConfig;private volatile String status="NOT_INITIALIZED";
 public Ontology(Store s,@Value("${brain.neo4j-uri}") String uri,@Value("${brain.neo4j-password}") String password,@Value("${brain.graph-required}") boolean required,@Value("${brain.neo4j-user:neo4j}") String user,@Value("${brain.neo4j-database:neo4j}") String database){this.s=s;this.required=required;sessionConfig=SessionConfig.forDatabase(database);driver=uri.equals("disabled")?null:GraphDatabase.driver(uri,AuthTokens.basic(user,password),Config.builder().withConnectionTimeout(3,java.util.concurrent.TimeUnit.SECONDS).build());}
 public String status(){return status;}
 public List<Map<String,Object>> nodes(){return s.db.queryForList("SELECT * FROM assets ORDER BY id");}
 public List<Map<String,Object>> edges(){return s.db.queryForList("SELECT * FROM dependencies ORDER BY source_id,target_id");}
 public synchronized void sync(){if(driver==null){status="SQL_FALLBACK";return;}try(var session=driver.session(sessionConfig)){
  session.run("CREATE CONSTRAINT asset_id IF NOT EXISTS FOR (a:Asset) REQUIRE a.id IS UNIQUE").consume();session.executeWrite(tx->{for(var node:nodes())tx.run("MERGE (a:Asset {id:$id}) SET a.name=$name,a.kind=$kind,a.system_id=$system_id",node).consume();for(var edge:edges())tx.run("MATCH (a:Asset {id:$source_id}),(b:Asset {id:$target_id}) MERGE (a)-[:DEPENDS_ON]->(b)",edge).consume();return null;});status="NEO4J";
 }catch(Exception e){status="UNAVAILABLE";throw new IllegalStateException("Neo4j unavailable");}}
 public Map<String,Object> impact(String root){
  if(driver!=null){if(!status.equals("NEO4J"))sync();try(var session=driver.session(sessionConfig)){var affected=session.run("MATCH (root:Asset {id:$id}) MATCH (a:Asset)-[:DEPENDS_ON*0..6]->(root) RETURN DISTINCT a.id AS id ORDER BY id",Map.of("id",root)).list(r->r.get("id").asString());if(affected.isEmpty())throw new IllegalStateException("Asset missing from graph");return Map.of("engine","NEO4J","root",root,"affected",affected,"depth",6);}}
  if(required)throw new IllegalStateException("Neo4j is required");Set<String> seen=new TreeSet<>(List.of(root));Set<String> frontier=new HashSet<>(seen);var edges=edges();for(int depth=0;depth<6;depth++){Set<String> next=new HashSet<>();for(var e:edges)if(frontier.contains(e.get("target_id"))&&seen.add(e.get("source_id").toString()))next.add(e.get("source_id").toString());frontier=next;}return Map.of("engine","SQL_FALLBACK","root",root,"affected",seen,"depth",6);
 }
 @PreDestroy void close(){if(driver!=null)driver.close();}
}
