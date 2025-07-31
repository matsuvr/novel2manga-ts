# Technical Design

## Overview

本設計書は、小説テキストをマンガ形式のレイアウト（絵コンテ）に自動変換するWebアプリケーションの技術実装について定義します。本ツールは編集者を補佐するツールであり、マンガの絵そのものを生成するのではなく、コマ割りと吹き出し配置の構成案を提供します。Mastra AIフレームワークをベースに、TypeScriptとNext.js 14を使用して、長文テキストの解析、5要素の抽出（登場人物・シーン・対話・ハイライト・状況）、連載エピソード構成、マンガレイアウト生成を実現します。

## Requirements Mapping

### Design Component Traceability

各設計コンポーネントが対応する要件：

- **テキスト解析エンジン** → REQ-1: テキスト入力と解析（チャンク分割、会話/地の文識別）
- **5要素抽出AI** → REQ-1.4: チャンク毎に会話部分、地の文、シーン転換の自動識別
- **エピソード構成エンジン** → REQ-3: 連載マンガとしてのエピソード分割
- **マンガレイアウト設計エンジン** → REQ-3: YAMLで漫画レイアウトを記述する（コマ割りと吹き出し配置）
- **マンガレイアウト生成エンジン** → YAMLからCanvas APIで、枠と状況説明とセリフによる絵コンテの描画（編集者向けの構成案として、マンガそのものの絵は含まない）
- **エクスポートサービス** → REQ-5: エクスポートと共有
- **プロジェクト管理** → REQ-6: データ管理とプロジェクト保存

### User Story Coverage

- 小説著者のニーズ: テキスト解析エンジンと5要素抽出AIで自動シーン解析を実現
- 読者のニーズ: Mastra統合によるYAMLで構造化されたマンガレイアウト
- マンガ制作者のニーズ: 日本式レイアウトエンジンによるプロフェッショナルなコマ割り
- カスタマイズニーズ: React Server Componentsによる高速なインタラクティブ編集
- 共有ニーズ: Next.js APIルートによる効率的なエクスポート処理

## Architecture

```mermaid
graph TB
    subgraph "Frontend Layer (Next.js 15)"
        A[Next.js App Router] --> B[Server Components]
        A --> C[Client Components]
        C --> D[Interactive Editor]
    end

    subgraph "AI Processing Layer (Mastra Agents)"
        E[Mastra Framework] --> F[ChunkAnalyzer Agent]
        E --> G[LayoutGenerator Agent]
        E --> H[NarrativeArcAnalyzer Agent]
        F --> I[5-Element Extractor]
        H --> J[Episode Boundary Detection]
    end

    subgraph "Business Logic Layer"
        K[JobNarrativeProcessor] --> L[DatabaseService]
        M[Panel Layout Engine] --> N[Layout Templates]
        O[Canvas Renderer] --> P[Storyboard Generator]
        Q[Export Service] --> R[Format Converters]
    end

    subgraph "Data Layer"
        S[Cloudflare D1] --> T[Novel/Job/Chunk Tables]
        S --> U[Episode/Layout/Render Tables]
        S --> V[Storage Files Tracking]
        W[Cloudflare R2] --> X[File Storage]
        Y[Local Storage] --> Z[Dev Environment]
    end

    B --> E
    C --> K
    E --> K
    K --> S
    G --> M
    M --> O
    O --> W
    Q --> S
    Q --> W
```

### Technology Stack

調査結果に基づく技術選定：

- **Frontend**: Next.js 15 (App Router) + TypeScript 5 + Tailwind CSS
- **AI Framework**: Mastra (TypeScript agent framework)
- **絵コンテ生成**: Canvas API（枠線・テキスト・吹き出しのみ、イラストは含まない）
- **Backend**: Next.js API Routes + Mastra Agents
- **Database**: Cloudflare D1 (SQLite ベース)
- **Cache**: Cloudflare KV (APIレスポンスキャッシュ)
- **File Storage**: Cloudflare R2 (プロダクション) / Local Storage (開発)
- **LLM Providers**: OpenAI, Gemini, Groq, Local (Ollama), OpenRouter
- **Configuration**: app.config.ts による集中管理 + 環境変数 (シークレットのみ)
- **Authentication**: NextAuth.js v5 (未実装)
- **Testing**: Vitest + Playwright + React Testing Library
- **Deployment**: Cloudflare Workers (OpenNext adapter)

### Architecture Decision Rationale

