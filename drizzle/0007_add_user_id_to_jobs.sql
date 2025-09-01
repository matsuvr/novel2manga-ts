ALTER TABLE jobs ADD COLUMN user_id text NOT NULL DEFAULT 'anonymous';
--> statement-breakpoint
CREATE INDEX idx_jobs_user_id ON jobs (user_id);
--> statement-breakpoint
-- Also prepare novels table with user_id before 0008 rebuild
ALTER TABLE novels ADD COLUMN user_id text;
--> statement-breakpoint
CREATE INDEX idx_novels_user_id ON novels (user_id);
