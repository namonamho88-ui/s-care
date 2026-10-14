-- Additive telemetry only: existing incident rows and results are never rewritten.
CREATE TABLE analysis_stage_metrics (
 id VARCHAR(40) PRIMARY KEY,
 incident_id VARCHAR(40) NOT NULL REFERENCES incidents(id),
 job_id VARCHAR(40), stage VARCHAR(40) NOT NULL, state VARCHAR(20) NOT NULL,
 started_at TIMESTAMP NOT NULL, ended_at TIMESTAMP,
 duration_ms BIGINT, http_elapsed_ms BIGINT NOT NULL DEFAULT 0,
 model_inference_ms BIGINT, network_wait_ms BIGINT,
 retry_count INTEGER NOT NULL DEFAULT 0, http_calls INTEGER NOT NULL DEFAULT 0,
 category VARCHAR(30) NOT NULL, provider VARCHAR(80),
 timing_source VARCHAR(80) NOT NULL
);
CREATE INDEX analysis_metrics_incident ON analysis_stage_metrics(incident_id,started_at);
