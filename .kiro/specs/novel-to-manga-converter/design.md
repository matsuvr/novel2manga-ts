# Technical Design

## Overview

本設計書は、小説テキストをマンガ形式に自動変換するWebアプリケーションの技術実装について定義します。Mastra AIフレームワークをベースに、TypeScriptとNext.js 14を使用して、長文テキストの解析、5要素の抽出（登場人物・シーン・対話・ハイライト・状況）、連載エピソード構成、マンガレイアウト生成を実現します。

## Requirements Mapping

### Design Component Traceability

各設計コンポーネントが対応する要件：

- **テキスト解析エンジン** → REQ-1: テキスト入力と解析（チャンク分割、会話/地の文識別）
- **5要素抽出AI** → REQ-1.4: チャンク毎に会話部分、地の文、シーン転換の自動識別
- **エピソード構成エンジン** → REQ-3: 連載マンガとしてのエピソード分割
- **マンガレイアウト設計エンジン** → REQ-3: YAMLで漫画レイアウトを記述する
- **マンガレイアウト生成エンジン** → YAMLからCanvas APIで、枠と状況説明とセリフによる絵コンテの描画（マンガそのものの絵作りは行わない）
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
    subgraph "Frontend Layer (Next.js 14)"
        A[Next.js App Router] --> B[Server Components]
        A --> C[Client Components]
        C --> D[Interactive Editor]
    end

    subgraph "AI Processing Layer"
        E[Mastra Framework] --> F[Text Analysis Agent]
        E --> G[Image Generation Agent]
        E --> H[Layout Generation Agent]
        F --> I[5-Element Extractor]
    end

    subgraph "Business Logic Layer"
        J[Episode Composer] --> K[Panel Layout Engine]
        K --> L[Speech Bubble Placer]
        M[Export Service] --> N[Format Converters]
    end

    subgraph "Data Layer"
        O[Mastra LibSQL/D1] --> P[Project Storage]
        O --> Q[Cache Layer - Cloudflare KV]
        R[Cloudflare R2] --> S[Image Storage]
    end

    B --> E
    C --> J
    E --> J
    J --> O
    G --> R
    M --> O
    M --> R
```

### Technology Stack

調査結果に基づく技術選定：

- **Frontend**: Next.js 15.4.4 (App Router) + TypeScript 5.8.3 + Tailwind CSS 4.1.11
- **AI Framework**: Mastra 0.10.15 (TypeScript agent framework)
- **レイアウト画像生成**: Canvas API
- **Backend**: Next.js API Routes + Mastra Workflows
- **Database**: Mastra LibSQL 0.11.2 (Edge-compatible SQLite)
- **Cache**: Cloudflare KV (Edge caching)
- **File Storage**: Cloudflare R2 (画像保存)
- **Authentication**: NextAuth.js v5
- **Testing**: Vitest + Playwright + React Testing Library
- **Deployment**: Cloudflare Workers (OpenNext adapter)

### Architecture Decision Rationale

- **Next.js 15 App Router**: Server Componentsによる高速レンダリング、RSCによるクライアントJSの削減、Cloudflare Workers対応
- **Mastra Framework**: TypeScript完全対応、エージェント型アーキテクチャ、統合済みのLLM/画像生成API連携
- **Mastra LibSQL**: Edge環境対応のSQLite、Cloudflare D1互換、TypeScript型安全性
- **Cloudflare R2**: S3互換API、エッジ配信、コスト効率
- **Cloudflare Workers**: グローバルエッジ配信、低レイテンシー、自動スケーリング、KVキャッシュ統合

## Data Flow

### Primary User Flow: テキストからマンガ生成

```mermaid
sequenceDiagram
    participant User
    participant RSC as Server Component
    participant Mastra as Mastra Agent
    participant AI as AI Services
    participant DB as Database
    participant Storage as R2 Storage

    User->>RSC: 小説テキスト投稿
    RSC->>Mastra: テキスト解析リクエスト
    Mastra->>AI: 5要素抽出
    AI-->>Mastra: 要素データ
    Mastra->>AI: 画像プロンプト生成
    AI-->>Mastra: プロンプト
    Mastra->>AI: 画像生成API
    AI-->>Storage: 画像保存
    Mastra->>DB: プロジェクト保存
    Mastra-->>RSC: 生成結果
    RSC-->>User: マンガプレビュー表示
```

### エピソード構成フロー

```mermaid
sequenceDiagram
    participant TextEngine as Text Analysis Engine
    participant Episode as Episode Composer
    participant Layout as Layout Engine
    participant Panel as Panel Generator

    TextEngine->>Episode: 解析済みテキスト
    Episode->>Episode: チャプター分割
    Episode->>Episode: クライマックス検出
    Episode->>Layout: エピソード構成
    Layout->>Panel: ページ分割指示
    Panel->>Panel: コマ割り計算
    Panel-->>Layout: レイアウトデータ
