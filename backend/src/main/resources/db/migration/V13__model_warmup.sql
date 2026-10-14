CREATE TABLE model_warmup_limits (
 target VARCHAR(30) PRIMARY KEY,
 window_started_at TIMESTAMP NOT NULL,
 calls_in_window INTEGER NOT NULL DEFAULT 0,
 next_allowed_at TIMESTAMP,
 in_flight_until TIMESTAMP,
 in_flight_token VARCHAR(40),
 last_result_json TEXT NOT NULL DEFAULT '{}'
);
INSERT INTO model_warmup_limits(target,window_started_at) VALUES ('JEV_LOCAL',CURRENT_TIMESTAMP);
INSERT INTO model_warmup_limits(target,window_started_at) VALUES ('JEV_TYPESAFE',CURRENT_TIMESTAMP);
INSERT INTO model_warmup_limits(target,window_started_at) VALUES ('HERMES',CURRENT_TIMESTAMP);
