CREATE TABLE twin_runs (
 id VARCHAR(64) PRIMARY KEY, owner_id VARCHAR(100) NOT NULL, version INT NOT NULL DEFAULT 0,
 status VARCHAR(32) NOT NULL, document_json TEXT NOT NULL, created_at TIMESTAMP NOT NULL, updated_at TIMESTAMP NOT NULL
);
CREATE INDEX twin_runs_owner ON twin_runs(owner_id, created_at);
CREATE TABLE twin_evaluations (
 id VARCHAR(64) PRIMARY KEY, owner_id VARCHAR(100) NOT NULL, result_json TEXT NOT NULL, created_at TIMESTAMP NOT NULL
);
