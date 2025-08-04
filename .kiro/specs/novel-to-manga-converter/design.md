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
- **Database**: Cloudflare D1 (SQLite ベース) / SQLite (開発環境)
- **Cache**: Cloudflare KV (APIレスポンスキャッシュ)
- **File Storage**: Cloudflare R2 (プロダクション) / Local Storage (開発)
- **LLM Providers**: OpenRouter (primary), Gemini, Claude (フォールバックチェーン)
- **LLM Factory**: 動的プロバイダー選択とフォールバック機能実装済み
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
- **LLMフォールバックチェーン**: openrouter → gemini → claude の自動フォールバック、可用性向上
- **StorageFactory Pattern**: 環境別ストレージ抽象化、開発・本番環境の自動切り替え

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
  provider: 'openai' | 'gemini' | 'groq' | 'local' | 'openrouter' | 'claude';
  apiKey?: string;
  model: string;
  temperature?: number;
  maxTokens?: number;
  timeout?: number;
}

// フォールバックチェーン機能
class LLMFactory {
  async getTextAnalysisLLM(): Promise<LLMInstance> // テキスト分析用LLM取得
  async getNarrativeAnalysisLLM(): Promise<LLMInstance> // 物語分析用LLM取得
  async getProviderWithFallback(preferredProvider?: string): Promise<LLMInstance> // フォールバック機能付き
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
| POST | /api/novel | 小説登録（テキスト + メタデータ） | Implemented | 200, 400, 413, 500 |
| GET | /api/novel/storage/:id | 小説テキスト取得 | Implemented | 200, 404, 500 |
| POST | /api/novel/db | 小説メタデータDB保存 | Implemented | 200, 400, 500 |
| GET | /api/novel/[uuid]/chunks | チャンク分割・取得 | Implemented | 200, 404, 500 |
| POST | /api/analyze | 統合分析（チャンク分割→分析→エピソード分析） | Implemented | 200, 400, 500 |
| POST | /api/analyze/chunk | チャンク単位の5要素分析 | Implemented | 200, 400, 500 |
| POST | /api/analyze/episode | エピソード境界分析 | Implemented | 200, 400, 500 |
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
// TypeScript 型定義（Drizzle自動生成）
// Drizzleが自動的に型を生成するため、手動定義は不要

// Core Models - Drizzle $inferSelect/$inferInsert使用
type Novel = typeof novels.$inferSelect    // 自動生成された型
type NewNovel = typeof novels.$inferInsert // Insert用の型

// 実際のインターフェース構造（参考）：
/*
Novel {
  id: string;                    // UUID
  title: string | null;          // 小説タイトル（Drizzleはnull許可）
  author: string | null;         // 著者名
  originalTextPath: string;      // ストレージ上のファイルパス
  textLength: number;            // 総文字数
  language: string | null;       // 言語コード
  metadataPath: string | null;   // メタデータJSONパス
  createdAt: string | null;      // ISO文字列形式
  updatedAt: string | null;      // ISO文字列形式
}
*/

type Job = typeof jobs.$inferSelect        // Drizzle自動生成
type NewJob = typeof jobs.$inferInsert     // Insert用

// 実際の構造（参考）：
/*
Job {
  id: string;
  novelId: string;
  jobName: string | null;              // ジョブ名
  status: string;                      // 'pending'|'processing'|'completed'|'failed'|'paused'
  currentStep: string;                 // 'initialized'|'split'|'analyze'|'episode'|'layout'|'render'|'complete'
  splitCompleted: boolean | null;      // Drizzleのbooleanモード
  analyzeCompleted: boolean | null;
  episodeCompleted: boolean | null;
  layoutCompleted: boolean | null;
  renderCompleted: boolean | null;
  chunksDirPath: string | null;        // チャンクファイルディレクトリ
  analysesDirPath: string | null;      // 分析結果ディレクトリ
  episodesDataPath: string | null;     // エピソード情報JSON
  layoutsDirPath: string | null;       // レイアウトディレクトリ
  rendersDirPath: string | null;       // 描画結果ディレクトリ
  totalChunks: number | null;
  processedChunks: number | null;
  totalEpisodes: number | null;
  processedEpisodes: number | null;
  totalPages: number | null;
  renderedPages: number | null;
  lastError: string | null;
  lastErrorStep: string | null;
  retryCount: number | null;
  resumeDataPath: string | null;       // 再開用データJSON
  createdAt: string | null;            // ISO文字列
  updatedAt: string | null;
  startedAt: string | null;
  completedAt: string | null;
}
*/

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

type StorageFile = typeof storageFiles.$inferSelect
type NewStorageFile = typeof storageFiles.$inferInsert

// 実際の構造（参考）：
/*
StorageFile {
  id: string;
  novelId: string;
  jobId: string | null;           // optional reference
  filePath: string;               // unique constraint
  fileCategory: string;           // 'original'|'chunk'|'analysis'|'episode'|'layout'|'render'|'output'|'metadata'
  fileType: string;               // 'txt'|'json'|'yaml'|'png'|'jpg'|'pdf'|'zip'
  mimeType: string | null;        // 追加: 実際のMIMEタイプ (例: 'image/png')
  fileSize: number | null;
  createdAt: string | null;       // ISO文字列
}
*/

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

### Database Schema (Drizzle ORM)

現在のデータベーススキーマはDrizzle ORMを使用して定義されています。

```typescript
// src/db/schema.ts - Drizzle Schema Definition

// 小説テーブル（最上位エンティティ）
export const novels = sqliteTable(
  'novels',
  {
    id: text('id').primaryKey(),
    title: text('title'),
    author: text('author'),
    originalTextPath: text('original_text_path').notNull(), // ストレージ上の小説ファイルパス
    textLength: integer('text_length').notNull(),
    language: text('language').default('ja'),
    metadataPath: text('metadata_path'), // ストレージ上のメタデータJSONファイルパス
    createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text('updated_at').default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => ({
    createdAtIdx: index('idx_novels_created_at').on(table.createdAt),
  }),
)

// 変換ジョブテーブル（小説に対する変換処理）
export const jobs = sqliteTable(
  'jobs',
  {
    id: text('id').primaryKey(),
    novelId: text('novel_id')
      .notNull()
      .references(() => novels.id, { onDelete: 'cascade' }),
    jobName: text('job_name'),

    // ステータス管理
    status: text('status').notNull().default('pending'), // pending/processing/completed/failed/paused
    currentStep: text('current_step').notNull().default('initialized'), // initialized/split/analyze/episode/layout/render/complete

    // 各ステップの完了状態
    splitCompleted: integer('split_completed', { mode: 'boolean' }).default(false),
    analyzeCompleted: integer('analyze_completed', { mode: 'boolean' }).default(false),
    episodeCompleted: integer('episode_completed', { mode: 'boolean' }).default(false),
    layoutCompleted: integer('layout_completed', { mode: 'boolean' }).default(false),
    renderCompleted: integer('render_completed', { mode: 'boolean' }).default(false),

    // 各ステップの成果物パス（ディレクトリ）
    chunksDirPath: text('chunks_dir_path'),
    analysesDirPath: text('analyses_dir_path'),
    episodesDataPath: text('episodes_data_path'),
    layoutsDirPath: text('layouts_dir_path'),
    rendersDirPath: text('renders_dir_path'),

    // 進捗詳細
    totalChunks: integer('total_chunks').default(0),
    processedChunks: integer('processed_chunks').default(0),
    totalEpisodes: integer('total_episodes').default(0),
    processedEpisodes: integer('processed_episodes').default(0),
    totalPages: integer('total_pages').default(0),
    renderedPages: integer('rendered_pages').default(0),

    // エラー管理
    lastError: text('last_error'),
    lastErrorStep: text('last_error_step'),
    retryCount: integer('retry_count').default(0),

    // 再開用の状態保存
    resumeDataPath: text('resume_data_path'),

    // タイムスタンプ
    createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text('updated_at').default(sql`CURRENT_TIMESTAMP`),
    startedAt: text('started_at'),
    completedAt: text('completed_at'),
  },
  (table) => ({
    novelIdIdx: index('idx_jobs_novel_id').on(table.novelId),
    statusIdx: index('idx_jobs_status').on(table.status),
    novelIdStatusIdx: index('idx_jobs_novel_id_status').on(table.novelId, table.status),
    currentStepIdx: index('idx_jobs_current_step').on(table.currentStep),
  }),
)

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

// インデックスはDrizzleテーブル定義内で管理：
// - novels: createdAtIdx
// - jobs: novelIdIdx, statusIdx, novelIdStatusIdx, currentStepIdx  
// - jobStepHistory: jobIdIdx
// - chunks: novelIdIdx, jobIdIdx, uniqueJobChunk
// - chunkAnalysisStatus: jobIdIdx, uniqueJobChunkAnalysis
// - episodes: novelIdIdx, jobIdIdx, uniqueJobEpisode
// - layoutStatus: jobIdIdx, uniqueJobEpisodeLayout
// - renderStatus: jobIdIdx, uniqueJobEpisodePage
// - outputs: novelIdIdx, jobIdIdx
// - storageFiles: novelIdIdx

// 型エクスポート（Drizzle自動生成）
export type Novel = typeof novels.$inferSelect
export type NewNovel = typeof novels.$inferInsert
export type Job = typeof jobs.$inferSelect
export type NewJob = typeof jobs.$inferInsert
export type Episode = typeof episodes.$inferSelect
export type NewEpisode = typeof episodes.$inferInsert
// その他すべてのテーブル型も同様に自動生成

// データベースビューはDrizzleでは直接サポートされていないため、
// 必要に応じてクエリビルダーで複雑な集計を実装

// 小説の変換状況取得例：
/*
const novelStatusQuery = db
  .select({
    id: novels.id,
    title: novels.title,
    author: novels.author,
    totalJobs: count(jobs.id),
    completedJobs: count(case(when(eq(jobs.status, 'completed'), jobs.id), else(null))),
    activeJobs: count(case(when(eq(jobs.status, 'processing'), jobs.id), else(null))),
    totalOutputs: count(outputs.id),
    createdAt: novels.createdAt,
    lastJobCreatedAt: max(jobs.createdAt),
  })
  .from(novels)
  .leftJoin(jobs, eq(novels.id, jobs.novelId))
  .leftJoin(outputs, eq(novels.id, outputs.novelId))
  .groupBy(novels.id);
*/

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
```

### R2 Storage Structure

現在実装されている統合ストレージ構造：

```
novels/
└── {novelId}/
    ├── original/
    │   ├── text.txt                    # 元の小説テキスト
    │   └── metadata.json              # 小説のメタデータ
    │
    └── jobs/
        └── {jobId}/
            ├── chunks/
            │   ├── chunk_001.txt       # チャンクテキスト
            │   ├── chunk_002.txt
            │   └── ...
            │
            ├── analyses/
            │   ├── chunk_001.json      # チャンク分析結果
            │   ├── chunk_002.json
            │   └── ...
            │
            ├── episodes/
            │   ├── episodes.json       # エピソード一覧
            │   └── episode_{n}/
            │       ├── layout.yaml     # レイアウト定義
            │       └── metadata.json   # レイアウトメタデータ
            │
            ├── renders/
            │   ├── config.json         # 描画設定
            │   ├── episode_{n}/
            │   │   ├── page_001.png    # 描画済みページ
            │   │   ├── page_002.png
            │   │   └── ...
            │   └── thumbnails/
            │       └── episode_{n}/
            │           ├── page_001_thumb.png
            │           └── ...
            │
            ├── outputs/
            │   ├── manga.pdf           # 最終成果物
            │   ├── manga.cbz
            │   └── metadata.json       # 成果物メタデータ
            │
            └── state/
                ├── job_progress.json   # ジョブ進捗状態
                └── resume_data.json    # 再開用データ
```

### Migration Strategy (Drizzle)

- **Drizzle Kit**: スキーマから自動マイグレーション生成
- **環境別マイグレーション**: 開発環境（SQLite）、本番環境（D1）
- **型安全性**: TypeScriptによるスキーマとクエリの型チェック
- **バージョン管理**: `drizzle/migrations/`ディレクトリで管理
- **マイグレーションコマンド**:
  ```bash
  # スキーマ変更からマイグレーション生成
  npx drizzle-kit generate
  
  # 開発環境適用
  npx drizzle-kit migrate
  
  # 本番環境適用（D1）
  npx wrangler d1 migrations apply novel2manga
  ```
- **インデックス戦略**: Drizzleテーブル定義内で複合インデックス管理

## Storage and Database Abstraction

### ストレージ抽象化設計（2025-08-01追加）

```typescript
// Storage Interface
interface Storage {
  put(key: string, value: string | Buffer, metadata?: Record<string, string>): Promise<void>;
  get(key: string): Promise<{ text: string; metadata?: Record<string, string> } | null>;
  delete(key: string): Promise<void>;
  exists(key: string): Promise<boolean>;
}

// Drizzle Database Connection
interface DrizzleDatabase {
  select(): SelectQueryBuilder;
  insert(table: SQLiteTable): InsertQueryBuilder;
  update(table: SQLiteTable): UpdateQueryBuilder;
  delete(table: SQLiteTable): DeleteQueryBuilder;
  batch(queries: any[]): Promise<any[]>;
}

// Environment-specific Implementations
class LocalFileStorage implements Storage { /* ... */ }
class R2Storage implements Storage { /* ... */ }

// Drizzle統合データベース接続
class DatabaseService {
  private db: DrizzleDatabase
  
  constructor() {
    if (process.env.NODE_ENV === 'development') {
      // SQLite + Drizzle
      const sqliteDb = new Database(dbConfig.path)
      this.db = drizzle(sqliteDb, { schema })
    } else {
      // D1 + Drizzle
      this.db = drizzle(globalThis.DB, { schema })
    }
  }
}

// Storage Factory
class StorageFactory {
  static async getNovelStorage(): Promise<Storage>;
  static async getChunkStorage(): Promise<Storage>;
  static async getAnalysisStorage(): Promise<Storage>;
  static async getLayoutStorage(): Promise<Storage>;
  static async getRenderStorage(): Promise<Storage>;
  static async getDatabase(): Promise<DatabaseAdapter>;
}
```

## Error Handling

### エラー処理戦略（2025-08-01更新）

```typescript
// APIエラークラス
export class ApiError extends Error {
  constructor(
    message: string,
    public statusCode: number,
    public code?: string,
    public details?: any
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

// エラーレスポンス生成
export function createErrorResponse(
  error: unknown,
  defaultMessage: string = 'Internal server error'
): Response {
  if (error instanceof ApiError) {
    return NextResponse.json(
      {
        error: error.message,
        code: error.code,
        details: error.details
      },
      { status: error.statusCode }
    );
  }
  
  const message = error instanceof Error ? error.message : defaultMessage;
  return NextResponse.json(
    { error: message },
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
  
  // LLMフォールバックチェーン設定
  llmFallbackChain: ['openrouter', 'gemini', 'claude'], // 【ここを設定】
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

## 実装状況更新（2025-08-04）

### 完了した主要機能

1. **LLMフォールバックチェーン実装**
   - app.config.tsでの一元管理（openrouter → gemini → claude）
   - LLMFactoryクラスによる動的プロバイダー選択
   - 全エージェント（chunk-analyzer, chunk-bundle-analyzer, narrative-arc-analyzer）のフォールバック対応
   - OpenRouterモデル更新（horizon-alpha → horizon-beta）

2. **エンドツーエンド分析フロー完成**
   - 小説登録 → チャンク分割 → 分析 → エピソード分析の完全統合
   - jobIdベースのストレージ整合性確保
   - 統合テストによる動作確認済み

3. **ストレージ・データベース抽象化**
   - StorageFactoryパターンによる環境別ストレージ切り替え
   - DatabaseServiceによるスキーマ整合性確保
   - LocalFileStorage / R2Storage, SQLiteAdapter / D1Adapter実装

4. **統合API設計**
   - /api/novel: 小説登録API
   - /api/analyze: 統合分析API（チャンク分割→分析→エピソード分析）
   - /api/analyze/episode: エピソード境界分析API
   - /api/jobs/[jobId]/status: ジョブステータス追跡API

### 次期実装予定

1. **Canvas描画とマンガレンダリング** (優先度: 高)
   - MangaPageRenderer実装
   - /api/renderエンドポイント実装
   - PanelLayoutEngine実装
   - SpeechBubblePlacer実装

2. **エクスポート機能** (優先度: 中)
   - PDF/CBZ/画像zip出力機能
   - 共有リンク生成機能

### アーキテクチャ改善点

- 設計書とデータベーススキーマの完全整合性確保
- ストレージ構造の統一（database/storage-structure.mdとの整合性）
- LLMプロバイダー設定の柔軟性向上

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