CREATE TABLE war_rooms (
 id VARCHAR(40) PRIMARY KEY,
 run_id VARCHAR(64) REFERENCES twin_runs(id),
 incident_id VARCHAR(64) REFERENCES incidents(id),
 mapped_node VARCHAR(40),
 knowledge_id VARCHAR(40) REFERENCES skills(id),
 updated_at TIMESTAMP NOT NULL
);
