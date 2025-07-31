-- =====================================================
-- Novel2Manga データベーススキーマ - Novel最上位版
-- Novel → Job → 各処理ステップ
-- =====================================================

-- 小説テーブル（最上位エンティティ）
CREATE TABLE novels (
  id TEXT PRIMARY KEY,
  title TEXT,
  author TEXT,
  original_text_path TEXT NOT NULL, -- ストレージ上の小説ファイルパス
  text_length INTEGER NOT NULL,
  language TEXT DEFAULT 'ja',
  metadata_path TEXT, -- ストレージ上のメタデータJSONファイルパス
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 変換ジョブテーブル（小説に対する変換処理）
CREATE TABLE jobs (
  id TEXT PRIMARY KEY,
  novel_id TEXT NOT NULL,
  job_name TEXT, -- ジョブの名前や説明
  
  -- ステータス管理
  status TEXT NOT NULL DEFAULT 'pending', -- pending/processing/completed/failed/paused
  current_step TEXT NOT NULL DEFAULT 'initialized', -- initialized/split/analyze/episode/layout/render/complete
  
  -- 各ステップの完了状態
  split_completed BOOLEAN DEFAULT FALSE,
  analyze_completed BOOLEAN DEFAULT FALSE,
  episode_completed BOOLEAN DEFAULT FALSE,
  layout_completed BOOLEAN DEFAULT FALSE,
  render_completed BOOLEAN DEFAULT FALSE,
  
  -- 各ステップの成果物パス（ディレクトリ）
  chunks_dir_path TEXT, -- チャンクファイルのディレクトリ
  analyses_dir_path TEXT, -- 分析結果のディレクトリ
  episodes_data_path TEXT, -- エピソード情報のJSONファイル
  layouts_dir_path TEXT, -- レイアウトファイルのディレクトリ
  renders_dir_path TEXT, -- 描画結果のディレクトリ
  
  -- 進捗詳細
  total_chunks INTEGER DEFAULT 0,
  processed_chunks INTEGER DEFAULT 0,
  total_episodes INTEGER DEFAULT 0,
  processed_episodes INTEGER DEFAULT 0,
  total_pages INTEGER DEFAULT 0,
  rendered_pages INTEGER DEFAULT 0,
  
  -- エラー管理
  last_error TEXT,
  last_error_step TEXT,
  retry_count INTEGER DEFAULT 0,
  
  -- 再開用の状態保存
  resume_data_path TEXT, -- 中断時の詳細状態JSONファイル
  
  -- タイムスタンプ
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  started_at DATETIME,
  completed_at DATETIME,
  
  FOREIGN KEY (novel_id) REFERENCES novels(id) ON DELETE CASCADE
);

-- ジョブステップ履歴テーブル（各ステップの実行記録）
CREATE TABLE job_step_history (
  id TEXT PRIMARY KEY,
  job_id TEXT NOT NULL,
  step_name TEXT NOT NULL, -- split/analyze/episode/layout/render
  status TEXT NOT NULL, -- started/completed/failed/skipped
  started_at DATETIME NOT NULL,
  completed_at DATETIME,
  duration_seconds INTEGER,
  input_path TEXT, -- このステップへの入力
  output_path TEXT, -- このステップの出力
  error_message TEXT,
  metadata TEXT, -- JSON形式の追加情報
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (job_id) REFERENCES jobs(id) ON DELETE CASCADE
);

-- チャンクテーブル（分割されたテキスト）
CREATE TABLE chunks (
  id TEXT PRIMARY KEY,
  novel_id TEXT NOT NULL,
  job_id TEXT NOT NULL,
  chunk_index INTEGER NOT NULL,
  content_path TEXT NOT NULL, -- ストレージ上のチャンクファイルパス
  start_position INTEGER NOT NULL, -- 元テキストでの開始位置
  end_position INTEGER NOT NULL, -- 元テキストでの終了位置
  word_count INTEGER,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (novel_id) REFERENCES novels(id) ON DELETE CASCADE,
  FOREIGN KEY (job_id) REFERENCES jobs(id) ON DELETE CASCADE,
  UNIQUE(job_id, chunk_index)
);

-- チャンク分析状態テーブル（各チャンクの分析完了状態）
CREATE TABLE chunk_analysis_status (
  id TEXT PRIMARY KEY,
  job_id TEXT NOT NULL,
  chunk_index INTEGER NOT NULL,
  is_analyzed BOOLEAN DEFAULT FALSE,
  analysis_path TEXT, -- ストレージ上の分析結果ファイルパス
  analyzed_at DATETIME,
  retry_count INTEGER DEFAULT 0,
  last_error TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (job_id) REFERENCES jobs(id) ON DELETE CASCADE,
  UNIQUE(job_id, chunk_index)
);

-- エピソードテーブル
CREATE TABLE episodes (
  id TEXT PRIMARY KEY,
  novel_id TEXT NOT NULL,
  job_id TEXT NOT NULL,
  episode_number INTEGER NOT NULL,
  title TEXT,
  summary TEXT,
  start_chunk INTEGER NOT NULL,
  start_char_index INTEGER NOT NULL,
  end_chunk INTEGER NOT NULL,
  end_char_index INTEGER NOT NULL,
  estimated_pages INTEGER NOT NULL,
  confidence REAL NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (novel_id) REFERENCES novels(id) ON DELETE CASCADE,
  FOREIGN KEY (job_id) REFERENCES jobs(id) ON DELETE CASCADE,
  UNIQUE(job_id, episode_number)
);

-- レイアウト状態テーブル（各エピソードのレイアウト生成状態）
CREATE TABLE layout_status (
  id TEXT PRIMARY KEY,
  job_id TEXT NOT NULL,
  episode_number INTEGER NOT NULL,
  is_generated BOOLEAN DEFAULT FALSE,
  layout_path TEXT, -- ストレージ上のレイアウトファイルパス
  total_pages INTEGER,
  total_panels INTEGER,
  generated_at DATETIME,
  retry_count INTEGER DEFAULT 0,
  last_error TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (job_id) REFERENCES jobs(id) ON DELETE CASCADE,
  UNIQUE(job_id, episode_number)
);

-- 描画状態テーブル（各ページの描画状態）
CREATE TABLE render_status (
  id TEXT PRIMARY KEY,
  job_id TEXT NOT NULL,
  episode_number INTEGER NOT NULL,
  page_number INTEGER NOT NULL,
  is_rendered BOOLEAN DEFAULT FALSE,
  image_path TEXT, -- ストレージ上の画像ファイルパス
  thumbnail_path TEXT,
  width INTEGER,
  height INTEGER,
  file_size INTEGER,
  rendered_at DATETIME,
  retry_count INTEGER DEFAULT 0,
  last_error TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (job_id) REFERENCES jobs(id) ON DELETE CASCADE,
  UNIQUE(job_id, episode_number, page_number)
);

-- 最終成果物テーブル
CREATE TABLE outputs (
  id TEXT PRIMARY KEY,
  novel_id TEXT NOT NULL,
  job_id TEXT NOT NULL,
  output_type TEXT NOT NULL, -- pdf/cbz/images_zip/epub
  output_path TEXT NOT NULL, -- ストレージ上の成果物ファイルパス
  file_size INTEGER,
  page_count INTEGER,
  metadata_path TEXT, -- 成果物のメタデータJSONファイルパス
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (novel_id) REFERENCES novels(id) ON DELETE CASCADE,
  FOREIGN KEY (job_id) REFERENCES jobs(id) ON DELETE CASCADE
);

-- ストレージ参照テーブル（全ファイルの追跡）
CREATE TABLE storage_files (
  id TEXT PRIMARY KEY,
  novel_id TEXT NOT NULL,
  job_id TEXT,
  file_path TEXT NOT NULL,
  file_category TEXT NOT NULL, -- original/chunk/analysis/episode/layout/render/output/metadata
  file_type TEXT NOT NULL, -- txt/json/yaml/png/jpg/pdf/zip
  file_size INTEGER,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (novel_id) REFERENCES novels(id) ON DELETE CASCADE,
  FOREIGN KEY (job_id) REFERENCES jobs(id) ON DELETE CASCADE,
  UNIQUE(file_path)
);

-- インデックス
CREATE INDEX idx_novels_created_at ON novels(created_at);
CREATE INDEX idx_jobs_novel_id ON jobs(novel_id);
CREATE INDEX idx_jobs_status ON jobs(status);
CREATE INDEX idx_jobs_current_step ON jobs(current_step);
CREATE INDEX idx_job_step_history_job_id ON job_step_history(job_id);
CREATE INDEX idx_chunks_novel_id ON chunks(novel_id);
CREATE INDEX idx_chunks_job_id ON chunks(job_id);
CREATE INDEX idx_chunk_analysis_status_job_id ON chunk_analysis_status(job_id);
CREATE INDEX idx_episodes_novel_id ON episodes(novel_id);
CREATE INDEX idx_episodes_job_id ON episodes(job_id);
CREATE INDEX idx_layout_status_job_id ON layout_status(job_id);
CREATE INDEX idx_render_status_job_id ON render_status(job_id);
CREATE INDEX idx_outputs_novel_id ON outputs(novel_id);
CREATE INDEX idx_outputs_job_id ON outputs(job_id);
CREATE INDEX idx_storage_files_novel_id ON storage_files(novel_id);

-- 小説の変換状況ビュー
CREATE VIEW novel_status_view AS
SELECT 
  n.id,
  n.title,
  n.author,
  COUNT(DISTINCT j.id) as total_jobs,
  COUNT(DISTINCT CASE WHEN j.status = 'completed' THEN j.id END) as completed_jobs,
  COUNT(DISTINCT CASE WHEN j.status = 'processing' THEN j.id END) as active_jobs,
  COUNT(DISTINCT o.id) as total_outputs,
  n.created_at,
  MAX(j.created_at) as last_job_created_at
FROM novels n
LEFT JOIN jobs j ON n.id = j.novel_id
LEFT JOIN outputs o ON n.id = o.novel_id
GROUP BY n.id;

-- ジョブ進捗ビュー
CREATE VIEW job_progress_view AS
SELECT 
  j.id,
  j.novel_id,
  n.title as novel_title,
  j.job_name,
  j.status,
  j.current_step,
  j.total_chunks,
  j.processed_chunks,
  CASE WHEN j.total_chunks > 0 
    THEN ROUND(j.processed_chunks * 100.0 / j.total_chunks, 2) 
    ELSE 0 END as chunk_progress_percent,
  j.total_episodes,
  j.processed_episodes,
  CASE WHEN j.total_episodes > 0 
    THEN ROUND(j.processed_episodes * 100.0 / j.total_episodes, 2) 
    ELSE 0 END as episode_progress_percent,
  j.total_pages,
  j.rendered_pages,
  CASE WHEN j.total_pages > 0 
    THEN ROUND(j.rendered_pages * 100.0 / j.total_pages, 2) 
    ELSE 0 END as render_progress_percent,
  j.created_at,
  j.started_at,
  j.completed_at,
  CASE WHEN j.completed_at IS NOT NULL AND j.started_at IS NOT NULL
    THEN (julianday(j.completed_at) - julianday(j.started_at)) * 86400
    ELSE NULL END as total_duration_seconds
FROM jobs j
JOIN novels n ON j.novel_id = n.id;

-- 再開可能ジョブビュー
CREATE VIEW resumable_jobs AS
SELECT 
  j.id,
  j.novel_id,
  n.title as novel_title,
  j.status,
  j.current_step,
  j.last_error,
  j.resume_data_path,
  CASE 
    WHEN j.current_step = 'split' THEN j.processed_chunks
    WHEN j.current_step = 'analyze' THEN (
      SELECT COUNT(*) FROM chunk_analysis_status 
      WHERE job_id = j.id AND is_analyzed = TRUE
    )
    WHEN j.current_step = 'layout' THEN (
      SELECT COUNT(*) FROM layout_status 
      WHERE job_id = j.id AND is_generated = TRUE
    )
    WHEN j.current_step = 'render' THEN j.rendered_pages
    ELSE 0
  END as progress_in_current_step,
  j.updated_at
FROM jobs j
JOIN novels n ON j.novel_id = n.id
WHERE j.status IN ('failed', 'paused', 'processing')
  AND j.current_step != 'complete';