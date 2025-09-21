-- Migration: job leasing fields and notification outbox
-- Adds locked_by, lease_expires_at, last_notified_status, last_notified_at to jobs
-- Creates job_notifications outbox table with unique (job_id, status)

-- Add leasing columns to jobs if not exists
ALTER TABLE jobs ADD COLUMN locked_by TEXT;--> statement-breakpoint
ALTER TABLE jobs ADD COLUMN lease_expires_at TEXT;--> statement-breakpoint
ALTER TABLE jobs ADD COLUMN last_notified_status TEXT;--> statement-breakpoint
ALTER TABLE jobs ADD COLUMN last_notified_at TEXT;--> statement-breakpoint

-- Create job_notifications table
CREATE TABLE IF NOT EXISTS job_notifications (
  id TEXT PRIMARY KEY,
  job_id TEXT NOT NULL,
  status TEXT NOT NULL,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
CONSTRAINT fk_job_notifications_job FOREIGN KEY (job_id) REFERENCES jobs(id) ON DELETE CASCADE
);--> statement-breakpoint

-- Unique outbox per (job_id, status)
CREATE UNIQUE INDEX IF NOT EXISTS unique_job_notification ON job_notifications (job_id, status);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_job_notifications_job_id ON job_notifications (job_id);

