ALTER TABLE incidents ADD COLUMN deleted_at TIMESTAMP;
ALTER TABLE incidents ADD COLUMN stop_reason TEXT;
ALTER TABLE incidents ADD COLUMN stopped_at TIMESTAMP;
