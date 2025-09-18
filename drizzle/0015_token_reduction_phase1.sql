CREATE VIRTUAL TABLE alias_fts USING fts5(
  char_id,
  alias_text,
  context_words,
  tokenize = 'unicode61'
);
--> statement-breakpoint
CREATE TABLE character_registry (
  id TEXT PRIMARY KEY,
  canonical_name TEXT NOT NULL,
  aliases TEXT,
  summary TEXT,
  voice_style TEXT,
  relationships TEXT,
  first_chunk INTEGER NOT NULL,
  last_seen_chunk INTEGER NOT NULL,
  confidence_score REAL DEFAULT 1,
  status TEXT DEFAULT 'active',
  metadata TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);
--> statement-breakpoint
CREATE INDEX idx_char_last_seen ON character_registry(last_seen_chunk);
--> statement-breakpoint
CREATE INDEX idx_char_confidence ON character_registry(confidence_score);
--> statement-breakpoint
CREATE INDEX idx_char_status ON character_registry(status);
--> statement-breakpoint
CREATE TABLE scene_registry (
  id TEXT PRIMARY KEY,
  location TEXT NOT NULL,
  time_context TEXT,
  summary TEXT,
  anchor_text TEXT,
  chunk_range TEXT,
  metadata TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);
--> statement-breakpoint
CREATE INDEX idx_scene_range ON scene_registry(chunk_range);
--> statement-breakpoint
CREATE INDEX idx_scene_location ON scene_registry(location);
--> statement-breakpoint
CREATE TABLE chunk_state (
  job_id TEXT NOT NULL,
  chunk_index INTEGER NOT NULL,
  masked_text TEXT,
  extraction TEXT,
  confidence REAL,
  tier_used INTEGER,
  tokens_used INTEGER,
  processing_time_ms INTEGER,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY(job_id, chunk_index),
  FOREIGN KEY (job_id) REFERENCES jobs(id) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE INDEX idx_chunk_job ON chunk_state(job_id);
--> statement-breakpoint
CREATE INDEX idx_chunk_confidence ON chunk_state(confidence);
--> statement-breakpoint
CREATE INDEX idx_chunk_tier ON chunk_state(tier_used);
--> statement-breakpoint
CREATE TRIGGER trg_character_registry_touch_updated_at
AFTER UPDATE ON character_registry
BEGIN
  UPDATE character_registry
  SET updated_at = CURRENT_TIMESTAMP
  WHERE id = NEW.id;
END;
--> statement-breakpoint
CREATE TRIGGER trg_scene_registry_touch_updated_at
AFTER UPDATE ON scene_registry
BEGIN
  UPDATE scene_registry
  SET updated_at = CURRENT_TIMESTAMP
  WHERE id = NEW.id;
END;
