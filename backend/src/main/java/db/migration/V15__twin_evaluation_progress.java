package db.migration;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.flywaydb.core.api.migration.BaseJavaMigration;
import org.flywaydb.core.api.migration.Context;

/** Backfill legacy JSON once during migration, never on every cold start. */
public class V15__twin_evaluation_progress extends BaseJavaMigration {
 @Override public void migrate(Context context)throws Exception {
  var connection=context.getConnection();
  try(var sql=connection.createStatement()){
   sql.execute("ALTER TABLE twin_evaluations ADD COLUMN status VARCHAR(32) NOT NULL DEFAULT 'UNKNOWN'");
   sql.execute("ALTER TABLE twin_evaluations ADD COLUMN completed INT NOT NULL DEFAULT 0");
  }
  var json=new ObjectMapper();
  try(var read=connection.createStatement();var rows=read.executeQuery("SELECT id,result_json FROM twin_evaluations");var update=connection.prepareStatement("UPDATE twin_evaluations SET status=?,completed=? WHERE id=?")){
   while(rows.next()){
    var report=json.readTree(rows.getString("result_json"));String status=report.path("status").asText("FAILED");
    update.setString(1,status);update.setInt(2,status.equals("COMPLETED")?6:report.path("completed").asInt(0));update.setString(3,rows.getString("id"));update.executeUpdate();
   }
  }
  try(var sql=connection.createStatement()){
   sql.execute("CREATE INDEX twin_evaluations_owner_created ON twin_evaluations(owner_id,created_at)");
   sql.execute("CREATE INDEX twin_evaluations_status ON twin_evaluations(status)");
   sql.execute("CREATE INDEX twin_runs_status ON twin_runs(status)");
  }
 }
}