- **Next.js 15 App Router**: Server Componentsによる高速レンダリング、RSCによるクライアントJSの削減、Cloudflare Workers対応
- **Mastra Framework**: TypeScript完全対応、エージェント型アーキテクチャ、統合済みのLLM/画像生成API連携
- **Cloudflare D1**: SQLiteベースのエッジデータベース、階層構造データ管理、ジョブステータス追跡
- **Cloudflare R2**: S3互換API、エッジ配信、コスト効率
- **Cloudflare Workers**: グローバルエッジ配信、低レイテンシー、自動スケーリング、KVキャッシュ統合
- **設定管理**: app.config.ts による一元管理、環境変数オーバーライド、チューニング用コメント付き
- **複数LLMプロバイダー**: 用途に応じた最適なモデル選択、フォールバック機能、コスト最適化

## Data Flow

### Primary User Flow: テキストからマンガレイアウト生成

```mermaid
sequenceDiagram
    participant User
    participant RSC as Server Component
    participant Mastra as Mastra Agent
    participant AI as AI Services
    participant DB as Database
    participant Storage as R2 Storage
    participant Canvas as Canvas API

    User->>RSC: 小説テキスト投稿
    RSC->>Mastra: テキスト解析リクエスト
    Mastra->>AI: チャンク毎の5要素抽出
    AI-->>Mastra: 要素データ（登場人物、シーン、対話、ハイライト、状況）
    Mastra->>Mastra: 全チャンクの統合分析
    Mastra->>AI: エピソード構成分析
    AI-->>Mastra: エピソード分割案
    Mastra->>AI: レイアウトYAML生成
    AI-->>Mastra: コマ割り・吹き出し配置YAML
    Mastra->>Canvas: レイアウト描画（枠線・テキスト・吹き出しのみ）
    Canvas-->>Storage: 絵コンテ画像保存
    Mastra->>DB: プロジェクト保存
    Mastra-->>RSC: レイアウト結果
    RSC-->>User: 絵コンテプレビュー表示
```

### エピソード構成とレイアウト生成フロー

```mermaid
sequenceDiagram
    participant Chunks as Chunk Analyses
    participant Integration as Integration Service
    participant Episode as Episode Composer
    participant Layout as Layout Engine
    participant Canvas as Canvas Renderer
    participant Output as Output Files

    Chunks->>Integration: チャンク毎の5要素データ
    Integration->>Integration: 重複排除・統合
    Integration->>Episode: 統合済み解析データ
    Episode->>Episode: チャプター分割
    Episode->>Episode: クライマックス検出
    Episode->>Layout: エピソード構成
    Layout->>Layout: コマ割り計算（重要度ベース）
    Layout->>Layout: 吹き出し配置（読み順考慮）
    Layout->>Canvas: レイアウトYAML
    Canvas->>Canvas: 枠線描画
    Canvas->>Canvas: 状況説明テキスト配置
    Canvas->>Canvas: セリフ吹き出し描画
    Canvas-->>Output: 絵コンテ画像（PNG）
```

## Components and Interfaces

### Backend Services & Method Signatures

