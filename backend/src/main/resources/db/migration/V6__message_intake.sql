-- Only parsed, allowlisted observations are persisted; no raw SMS or recipient list.
CREATE TABLE message_intakes (
 fingerprint VARCHAR(64) PRIMARY KEY,
 incident_id VARCHAR(40) NOT NULL UNIQUE REFERENCES incidents(id),
 source_key VARCHAR(180) NOT NULL,
 parsed_json TEXT NOT NULL,
 created_by VARCHAR(60) NOT NULL,
 created_at TIMESTAMP NOT NULL
);
CREATE INDEX message_intakes_source ON message_intakes(source_key);
