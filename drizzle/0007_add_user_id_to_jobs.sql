ALTER TABLE jobs ADD COLUMN user_id text NOT NULL DEFAULT 'anonymous';
CREATE INDEX idx_jobs_user_id ON jobs (user_id);