```typescript
// Mastra Agent定義
// ChunkAnalyzerAgent - チャンク分析エージェント
class ChunkAnalyzerAgent extends Agent {
  async analyzeChunk(params: {
    currentChunk: string;
    previousChunk?: string;
    nextChunk?: string;
    chunkMetadata: ChunkMetadata;
  }): Promise<ChunkAnalysisResult> // 5要素抽出（前後チャンク参照付き）
}

// NarrativeArcAnalyzerAgent - 物語構造分析エージェント
class NarrativeArcAnalyzerAgent extends Agent {
  async analyzeNarrativeArc(text: string, options: {
    targetCharsPerEpisode: number;
    minCharsPerEpisode: number;
    maxCharsPerEpisode: number;
    isMiddleOfNovel: boolean;
    startingEpisodeNumber: number;
  }): Promise<NarrativeArcAnalysis> // エピソード境界検出
}

// LayoutGeneratorAgent - レイアウト生成エージェント
class LayoutGeneratorAgent extends Agent {
  async generateLayout(episodeData: {
    episodeNumber: number;
    chunkAnalyses: ChunkAnalysisResult[];
    episodeInfo: Episode;
  }): Promise<MangaLayout> // レイアウトYAML生成（コマ割り・吹き出し配置）
}

// LLMプロバイダー設定
interface LLMProviderConfig {
  provider: 'openai' | 'gemini' | 'groq' | 'local' | 'openrouter';
  apiKey?: string;
  model: string;
  temperature?: number;
  maxTokens?: number;
  timeout?: number;
}

// ジョブ管理サービス
class JobNarrativeProcessor {
  async processJob(
    jobId: string,
    onProgress?: (progress: JobProgress) => void
  ): Promise<JobProgress> // ジョブ全体の処理
  
  async canResumeJob(jobId: string): Promise<boolean> // 再開可能かチェック
}

// データベースサービス
class DatabaseService {
  // Novel管理
  async createNovel(novel: Omit<Novel, 'id' | 'createdAt'>): Promise<string>
  async getNovel(id: string): Promise<Novel | null>
  
  // Job管理
  async createJob(job: Omit<Job, 'id' | 'createdAt'>): Promise<string>
  async updateJobStatus(id: string, status: JobStatus, error?: string): Promise<void>
  async updateJobProgress(id: string, progress: JobProgress): Promise<void>
  
  // Episode管理
  async createEpisodes(episodes: Episode[]): Promise<void>
  async getEpisodesByJobId(jobId: string): Promise<Episode[]>
  
  // 各ステップの状態管理
  async updateChunkAnalysisStatus(jobId: string, chunkIndex: number, status: AnalysisStatus): Promise<void>
  async updateLayoutStatus(jobId: string, episodeNumber: number, status: LayoutStatus): Promise<void>
  async updateRenderStatus(jobId: string, episodeNumber: number, pageNumber: number, status: RenderStatus): Promise<void>
}
```

### Frontend Components

| Component Name | Responsibility | Props/State Summary |
|----------------|----------------|---------------------|
| TextInputEditor | テキスト入力UI | text, onAnalyze, maxLength |
| ProgressTracker | 処理進捗表示 | steps, currentStep, progress |
| MangaPreview | マンガプレビュー表示 | layout, panels, editable |
| PanelEditor | コマ編集インターフェース | panel, onResize, onMove |
| SpeechBubbleEditor | 吹き出し編集 | bubble, text, style, onEdit |
| ExportDialog | エクスポート設定 | formats, onExport |
| ProjectManager | プロジェクト管理UI | projects, onSave, onLoad |

### API Endpoints

| Method | Route | Purpose | Auth | Status Codes |
|--------|-------|---------|------|--------------|
| POST | /api/novel/storage | 小説テキスト保存 | Implemented | 200, 400, 413, 500 |
| GET | /api/novel/storage/:id | 小説テキスト取得 | Implemented | 200, 404, 500 |
| POST | /api/novel/db | 小説メタデータDB保存 | Implemented | 200, 400, 500 |
| GET | /api/novel/[uuid]/chunks | チャンク分割・取得 | Implemented | 200, 404, 500 |
| POST | /api/analyze/chunk | チャンク単位の5要素分析 | Implemented | 200, 400, 500 |
| POST | /api/analyze/narrative-arc/full | 全体物語構造分析 | Implemented | 200, 400, 500 |
| GET | /api/job/[id] | ジョブ情報取得 | Implemented | 200, 404, 500 |
| GET | /api/jobs/[jobId]/status | ジョブステータス取得 | Implemented | 200, 404, 500 |
| GET | /api/jobs/[jobId]/episodes | エピソード一覧取得 | Implemented | 200, 404, 500 |
| POST | /api/jobs/[jobId]/resume | ジョブ再開 | Implemented | 200, 400, 404, 500 |
| POST | /api/layout/generate | レイアウトYAML生成 | Implemented | 200, 400, 500 |
| POST | /api/render | Canvasレンダリング | Not Implemented | 201, 400, 500 |
| POST | /api/export | マンガエクスポート | Not Implemented | 201, 400, 500 |
| POST | /api/share | 共有リンク生成 | Not Implemented | 201, 401, 500 |

## Data Models

### Domain Entities (新スキーマ対応)

1. **Novel**: 小説エンティティ（最上位）
2. **Job**: 変換ジョブ（Novelに対する処理単位）
3. **JobStepHistory**: 各処理ステップの履歴
4. **Chunk**: 分割されたテキストチャンク
5. **ChunkAnalysisStatus**: チャンク分析状態
6. **Episode**: エピソード境界情報
7. **LayoutStatus**: レイアウト生成状態
8. **RenderStatus**: 描画状態
9. **Output**: 最終成果物
10. **StorageFiles**: ファイル管理

