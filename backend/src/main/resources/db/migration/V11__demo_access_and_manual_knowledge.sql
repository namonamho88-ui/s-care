ALTER TABLE skills ADD COLUMN source_kind VARCHAR(30) NOT NULL DEFAULT 'AI_GENERATED';
ALTER TABLE skills ADD COLUMN symptoms TEXT NOT NULL DEFAULT '';
ALTER TABLE skills ADD COLUMN created_by VARCHAR(60) NOT NULL DEFAULT 'legacy';
ALTER TABLE skills ADD COLUMN submitted_at TIMESTAMP;
CREATE TABLE skill_assets(skill_id VARCHAR(40) NOT NULL REFERENCES skills(id),asset_id VARCHAR(40) NOT NULL REFERENCES assets(id),PRIMARY KEY(skill_id,asset_id));
CREATE INDEX skill_assets_asset ON skill_assets(asset_id,skill_id);
INSERT INTO skill_assets(skill_id,asset_id) SELECT s.id,i.asset_id FROM skills s JOIN incidents i ON i.id=s.incident_id;
CREATE TABLE demo_access_settings(id INTEGER PRIMARY KEY CHECK(id=1),enabled BOOLEAN NOT NULL,epoch INTEGER NOT NULL DEFAULT 0);
INSERT INTO demo_access_settings(id,enabled) VALUES (1,TRUE);
CREATE TABLE demo_sessions(token_hash VARCHAR(64) PRIMARY KEY,actor VARCHAR(60) NOT NULL,epoch INTEGER NOT NULL,expires_at TIMESTAMP NOT NULL);

UPDATE skills SET source_kind='IMPORTED' WHERE incident_id IS NULL AND source_provider='LOCAL_SKILL_STORE';
ALTER TABLE skills ADD CONSTRAINT skill_source_kind CHECK(source_kind IN ('MANUAL_ENTRY','AI_GENERATED','IMPORTED'));