```

## Components and Interfaces

### Backend Services & Method Signatures

```typescript
// Mastra Agent定義
class NovelToMangaAgent {
  async analyzeText(text: string): Promise<TextAnalysis> // テキスト解析と5要素抽出
  async generateEpisodes(analysis: TextAnalysis): Promise<Episode[]> // エピソード構成
  async generateImages(scenes: Scene[]): Promise<GeneratedImage[]> // 画像生成
  async createLayout(episode: Episode): Promise<MangaLayout> // レイアウト生成
}

// エピソード構成サービス
class EpisodeComposer {
  splitIntoChapters(text: string): Chapter[] // チャプター分割
  identifyClimaxPoints(chapter: Chapter): ClimaxPoint[] // クライマックス検出
  composeEpisode(chapters: Chapter[]): Episode // エピソード構成
}

// レイアウトエンジン
class MangaLayoutEngine {
  generatePanelLayout(scenes: Scene[]): PanelLayout // コマ割り生成
  placeSpeechBubbles(panels: Panel[]): BubblePlacement[] // 吹き出し配置
  applyReadingOrder(layout: PanelLayout): OrderedLayout // 読み順適用
}
```

### Frontend Components

| Component Name | Responsibility | Props/State Summary |
|----------------|----------------|---------------------|
| TextInputEditor | 小説テキスト入力UI | text, onAnalyze, maxLength |
| ProgressTracker | 処理進捗表示 | steps, currentStep, progress |
| MangaPreview | マンガプレビュー表示 | layout, panels, editable |
| PanelEditor | コマ編集インターフェース | panel, onResize, onMove |
| SpeechBubbleEditor | 吹き出し編集 | bubble, text, style, onEdit |
| ExportDialog | エクスポート設定 | formats, onExport |
| ProjectManager | プロジェクト管理UI | projects, onSave, onLoad |

### API Endpoints

| Method | Route | Purpose | Auth | Status Codes |
|--------|-------|---------|------|--------------|
| POST | /api/analyze | テキスト解析と5要素抽出 | Required | 200, 400, 401, 413, 500 |
| POST | /api/episodes | エピソード構成生成 | Required | 201, 400, 401, 500 |
| POST | /api/generate-images | レイアウト画像生成 | Required | 201, 400, 401, 429, 500 |
| GET | /api/projects | プロジェクト一覧取得 | Required | 200, 401, 500 |
| GET | /api/projects/:id | プロジェクト詳細取得 | Required | 200, 401, 404, 500 |
| PUT | /api/projects/:id | プロジェクト更新 | Required | 200, 400, 401, 404, 500 |
| POST | /api/export | マンガエクスポート | Required | 201, 400, 401, 500 |
| POST | /api/share | 共有リンク生成 | Required | 201, 401, 500 |

## Data Models

### Domain Entities

1. **Novel**: 入力された小説全体（テキストはR2に保存）
2. **Job**: 処理ジョブ（進捗管理）
3. **Chunk**: 分割されたテキストチャンク（R2に保存）
4. **ChunkAnalysis**: チャンク毎の解析結果（R2に保存）
5. **NovelAnalysis**: 統合された解析結果（5要素、シーン、会話をR2に保存）
6. **Episode**: 連載エピソード単位のデータ
7. **MangaPage**: マンガページ（レイアウトYAMLはR2に保存）
8. **Panel**: 個別コマのデータ（位置、サイズ、読み順）

### Entity Relationships

```mermaid
erDiagram
    NOVEL ||--|| JOB : "has processing"
    NOVEL ||--|{ CHUNK : "divided into"
    CHUNK ||--|| CHUNK_ANALYSIS : "analyzed to"
    NOVEL ||--|| NOVEL_ANALYSIS : "has integrated"
    NOVEL ||--|{ EPISODE : "consists of"
    EPISODE ||--|{ MANGA_PAGE : "contains"
    MANGA_PAGE ||--|{ PANEL : "contains"
    
    NOVEL {
        string id PK
        string title
        string originalTextFile
        number totalLength
        datetime createdAt
        datetime updatedAt
    }
    
    JOB {
        string id PK
        string novelId FK
        string status
        number progress
        number totalChunks
        number processedChunks
    }
    
    CHUNK {
        string id PK
        string novelId FK
        number chunkIndex
        string textFile
        number startIndex
        number endIndex
        string status
    }
```

### Data Model Definitions

```typescript
// TypeScript インターフェース定義

// Core Models
interface Novel {
  id: string;                    // UUID
  title: string;
  originalTextFile: string;      // R2: novels/{id}/original.txt
  totalLength: number;
  createdAt: Date;
  updatedAt: Date;
}

interface Job {
  id: string;
  novelId: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  progress: number;              // 0-100
  totalChunks: number;
  processedChunks: number;
  startedAt?: Date;
  completedAt?: Date;
  error?: string;
}

interface Chunk {
  id: string;
  novelId: string;
  chunkIndex: number;
  textFile: string;              // R2: novels/{novelId}/chunks/chunk_{index}.txt
  startIndex: number;
  endIndex: number;
  status: 'pending' | 'processing' | 'completed' | 'failed';
}

// Analysis Models
interface ChunkAnalysis {
  id: string;
  chunkId: string;
  analysisFile: string;          // R2: novels/{novelId}/analysis/chunk_{index}.json
  processedAt: Date;
  summary: {
    characterCount: number;
    sceneCount: number;
    dialogueCount: number;
    highlightCount: number;
    situationCount: number;
  };
}

interface NovelAnalysis {
  id: string;
  novelId: string;
  analysisFile: string;          // R2: novels/{novelId}/analysis/integrated.json
  summary: {
    totalCharacters: number;
    totalScenes: number;
    totalDialogues: number;
    totalHighlights: number;
    totalSituations: number;
  };
  createdAt: Date;
  updatedAt: Date;
}

// Manga Models
interface Episode {
  id: string;
  novelId: string;
  episodeNumber: number;
  title: string;
  chapters: string[];
  climaxPoint?: number;
  startIndex: number;
  endIndex: number;
  createdAt: Date;
  updatedAt: Date;
}

interface MangaPage {
  id: string;
  episodeId: string;
  pageNumber: number;
  layoutFile: string;            // R2: novels/{novelId}/episodes/{episodeNumber}/pages/{pageNumber}/layout.yaml
  previewImageFile?: string;     // R2: novels/{novelId}/episodes/{episodeNumber}/pages/{pageNumber}/preview.png
  panels: Panel[];
  createdAt: Date;
  updatedAt: Date;
}

interface Panel {
  id: string;
  pageId: string;
  position: { x: number; y: number };
  size: { width: number; height: number };
  panelType: 'normal' | 'action' | 'emphasis';
  content: {
    sceneId?: string;
    dialogueIds?: string[];
    situationId?: string;
  };
  readingOrder: number;          // 日本式読み順
}

// 5要素の詳細（R2に保存）
interface TextAnalysis {
  id: string;
  chunkId?: string;              // ChunkAnalysisの場合
  characters: Character[];       // 登場人物
  scenes: Scene[];              // シーン
  dialogues: Dialogue[];        // 対話
  highlights: Highlight[];      // ハイライト
  situations: Situation[];      // 状況
  createdAt: Date;
  updatedAt: Date;
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
  title TEXT NOT NULL,
  original_text_file TEXT NOT NULL,  -- R2パス
  total_length INTEGER NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE jobs (
  id TEXT PRIMARY KEY,
  novel_id TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
  progress INTEGER DEFAULT 0,
  total_chunks INTEGER NOT NULL,
  processed_chunks INTEGER DEFAULT 0,
  started_at DATETIME,
  completed_at DATETIME,
  error TEXT,
  FOREIGN KEY (novel_id) REFERENCES novels(id) ON DELETE CASCADE
);

CREATE TABLE chunks (
  id TEXT PRIMARY KEY,
  novel_id TEXT NOT NULL,
  chunk_index INTEGER NOT NULL,
  text_file TEXT NOT NULL,  -- R2パス
  start_index INTEGER NOT NULL,
  end_index INTEGER NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
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
└── {novelId}/
    ├── original.txt                    # 元の小説全文
    ├── chunks/
    │   ├── chunk_0.txt                # 分割されたチャンク
    │   ├── chunk_1.txt
    │   └── ...
    ├── analysis/
    │   ├── chunk_0.json               # チャンク毎の5要素解析結果
    │   ├── chunk_1.json
    │   ├── ...
    │   └── integrated.json            # 統合された解析結果
    └── episodes/
        └── {episodeNumber}/
            └── pages/
                └── {pageNumber}/
                    ├── layout.yaml     # レイアウト定義
                    └── preview.png     # プレビュー画像
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
- 画像生成API制限: キューイングとリトライ機構
- レイアウト生成エラー: デフォルトレイアウトへのフォールバック
- ストレージエラー: ローカルキャッシュとリトライ

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
| 画像生成時間 | < 30秒/画像 | 生成API測定 |
| テキスト解析 | < 5秒/10,000文字 | 処理時間測定 |
| 同時ユーザー数 | > 1,000 | 負荷テスト |

### Caching Strategy

- **ブラウザキャッシュ**: Next.js自動最適化、静的アセット
- **CDN**: Cloudflare経由での画像配信
- **アプリケーションキャッシュ**: Cloudflare KVによる解析結果キャッシュ
- **データベースキャッシュ**: D1クエリ結果キャッシュ
- **Edge キャッシュ**: Cloudflare Tiered Cacheによる多階層キャッシュ

### Scalability Approach

- Cloudflare Workersによるグローバルエッジスケーリング
- Mastraワークフローの並列処理
- 画像生成のキューシステム実装（Cloudflare Queues）
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
   - テキスト投稿からマンガ生成フロー
   - 編集機能の動作確認
   - エクスポート機能テスト

4. **パフォーマンステスト**
   - k6による負荷テスト
   - 画像生成のストレステスト
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