### Entity Relationships

```mermaid
erDiagram
    NOVEL ||--|{ JOB : "has multiple"
    JOB ||--|{ CHUNK : "divided into"
    JOB ||--|{ JOB_STEP_HISTORY : "has history"
    JOB ||--|{ CHUNK_ANALYSIS_STATUS : "tracks analysis"
    JOB ||--|{ EPISODE : "generates"
    JOB ||--|{ LAYOUT_STATUS : "tracks layout"
    JOB ||--|{ RENDER_STATUS : "tracks render"
    JOB ||--|{ OUTPUT : "produces"
    NOVEL ||--|{ STORAGE_FILES : "has files"
    
    NOVEL {
        string id PK
        string title
        string author
        string original_text_path
        number text_length
        string language
        string metadata_path
        datetime created_at
        datetime updated_at
    }
    
    JOB {
        string id PK
        string novel_id FK
        string job_name
        string status
        string current_step
        boolean split_completed
        boolean analyze_completed
        boolean episode_completed
        boolean layout_completed
        boolean render_completed
        string chunks_dir_path
        string analyses_dir_path
        string episodes_data_path
        string layouts_dir_path
        string renders_dir_path
        number total_chunks
        number processed_chunks
        number total_episodes
        number processed_episodes
        number total_pages
        number rendered_pages
        string last_error
        string last_error_step
        number retry_count
        string resume_data_path
        datetime created_at
        datetime updated_at
        datetime started_at
        datetime completed_at
    }
    
    CHUNK {
        string id PK
        string novel_id FK
        string job_id FK
        number chunk_index
        string content_path
        number start_position
        number end_position
        number word_count
        datetime created_at
    }
```

### Data Model Definitions

