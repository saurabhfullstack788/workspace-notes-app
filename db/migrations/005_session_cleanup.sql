-- Index to speed up expired session cleanup (DELETE WHERE expires_at <= now())
CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires_at);
