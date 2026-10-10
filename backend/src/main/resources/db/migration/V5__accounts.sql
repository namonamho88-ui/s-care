CREATE TABLE app_users (
 id VARCHAR(40) PRIMARY KEY,
 login VARCHAR(60) NOT NULL UNIQUE,
 display_name VARCHAR(100) NOT NULL,
 role VARCHAR(10) NOT NULL CHECK (role IN ('ADMIN','USER')),
 operator_id VARCHAR(40) NOT NULL UNIQUE REFERENCES operators(id),
 password_hash VARCHAR(300),
 enabled BOOLEAN NOT NULL DEFAULT TRUE,
 invite_hash VARCHAR(64),
 invite_expires_at TIMESTAMP,
 failed_attempts INTEGER NOT NULL DEFAULT 0,
 locked_until TIMESTAMP,
 created_at TIMESTAMP NOT NULL
);
CREATE TABLE app_sessions (
 token_hash VARCHAR(64) PRIMARY KEY,
 user_id VARCHAR(40) NOT NULL REFERENCES app_users(id),
 expires_at TIMESTAMP NOT NULL,
 created_at TIMESTAMP NOT NULL
);
CREATE INDEX sessions_user ON app_sessions(user_id);
CREATE INDEX sessions_expiry ON app_sessions(expires_at);