```typescript
// TypeScript インターフェース定義（新スキーマ対応）

// Core Models
interface Novel {
  id: string;                    // UUID
  title?: string;                // 小説タイトル
  author?: string;               // 著者名
  originalTextPath: string;      // ストレージ上のファイルパス
  textLength: number;            // 総文字数
  language: string;              // 言語コード
  metadataPath?: string;         // メタデータJSONパス
  createdAt: Date;
  updatedAt: Date;
}

interface Job {
  id: string;
  novelId: string;
  jobName?: string;              // ジョブ名
  status: JobStatus;             // pending/processing/completed/failed/paused
  currentStep: JobStep;          // initialized/split/analyze/episode/layout/render/complete
  splitCompleted: boolean;
  analyzeCompleted: boolean;
  episodeCompleted: boolean;
  layoutCompleted: boolean;
  renderCompleted: boolean;
  chunksDirPath?: string;        // チャンクファイルディレクトリ
  analysesDirPath?: string;      // 分析結果ディレクトリ
  episodesDataPath?: string;     // エピソード情報JSON
  layoutsDirPath?: string;       // レイアウトディレクトリ
  rendersDirPath?: string;       // 描画結果ディレクトリ
  totalChunks: number;
  processedChunks: number;
  totalEpisodes: number;
  processedEpisodes: number;
  totalPages: number;
  renderedPages: number;
  lastError?: string;
  lastErrorStep?: string;
  retryCount: number;
  resumeDataPath?: string;       // 再開用データJSON
  createdAt: Date;
  updatedAt: Date;
  startedAt?: Date;
  completedAt?: Date;
}

interface Chunk {
  id: string;
  novelId: string;
  jobId: string;
  chunkIndex: number;
  contentPath: string;           // ストレージ上のファイルパス
  startPosition: number;         // テキスト内の開始位置
  endPosition: number;           // テキスト内の終了位置
  wordCount?: number;
  createdAt: Date;
}

// Status Tracking Models
interface JobStepHistory {
  id: string;
  jobId: string;
  stepName: JobStep;
  status: 'started' | 'completed' | 'failed' | 'skipped';
  startedAt: Date;
  completedAt?: Date;
  durationSeconds?: number;
  inputPath?: string;
  outputPath?: string;
  errorMessage?: string;
  metadata?: any;
  createdAt: Date;
}

interface ChunkAnalysisStatus {
  id: string;
  jobId: string;
  chunkIndex: number;
  isAnalyzed: boolean;
  analysisPath?: string;         // 分析結果ファイルパス
  analyzedAt?: Date;
  retryCount: number;
  lastError?: string;
  createdAt: Date;
}

interface Episode {
  id: string;
  novelId: string;
  jobId: string;
  episodeNumber: number;
  title?: string;
  summary?: string;
  startChunk: number;
  startCharIndex: number;
  endChunk: number;
  endCharIndex: number;
  estimatedPages: number;
  confidence: number;
  createdAt: Date;
}

interface LayoutStatus {
  id: string;
  jobId: string;
  episodeNumber: number;
  isGenerated: boolean;
  layoutPath?: string;           // レイアウトYAMLパス
  totalPages?: number;
  totalPanels?: number;
  generatedAt?: Date;
  retryCount: number;
  lastError?: string;
  createdAt: Date;
}

interface RenderStatus {
  id: string;
  jobId: string;
  episodeNumber: number;
  pageNumber: number;
  isRendered: boolean;
  imagePath?: string;            // 画像ファイルパス
  thumbnailPath?: string;
  width?: number;
  height?: number;
  fileSize?: number;
  renderedAt?: Date;
  retryCount: number;
  lastError?: string;
  createdAt: Date;
}

interface Output {
  id: string;
  novelId: string;
  jobId: string;
  outputType: 'pdf' | 'cbz' | 'images_zip' | 'epub';
  outputPath: string;
  fileSize?: number;
  pageCount?: number;
  metadataPath?: string;
  createdAt: Date;
}

interface StorageFile {
  id: string;
  novelId: string;
  jobId?: string;
  filePath: string;
  fileCategory: 'original' | 'chunk' | 'analysis' | 'episode' | 'layout' | 'render' | 'output' | 'metadata';
  fileType: 'txt' | 'json' | 'yaml' | 'png' | 'jpg' | 'pdf' | 'zip';
  fileSize?: number;
  createdAt: Date;
}

// 5要素の詳細（R2に保存）
interface TextAnalysis {
  chunkId?: string;              // ChunkAnalysisの場合
  characters: Character[];       // 登場人物
  scenes: Scene[];              // シーン
  dialogues: Dialogue[];        // 対話
  highlights: Highlight[];      // ハイライト
  situations: Situation[];      // 状況
  metadata?: {
    chunkIndex?: number;
    totalChunks?: number;
    previousChunkText?: string;
    nextChunkText?: string;
  };
  createdAt: Date;
  updatedAt: Date;
}

// キャッシュされた分析結果
interface CachedAnalysisResult {
  result: TextAnalysis;
  timestamp: number;
  ttl?: number;
}

interface Character {
  id: string;
  name: string;
  description: string;
  firstAppearance: number;
}

interface Scene {
  id: string;
  location: string;
  time?: string;
  description: string;
  startIndex: number;
  endIndex: number;
}

interface Dialogue {
  id: string;
  speakerId: string;
  text: string;
  emotion?: string;
  index: number;
}

interface Highlight {
  id: string;
  type: 'climax' | 'turning_point' | 'emotional_peak' | 'action_sequence';
  description: string;
  importance: number;  // 1-5
  startIndex: number;
  endIndex: number;
}

interface Situation {
  id: string;
  description: string;
  index: number;
}
```

### Database Schema

