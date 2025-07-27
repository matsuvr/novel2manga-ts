-- ジョブテーブル
CREATE TABLE jobs (
  id TEXT PRIMARY KEY,
  original_text TEXT NOT NULL,
  chunk_count INTEGER NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- チャンクテーブル
CREATE TABLE chunks (
  id TEXT PRIMARY KEY,
  job_id TEXT NOT NULL,
  chunk_index INTEGER NOT NULL,
  content TEXT NOT NULL,
  file_name TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (job_id) REFERENCES jobs(id),
  UNIQUE(job_id, chunk_index)
);

-- インデックス
CREATE INDEX idx_chunks_job_id ON chunks(job_id);