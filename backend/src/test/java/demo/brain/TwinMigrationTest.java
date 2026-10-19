package demo.brain;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.Test;
import java.sql.DriverManager;
import static org.assertj.core.api.Assertions.*;
class TwinMigrationTest {
 @Test void v15BackfillsExistingReportsOnceWithoutChangingJson()throws Exception{
  String url="jdbc:h2:mem:twin_migration;MODE=PostgreSQL;DATABASE_TO_LOWER=TRUE;DB_CLOSE_DELAY=-1";
  Flyway.configure().dataSource(url,"sa","").target("14").load().migrate();
  String report="{\"id\":\"old\",\"status\":\"RUNNING\",\"completed\":2,\"rows\":[]}";
  try(var c=DriverManager.getConnection(url,"sa","");var p=c.prepareStatement("INSERT INTO twin_evaluations VALUES ('old','test',?,CURRENT_TIMESTAMP)")){p.setString(1,report);p.executeUpdate();}
  Flyway.configure().dataSource(url,"sa","").load().migrate();
  try(var c=DriverManager.getConnection(url,"sa","");var p=c.createStatement();var rows=p.executeQuery("SELECT * FROM twin_evaluations WHERE id='old'")){assertThat(rows.next()).isTrue();assertThat(rows.getString("status")).isEqualTo("RUNNING");assertThat(rows.getInt("completed")).isEqualTo(2);assertThat(rows.getString("result_json")).isEqualTo(report);}
 }
}