```sql
-- Cloudflare D1 スキーマ (SQLite)
-- 大容量データはR2に保存し、D1には参照のみ保存

CREATE TABLE novels (
  id TEXT PRIMARY KEY,  -- UUID
  original_text_file TEXT NOT NULL,  -- R2パス
  total_length INTEGER NOT NULL,
  total_chunks INTEGER NOT NULL DEFAULT 0,
  chunk_size INTEGER NOT NULL,  -- configで与えられた値
  overlap_size INTEGER NOT NULL,  -- configで与えられた値
  total_episodes INTEGER,  -- 分析後に更新
  total_pages INTEGER,  -- レイアウト生成後に更新
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE jobs (
  id TEXT PRIMARY KEY,
  novel_id TEXT NOT NULL,
  type TEXT NOT NULL,  -- 'text_analysis', 'image_generation' など
  status TEXT NOT NULL CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
  progress REAL DEFAULT 0,
  result TEXT,  -- 処理結果JSON
  error TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (novel_id) REFERENCES novels(id) ON DELETE CASCADE
);

CREATE TABLE chunks (
  id TEXT PRIMARY KEY,
  novel_id TEXT NOT NULL,
  chunk_index INTEGER NOT NULL,
  start_position INTEGER NOT NULL,  -- テキスト内の開始位置
  end_position INTEGER NOT NULL,    -- テキスト内の終了位置
  chunk_size INTEGER NOT NULL,      -- チャンクサイズ設定値
  overlap_size INTEGER NOT NULL,    -- オーバーラップサイズ設定値
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (novel_id) REFERENCES novels(id) ON DELETE CASCADE,
  UNIQUE(novel_id, chunk_index)
);

CREATE TABLE chunk_analyses (
  id TEXT PRIMARY KEY,
  chunk_id TEXT NOT NULL,
  analysis_file TEXT NOT NULL,  -- R2パス
  processed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  character_count INTEGER DEFAULT 0,
  scene_count INTEGER DEFAULT 0,
  dialogue_count INTEGER DEFAULT 0,
  highlight_count INTEGER DEFAULT 0,
  situation_count INTEGER DEFAULT 0,
  FOREIGN KEY (chunk_id) REFERENCES chunks(id) ON DELETE CASCADE
);

CREATE TABLE novel_analyses (
  id TEXT PRIMARY KEY,
  novel_id TEXT NOT NULL,
  analysis_file TEXT NOT NULL,  -- R2パス
  total_characters INTEGER DEFAULT 0,
  total_scenes INTEGER DEFAULT 0,
  total_dialogues INTEGER DEFAULT 0,
  total_highlights INTEGER DEFAULT 0,
  total_situations INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (novel_id) REFERENCES novels(id) ON DELETE CASCADE
);

CREATE TABLE episodes (
  id TEXT PRIMARY KEY,
  novel_id TEXT NOT NULL,
  episode_number INTEGER NOT NULL,
  title TEXT NOT NULL,
  chapters TEXT,  -- JSON配列
  climax_point INTEGER,
  start_index INTEGER NOT NULL,
  end_index INTEGER NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (novel_id) REFERENCES novels(id) ON DELETE CASCADE,
  UNIQUE(novel_id, episode_number)
);

CREATE TABLE manga_pages (
  id TEXT PRIMARY KEY,
  episode_id TEXT NOT NULL,
  page_number INTEGER NOT NULL,
  layout_file TEXT NOT NULL,  -- R2パス (YAML)
  preview_image_file TEXT,  -- R2パス
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (episode_id) REFERENCES episodes(id) ON DELETE CASCADE,
  UNIQUE(episode_id, page_number)
);

CREATE TABLE panels (
  id TEXT PRIMARY KEY,
  page_id TEXT NOT NULL,
  position_x INTEGER NOT NULL,
  position_y INTEGER NOT NULL,
  width INTEGER NOT NULL,
  height INTEGER NOT NULL,
  panel_type TEXT NOT NULL CHECK (panel_type IN ('normal', 'action', 'emphasis')),
  content TEXT,  -- JSON（sceneId, dialogueIds, situationId）
  reading_order INTEGER NOT NULL,
  FOREIGN KEY (page_id) REFERENCES manga_pages(id) ON DELETE CASCADE
);

-- インデックス
CREATE INDEX idx_jobs_novel_id ON jobs(novel_id);
CREATE INDEX idx_chunks_novel_id ON chunks(novel_id);
CREATE INDEX idx_episodes_novel_id ON episodes(novel_id);
CREATE INDEX idx_manga_pages_episode_id ON manga_pages(episode_id);
CREATE INDEX idx_panels_page_id ON panels(page_id);
```

### R2 Storage Structure

```
novels/
└── {novelId}.json                     # 元の小説全文（メタデータ付き）
chunks/
└── {chunkId}.json                     # チャンクテキスト（メタデータ付き）
analysis/
└── {novelId}/
    ├── chunk_{index}.json             # チャンク毎の5要素解析結果
    └── integrated.json                # 統合された解析結果
episodes/
└── {novelId}/
    └── {episodeNumber}/
        └── pages/
            └── {pageNumber}/
                ├── layout.yaml         # レイアウト定義
                └── preview.png         # プレビュー画像
```

### Migration Strategy

- Wranglerのマイグレーション機能を使用 (D1)
- 後方互換性のためJSONフィールドでスキーマ進化に対応
- バージョン管理されたマイグレーションファイル
- インデックス戦略：project_id、episode_id、page_numberに複合インデックス

## Error Handling

### エラー処理戦略

