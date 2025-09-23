-- Migration: add start_panel_index & end_panel_index to episodes
-- Up
ALTER TABLE episodes ADD COLUMN start_panel_index INTEGER;
ALTER TABLE episodes ADD COLUMN end_panel_index INTEGER;

-- Down
-- Note: SQLite cannot drop columns directly without table rebuild. For rollback, one would need to
-- 1. create a new temp table without the columns
-- 2. copy data
-- 3. drop original & rename temp
-- This simplified down migration is a no-op placeholder.
