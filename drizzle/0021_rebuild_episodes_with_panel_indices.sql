-- 0021_rebuild_episodes_with_panel_indices.sql
-- Rebuild episodes table to ensure start_panel_index / end_panel_index columns exist.
-- This is needed because earlier duplicate-number migrations caused the ADD COLUMN step to be skipped in some environments.
-- Data preserved; new panel index columns initialized as NULL.

PRAGMA foreign_keys=OFF;
ALTER TABLE episodes RENAME TO __legacy_episodes;
CREATE TABLE episodes (
  id TEXT PRIMARY KEY NOT NULL,
  novel_id TEXT NOT NULL,
  job_id TEXT NOT NULL,
  episode_number INTEGER NOT NULL,
  title TEXT,
  summary TEXT,
  start_chunk INTEGER NOT NULL,
  start_char_index INTEGER NOT NULL,
  end_chunk INTEGER NOT NULL,
  end_char_index INTEGER NOT NULL,
  start_panel_index INTEGER,
  end_panel_index INTEGER,
  confidence REAL NOT NULL,
  episode_text_path TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (novel_id) REFERENCES novels(id) ON UPDATE NO ACTION ON DELETE CASCADE,
  FOREIGN KEY (job_id) REFERENCES jobs(id) ON UPDATE NO ACTION ON DELETE CASCADE
);
INSERT INTO episodes (
  id, novel_id, job_id, episode_number, title, summary,
  start_chunk, start_char_index, end_chunk, end_char_index,
  confidence, episode_text_path, created_at
) SELECT
  id, novel_id, job_id, episode_number, title, summary,
  start_chunk, start_char_index, end_chunk, end_char_index,
  confidence, episode_text_path, created_at
FROM __legacy_episodes;
DROP TABLE __legacy_episodes;
CREATE INDEX idx_episodes_novel_id ON episodes (novel_id);
CREATE INDEX idx_episodes_job_id ON episodes (job_id);
CREATE INDEX unique_job_episode ON episodes (job_id, episode_number);
PRAGMA foreign_keys=ON;