```typescript
// カスタムエラークラス
class NovelToMangaError extends Error {
  constructor(
    message: string,
    public code: string,
    public statusCode: number,
    public details?: any
  ) {
    super(message);
  }
}

// エラーハンドリングミドルウェア
export function errorHandler(error: unknown): Response {
  if (error instanceof NovelToMangaError) {
    return NextResponse.json(
      { error: error.message, code: error.code, details: error.details },
      { status: error.statusCode }
    );
  }
  // デフォルトエラー処理
  return NextResponse.json(
    { error: 'Internal Server Error' },
    { status: 500 }
  );
}
```

### エラーシナリオ

- テキスト解析失敗: 適切なフォールバックとユーザー通知
- Canvas API処理エラー: デフォルトレイアウトへのフォールバック
- レイアウト生成エラー: デフォルトレイアウトへのフォールバック
- ストレージエラー: ローカルキャッシュとリトライ

## Configuration Management

### 設定ファイル構造

```typescript
// src/config/app.config.ts
export const appConfig = {
  // チャンク分割設定
  chunks: {
    defaultChunkSize: 5000,        // 【ここを設定】
    defaultOverlapSize: 500,       // 【ここを設定】
    minChunkSize: 1000,
    maxChunkSize: 10000,
  },
  
  // LLMプロバイダー設定
  llm: {
    defaultProvider: 'openrouter', // 【ここを設定】
    providers: {
      openai: { model: 'gpt-4-turbo', temperature: 0.7 },
      gemini: { model: 'gemini-1.5-pro-002', temperature: 0.7 },
      groq: { model: 'compound-beta', maxTokens: 8192 },
      local: { model: 'llama3.1:70b', baseUrl: 'http://localhost:11434' },
      openrouter: { model: 'nvidia/llama-3.1-nemotron-70b-instruct', temperature: 0.7 },
    },
  },
  
  // 処理設定
  processing: {
    maxConcurrentChunks: 3,        // 【ここを設定】
    retryAttempts: 3,
    retryDelay: 1000,
    cacheEnabled: true,
    cacheTTL: 86400000, // 24時間
  },
};
```

### 設定の優先順位

1. **ハードコード値** (app.config.ts)
2. **環境変数オーバーライド** (process.env)
3. **ランタイム設定** (APIパラメータ)

### 環境変数

```bash
# .env - シークレットのみ
OPENAI_API_KEY=sk-...
GEMINI_API_KEY=...
GROQ_API_KEY=gsk_...
OPENROUTER_API_KEY=sk-or-...

# オーバーライド用環境変数
APP_LLM_DEFAULT_PROVIDER=openrouter
APP_CHUNKS_DEFAULT_SIZE=7000
APP_PROCESSING_MAX_CONCURRENT=5
```

## Cloudflare Bindings

### 型定義

```typescript
// src/types/cloudflare.d.ts
declare global {
  // R2 Bucket
  const NOVEL_STORAGE: R2Bucket;
  
  // D1 Database
  const DB: D1Database;
  
  // KV Namespace
  const CACHE: KVNamespace;
  
  // Environment Variables
  interface CloudflareEnv {
    NOVEL_STORAGE: R2Bucket;
    DB: D1Database;
    CACHE: KVNamespace;
    OPENAI_API_KEY?: string;
    GEMINI_API_KEY?: string;
    GROQ_API_KEY?: string;
    OPENROUTER_API_KEY?: string;
  }
}

export interface R2Bucket {
  put(key: string, value: ReadableStream | ArrayBuffer | string, options?: R2PutOptions): Promise<R2Object | null>;
  get(key: string, options?: R2GetOptions): Promise<R2ObjectBody | null>;
  delete(key: string): Promise<void>;
  list(options?: R2ListOptions): Promise<R2Objects>;
}

export interface D1Database {
  prepare(query: string): D1PreparedStatement;
  batch<T>(statements: D1PreparedStatement[]): Promise<D1Result<T>[]>;
  exec<T>(query: string): Promise<D1ExecResult>;
}
```

### wrangler.toml設定

```toml
name = "novel2manga"
compatibility_date = "2024-01-01"

[vars]
NEXT_PUBLIC_APP_NAME = "Novel2Manga"

[[d1_databases]]
binding = "DB"
database_name = "novel2manga"
database_id = "your-database-id"

[[r2_buckets]]
binding = "NOVEL_STORAGE"
bucket_name = "novel2manga-storage"

[[kv_namespaces]]
binding = "CACHE"
id = "your-kv-namespace-id"
```

## Security Considerations

### Authentication & Authorization

