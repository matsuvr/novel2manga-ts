-- 0020_add_panel_indices_guard.sql
-- Purpose: Re-add episode panel index columns in case earlier duplicate-number migration (0008) was skipped.
-- WARNING: If columns already exist this migration will fail. In that case:
--   1. Remove (or rename) this file locally
--   2. Re-run migrations
--   3. Restore file (no-op) if needed for history consistency
-- SQLite lacks IF NOT EXISTS for ADD COLUMN; accepting possible manual resolution.

ALTER TABLE episodes ADD COLUMN start_panel_index INTEGER;
ALTER TABLE episodes ADD COLUMN end_panel_index INTEGER;
