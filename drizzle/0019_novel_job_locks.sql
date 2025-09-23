-- 0019_novel_job_locks.sql
-- Adds novel_job_locks table to serialize /api/analyze job creation per novel

CREATE TABLE IF NOT EXISTS novel_job_locks (
  novel_id TEXT PRIMARY KEY REFERENCES novels(id) ON DELETE CASCADE,
  locked_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP),
  expires_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_novel_job_locks_expires ON novel_job_locks(expires_at);