```mermaid
sequenceDiagram
    participant User
    participant NextAuth
    participant API
    participant DB

    User->>NextAuth: ログイン
    NextAuth->>DB: 認証情報確認
    DB-->>NextAuth: ユーザー情報
    NextAuth-->>User: JWTトークン
    User->>API: APIリクエスト + JWT
    API->>API: トークン検証
    API->>DB: 権限確認
    API-->>User: レスポンス
```

### Data Protection

- 入力検証: Zodによるスキーマバリデーション
- XSS対策: React自動エスケープ + CSP設定
- SQLインジェクション対策: Prisma ORM使用
- ファイルアップロード: 形式とサイズの厳格な検証
- API レート制限: Upstashによるレート制限

### Security Best Practices

- OWASP Top 10対策実装
- 環境変数による機密情報管理
- HTTPS強制とセキュアクッキー
- CORSポリシーの適切な設定
- 定期的な依存関係の脆弱性スキャン

## Performance & Scalability

### Performance Targets

| Metric | Target | Measurement |
|--------|--------|-------------|
| 初期表示時間 (FCP) | < 1.5秒 | Lighthouse |
| API レスポンス (p95) | < 200ms | APIエンドポイント |
| 絵コンテ生成時間 | < 5秒/ページ | Canvas API測定 |
| テキスト解析 | < 5秒/10,000文字 | 処理時間測定 |
| 同時ユーザー数 | > 1,000 | 負荷テスト |

### Caching Strategy

- **ブラウザキャッシュ**: Next.js自動最適化、静的アセット
- **CDN**: Cloudflare経由での画像配信
- **アプリケーションキャッシュ**: 2層構造
  - **L1 - MemoryCache**: インメモリキャッシュ、高速アクセス、TTL管理
  - **L2 - Cloudflare KV**: 永続化キャッシュ、グローバル分散、大容量対応
  
  ```typescript
  // キャッシュ実装例
  async function getCachedData<T>(key: string): Promise<T | null> {
    // L1: MemoryCacheチェック
    const memCached = memoryCache.get<T>(key);
    if (memCached) return memCached;
    
    // L2: Cloudflare KVチェック
    const kvCached = await CACHE.get(key, 'json');
    if (kvCached) {
      memoryCache.set(key, kvCached, 3600); // 1時間メモリキャッシュ
      return kvCached as T;
    }
    
    return null;
  }
  ```
- **データベースキャッシュ**: D1クエリ結果キャッシュ
- **Edge キャッシュ**: Cloudflare Tiered Cacheによる多階層キャッシュ
- **キャッシュ戦略**:
  - チャンク分析結果: 24時間TTL
  - 統合分析結果: 7日間TTL
  - LRU eviction policy for MemoryCache

### Scalability Approach

- Cloudflare Workersによるグローバルエッジスケーリング
- Mastraワークフローの並列処理
- 大規模テキスト処理のキューシステム実装（Cloudflare Queues）
- D1の自動レプリケーション機能
- Cloudflareの自動スケーリングとDDoS保護

## Testing Strategy

### Test Coverage Requirements

- **単体テスト**: ≥85% カバレッジ（ビジネスロジック）
- **統合テスト**: 全APIエンドポイントとMastra統合
- **E2Eテスト**: 主要ユーザーフロー
- **パフォーマンステスト**: 想定ピーク時の2倍負荷

### Testing Approach

1. **単体テスト (Vitest)**
   ```typescript
   describe('TextAnalyzer', () => {
     it('should extract 5 elements from novel text', async () => {
       const result = await analyzer.analyze(sampleText);
       expect(result.characters).toHaveLength(3);
       expect(result.scenes).toBeDefined();
     });
   });
   ```

2. **統合テスト**
   - Mastra エージェントのモック
   - API契約テスト
   - データベース統合テスト

3. **E2Eテスト (Playwright)**
   - テキスト投稿から絵コンテ生成フロー
   - レイアウト編集機能の動作確認
   - エクスポート機能テスト

4. **パフォーマンステスト**
   - k6による負荷テスト
   - Canvas API処理のストレステスト
   - メモリリーク検出

### CI/CD Pipeline

```mermaid
graph LR
    A[コードプッシュ] --> B[Lint & Format]
    B --> C[型チェック]
    C --> D[単体テスト]
    D --> E[統合テスト]
    E --> F[OpenNextビルド]
    F --> G[E2Eテスト]
    G --> H[Cloudflareプレビュー]
    H --> I[パフォーマンステスト]
    I --> J[Cloudflare Workers本番デプロイ]
```