# Implementation Plan

- [x] 1. プロジェクト構造とコアインターフェースのセットアップ
  - [x] Next.js 14プロジェクトの初期化（App Router、TypeScript、Tailwind CSS）
  - [x] src/types, src/services, src/agents, src/componentsのディレクトリ構造作成
  - [x] TypeScriptインターフェース定義（Job、Chunk等の基本型）
  - [x] Mastraフレームワークのインストールと基本設定
  - [x] テスト環境のセットアップ（Vitest、Testing Library）
  - _Requirements: プロジェクト基盤_

- [x] 2. データモデルの実装（テスト駆動開発）（2025-08-05完了）
- [x] 2.1 基本エンティティとバリデーション
  - [x] TextAnalysisモデルのテスト作成（5要素の構造検証）
  - [x] TextAnalysisインターフェース実装（characters、scenes、dialogues、highlights、situations）
  - [x] Zodスキーマによるバリデーション実装
  - _Requirements: REQ-1.4 - 5要素抽出_

- [x] 2.2 エピソードとマンガページモデル
  - [x] Episode、MangaPage、Panelモデルのテスト作成
  - [x] 各モデルの実装（チャプター分割、クライマックス検出用フィールド含む）
  - [x] 日本式読み順（右上から左下）のロジック実装
  - _Requirements: REQ-3 - エピソード構成_

- [x] 2.3 プロジェクトモデルとリレーション（2025-07-31大幅更新）
  - [x] Novel最上位構造の実装（database/schema.sql）
  - [x] Cloudflare D1スキーマ定義（novels、jobs、chunks、episodes等）
  - [x] ジョブ管理の包括的実装（ステップ履歴、再開機能）
  - [x] データベースサービスの拡張（src/services/database.ts）
  - _Requirements: REQ-6 - データ管理_

- [x] 3. AI処理レイヤーの実装（Mastraエージェント）（2025-08-05完了）
- [x] 3.1 テキスト解析エージェント
  - [x] チャンク分割ユーティリティ実装（src/utils/chunk-splitter.ts）
  - [x] チャンクAPIエンドポイント実装（/api/novel/[uuid]/chunks）
  - [x] オーバーラップ付き分割ロジック（文脈保持）
  - [x] Mastraエージェント実装（src/agents/chunk-analyzer.ts）
  - [x] 前後のチャンクを参照した文脈考慮型分析実装（2025-07-29）
  - _Requirements: REQ-1 - テキスト入力と解析_

- [x] 3.2 5要素抽出エージェント（2025-07-29）
  - [x] チャンク分析APIエンドポイント実装（/api/analyze/chunk）
  - [x] LLMプロンプトエンジニアリング（登場人物、シーン、対話、ハイライト、状況）
  - [x] Zodスキーマによる構造化出力の実装
  - [x] Groq LLM統合（compound-betaモデル）
  - [x] 分析結果のDB保存とファイルストレージ実装
  - _Requirements: REQ-1.4 - 5要素識別_

- [x] 3.3 レイアウト生成エージェント（2025-07-31実装）
  - [x] LayoutGeneratorAgentの実装（src/agents/layout-generator.ts）
  - [x] YAML形式のマンガレイアウト記述生成
  - [x] コマ割りアルゴリズム実装（重要度ベース、読み順考慮）
  - [x] 均等分割回避ロジックの実装
  - _Requirements: REQ-3 - レイアウト設訨_

- [x] 4. ビジネスロジックレイヤーの実装（2025-08-05完了）
- [x] 4.1 エピソード構成サービス（部分実装）
  - [x] JobNarrativeProcessorの実装（src/services/job-narrative-processor.ts）
  - [x] チャプター分割とクライマックス検出（NarrativeArcAnalyzer統合）
  - [x] 連載形式のエピソード分割ロジック
  - _Requirements: REQ-3 - 連載エピソード構成_

- [x] 4.2 パネルレイアウトエンジン（2025-08-05完了）
  - [x] PanelLayoutEngineのテスト作成
  - [x] YAMLからのレイアウト解析
  - [x] 日本式マンガレイアウト（右から左、上から下）の実装
  - [x] コマサイズ自動調整アルゴリズム
  - _Requirements: REQ-3 - コマ割り_

- [x] 4.3 吹き出し配置エンジン（2025-08-05完了）
  - [x] SpeechBubblePlacerのテスト作成
  - [x] 対話テキストの吹き出し自動配置
  - [x] スタイル判定（通常、叫び、思考）とデザイン適用
  - _Requirements: REQ-3 - 吹き出し配置_

- [x] 5. Canvas APIによるレイアウト描画（2025-08-05完了）
- [x] 5.1 基本描画コンポーネント
  - [x] CanvasRendererのテスト作成
  - [x] Canvas APIを使用した枠線描画
  - [x] テキストレンダリング（状況説明、セリフ）
  - _Requirements: レイアウト画像生成_

- [x] 5.2 マンガページレンダリング
  - [x] MangaPageRendererのテスト作成
  - [x] 複数パネルの配置と描画
  - [x] 吹き出しの描画（形状、テール方向）
  - [x] 絵コンテスタイルの仕上げ
  - _Requirements: Canvas描画_

- [x] 6. APIエンドポイントの実装（2025-08-05ほぼ完了）
- [x] 6.1 認証とプロジェクト管理API（基礎実装）
  - [ ] NextAuth.js v5のセットアップとテスト
  - [ ] /api/auth/\*エンドポイント実装
  - [ ] /api/projectsのCRUD APIテスト作成と実装
  - [x] Cloudflare Workers基盤設定（Hono + D1 + R2）
  - _Requirements: REQ-6 - プロジェクト管理_

- [x] 6.2 テキスト解析とレイアウト生成API（部分実装）
  - [x] /api/analyzeエンドポイント実装（src/app/api/analyze/route.ts）
  - [x] テキストチャンク分割機能（src/utils/chunk-splitter.ts）
  - [x] Mastraエージェント統合（テキスト解析、5要素抽出）（2025-07-29）
  - [x] /api/analyze/chunkエンドポイント実装（2025-07-29）
  - [x] 前後チャンク参照機能とキャッシュ実装（2025-07-29）
  - [x] /api/jobs/[jobId]/episodesエンドポイント実装（2025-07-31）
  - [x] /api/layout/generateエンドポイント実装（2025-07-31）
  - [x] /api/renderエンドポイント実装（Canvas描画）（2025-08-05）
  - [x] エラーハンドリング基本実装
  - _Requirements: REQ-1, REQ-2, REQ-3_

- [x] 6.3 ストレージとデータ管理API（実装済み）
  - [x] /api/novel/storageエンドポイント（テキスト保存・取得）
  - [x] /api/novel/dbエンドポイント（Novel情報のDB管理）
  - [x] /api/novel/[uuid]/chunksエンドポイント（チャンク分割・取得）
  - [x] JSON形式でのメタデータ付きファイル保存
  - [x] Cloudflare R2とローカルストレージの両対応
  - _Requirements: REQ-6 - データ管理_

- [x] 6.4 エクスポートと共有API（部分実装 2025-08-06）
  - [x] /api/exportエンドポイントの骨格実装
  - [x] PDF形式のエクスポート機能（PDFKit使用）
  - [x] ZIP形式のエクスポート機能（JSZip使用）
  - [x] /api/shareエンドポイントの骨格実装（トークン生成、有効期限設定）
  - [ ] 共有ページの実装
  - [ ] エクスポート機能の完全実装とテスト
  - _Requirements: REQ-5 - エクスポート_

- [x] 7. フロントエンドコンポーネントの実装（基礎実装）
- [x] 7.1 基盤UIコンポーネント（2025-08-07更新）
  - [x] Loggerコンポーネント実装（src/components/Logger.tsx）
  - [x] Tailwind CSS v4によるスタイリング（@import "tailwindcss"）
  - [x] ローディング状態とエラー表示の基本実装（loading.tsx、error.tsx）
  - [x] RSC/Client Component分離（HomeClient.tsx）
  - [x] Google Inter フォント統合
  - _Requirements: UI基盤_

- [x] 7.2 テキスト入力とプレビュー（2025-08-07強化）
  - [x] テキスト入力UI実装（src/components/HomeClient.tsx）
  - [x] 文字数カウントと制限表示（200万文字対応）
  - [x] リアルタイムプレビュー機能
  - [x] プログレス表示（処理状況）
  - [x] サンプル小説の即時読込機能（public/docs/配信）
  - [x] 5作品のサンプル配置（空き家の冒険、怪人二十面相、モルグ街の殺人事件、宮本武蔵、最後の一葉）
  - _Requirements: REQ-1 - テキスト入力_

- [ ] 7.3 マンガエディタコンポーネント
  - [ ] MangaPreviewのテスト作成
  - [ ] インタラクティブなコマ編集（ドラッグ&ドロップ）
  - [ ] 吹き出しテキスト編集機能
  - [ ] スタイルテンプレート選択
  - [x] NovelUploader、ProcessingProgress、ResultsDisplayコンポーネントの準備（2025-08-06）
  - _Requirements: REQ-4 - カスタマイズ_

- [x] 8. 統合とE2Eテスト（部分実装）
- [x] 8.1 アプリケーション統合（部分実装）
  - [x] メインアプリケーションのルーティング設定
  - [x] Server ComponentsとClient Componentsの統合
  - [ ] 認証ガードの実装
  - [x] テキスト分割機能の動作確認
  - _Requirements: システム統合_

- [x] 9. 設定とLLMプロバイダー管理（2025-07-30実装）
  - [x] 設定ファイル統合（app.config.tsへの集約）

### 10. ドメインモデル統合とエラーハンドリング標準化（2025-08-12 着手）

- [x] 10.1 Scene ドメインモデル単一化 (`src/domain/models/scene.ts` 作成, Flexible/Core 二層構造)
- [x] 10.2 既存重複定義の除去と再エクスポート（`text-analysis.ts` / `database-models.ts` / `panel-layout.ts`）
- [x] 10.3 Narrative Arc API の統一レスポンス化 (`createSuccessResponse` / `createErrorResponse` 適用)
- [x] 10.4 `INVALID_INPUT` エラーコード追加と narrative-arc での Zod/準備失敗マッピング
- [ ] 10.5 他 API エンドポイントへの `INVALID_INPUT` 適用拡大とテスト更新
- [ ] 10.6 Chunk → Scene 正規化アダプタ実装（アドホック scene 構造 → SceneFlexible → normalizeToSceneCore）
- [ ] 10.7 永続化層（DB/R2 保存前）での `normalizeToSceneCore` 強制適用
- [ ] 10.8 Scene 追加属性 (mood, visualElements) 利用開始: LLM プロンプト & 保存スキーマ反映
- [x] 10.9 Emotion / Highlight 種別語彙の列挙型化 + マッピングテーブル実装（Emotion 完了・Highlight 未対応）
  - Emotion: `src/domain/models/emotion.ts` 追加、`EmotionSchema` と `normalizeEmotion()` 実装、対話モデルへ適用
  - Highlight: 後続タスク（type/語彙の列挙と利用箇所の置換）
  - 2025-08-12 (PR#63 Gemini medium): 空白のみ文字列を `undefined` として扱うロジック追加 (`normalizeEmotion`) + ユニットテスト追補
- [ ] 10.10 ドキュメント反映（design.md 変更履歴セクション拡張, API エラー仕様章の更新）
- [ ] 10.11 既存永続化 Scene データ一括マイグレーションスクリプト（オプション）
  - [x] Health エンドポイント追加 (`/api/health`) - DB と Storage の簡易疎通確認 (2025-08-12)
  - [x] 環境変数の整理（.envはシークレットのみ）
  - [x] 複数LLMプロバイダー対応（OpenAI、Gemini、Groq、Local）
  - [x] OpenRouterプロバイダー実装と統合
  - [x] Cloudflareバインディング型定義
  - _Requirements: 設定管理とLLM統合_

### 11. Queue/Worker 導入（新規）

- [x] インプロセスキュー雛形追加（開発用）
- [x] APIからのエンキュー（/api/jobs/[jobId], /api/jobs/[jobId]/resume）
- [x] 失敗時DB更新（updateJobError）
- [x] メール通知スタブとENV制御（NOTIFICATIONS_ENABLED）
- [ ] Cloudflare Queuesへの切替（wrangler設定・コンシューマ実装）
- [ ] 冪等性キー/重複防止（ジョブ単位ロック or Durable Objects）
- [ ] 再開時のロック/重複排除の統合テスト

- [x] 10. 物語構造分析機能（2025-07-30追加）
  - [x] NarrativeArcAnalyzerエージェント実装
  - [x] /api/analyze/narrative-arcエンドポイント実装
  - [x] 分析結果のファイル保存機能（エピソード境界情報）
  - [x] 分析結果のDB保存機能（episodesテーブルへの保存）
  - [ ] UIコンポーネントの作成
  - _Requirements: REQ-1.4 - 物語構造解析_

- [x] 11. ジョブ管理と状態追跡機能（2025-07-31追加）
  - [x] ジョブステータスAPI（/api/jobs/[jobId]/status）
  - [x] ジョブ再開機能（/api/jobs/[jobId]/resume）
  - [x] 各ステップの詳細状態追跡（job_step_history）
  - [x] ファイル管理統合（storage_filesテーブル）
  - _Requirements: REQ-6 - データ管理、ジョブ状態追跡_

- [x] 12. ストレージとデータベース抽象化（2025-08-01追加）
  - [x] Storage/DatabaseAdapterインターフェース実装
  - [x] 環境別実装（LocalFileStorage、R2Storage、SQLiteAdapter、D1Adapter）
  - [x] StorageFactoryによる環境自動切り替え
  - [x] APIエラーハンドリング統一（ApiError、createErrorResponse）
  - [x] 包括的なユニットテスト・統合テスト実装
  - _Requirements: REQ-6 - データ管理、環境対応_

- [x] 13. LLMフォールバックチェーン実装（2025-08-04追加）
  - [x] app.config.tsでのフォールバックチェーン設定（openrouter → gemini → claude）
  - [x] LLMFactoryによる動的プロバイダー選択機能実装
  - [x] chunk-analyzer、chunk-bundle-analyzer、narrative-arc-analyzerのフォールバック対応
  - [x] OpenRouterモデル更新（horizon-alpha → horizon-beta）
  - [x] getTextAnalysisLLM、getNarrativeAnalysisLLMの統一化
  - _Requirements: REQ-1 - テキスト解析の可用性向上_

- [x] 14. エンドツーエンド分析フロー完全実装（2025-08-04追加）
  - [x] 小説登録 → チャンク分割 → 分析 → エピソード分析の完全フロー実装
  - [x] jobIdベースのストレージ整合性修正（getChunkAnalysisなど）
  - [x] textAnalysisConfigのuserPromptTemplate追加
  - [x] 統合テストによる動作確認（宮本武蔵長編小説での検証）
  - [x] エラーハンドリングとログ出力の詳細化
  - _Requirements: REQ-1, REQ-3 - 分析フロー完成_

- [x] 15. Canvas描画とマンガレンダリング実装（2025-08-05完了）
  - [x] Canvas描画基盤実装（src/lib/canvas/）
  - [x] MangaPageRendererの実装（YAMLからマンガページ生成）
  - [x] /api/renderエンドポイントの実装（単一ページレンダリング）
  - [x] /api/render/batchエンドポイントの実装（複数ページ並列レンダリング）
  - [x] /api/render/status/[jobId]エンドポイントの実装（レンダリング状況確認）
  - [x] PanelLayoutEngineの実装（コマ割り計算）
  - [x] SpeechBubblePlacerの実装（吹き出し配置）
  - [x] ThumbnailGeneratorの実装（サムネイル生成）
  - [x] DatabaseService.updateRenderStatusの実装（render_statusテーブル管理）
  - [x] 包括的なテスト作成（render-complete.test.ts）
  - _Requirements: REQ-3 - マンガレイアウト生成_

- [x] 16. シナリオオーケストレーター（DSL）骨格追加（2025-08-12追加）
  - [x] 型付き契約の追加（`src/types/contracts.ts`）
  - [x] シナリオDSL/ランナーの追加（`src/services/orchestrator/scenario.ts`）
  - [x] シナリオ定義の追加（`src/agents/scenarios/novel-to-manga.ts`）
  - [x] アダプタのスタブ（`src/services/adapters/`）
  - [x] ユニットテスト追加（`src/__tests__/scenario-dsl.test.ts`）
  - [x] ドキュメントリンク整備（Cloudflare Queues/DO/D1/R2、Mastra）
  - [ ] Cloudflare Queues / Durable Objects 実行ランタイム（MCPで最新API確認後に実装）
  - [ ] Mastraパイプラインへのコンパイル（MCPでAPI確認後）
  - [ ] STEP-Q-EXEC-001: Queue Executor 実装（Cloudflare Queues consumer → adapter dispatch）
    - 受け入れ: batch 消費, fan-out 並列, retry(max 3) & dead-letter ログ
  - [ ] STEP-DO-COORD-001: Durable Object Coordinator 実装（シナリオ状態管理）
    - 受け入れ: topo sort, ready step 判定, completion callback 処理, idempotency 記録
  - [ ] STEP-IDEMP-001: idempotencyKey 生成ユーティリティ (`sha256(stepId+canonicalInputRef)`) + テスト
  - [ ] STEP-OUTPUT-EXT-001: 出力サイズ閾値 (>8KB) で R2 externalize するラッパ実装
  - [ ] STEP-FANIN-QUORUM-001: fan-in quorum ポリシー (all/quorum%) 評価ロジック
  - [ ] STEP-OBS-INIT-001: Metrics (latency/retries), structured log, traceId 発行 初期実装
  - [ ] STEP-DOC-ALIGN-001: design.md の Queue Runtime / Envelope / Retry セクション最終確定と差分記載
  - _Requirements: オーケストレーション、可観測性、拡張性_
  - [x] REVIEW-64-TS-SCHEMA-001: 全シナリオ step run 関数に (input: unknown) 型と Zod.parse 導入（implicit any 排除）
  - [x] REVIEW-64-TEST-SCHEMA-002: `scenario-dsl.test.ts` を Zod schema parse ベースに更新
  - [x] REVIEW-64-API-SCHEMA-003: `/api/scenario/run` summary 集計を safeParse 化
  - [x] REVIEW-64-UI-SCHEMA-004: `ScenarioViewer` フロントエンドレスポンスを Zod discriminated union で検証
  - [x] REVIEW-64-IDEMP-005: cf-executor idempotencyKey を 安定ソート + sha256 16hex トリムに変更
  - [x] REVIEW-64-DEADCODE-006: 未使用 `promptGen` アダプタ削除
  - [x] REVIEW-64-ANY-007: scenario.ts の any キャストを type guard (isZodSchema / hasMapFieldArray) で除去

### 17. デモオーケストレーション導入（2025-08-13 本PR）

- [x] 共通デモ判定 `detectDemoMode()` 追加（`src/utils/request-mode.ts`）
- [x] `/api/analyze` と `/api/layout/generate` に適用（any 排除）
- [x] `/api/render` の YAML 自動読込（既存機能をデモで活用）
- [x] `createDemoApiScenario()` をシナリオに追加（`analyze-demo → layout-demo → render-demo`）
- [x] アダプタに Zod 検証＋ `withRetry` リトライ適用（`src/services/adapters/index.ts`）
- [x] 単体テスト: `detectDemoMode` と デモアダプタ（モックfetch）
- [ ] デモ用レイアウトテンプレートの外部化（Magic Values 排除）
- [ ] E2E: `/api/scenario/run {kind: 'demo'}` のハッピーパス

## 🚨 緊急修正タスク（2025-08-07追加）

現在のシステムは**基本機能が動作しない状態**のため、以下の緊急修正を優先実施する必要があります。

### Phase 1: 基盤修復（Week 1）[CRITICAL]

- [x] **16. Job Status API 基本動作修正**（2025-08-08 完了）
  - [x] `DatabaseService.getJobWithProgress()` の例外ハンドリング修正／型厳格化・ログ強化
  - [x] null時の安全ハンドリング（API側での扱い容易化）
  - [x] `/api/jobs/[jobId]/status` エンドポイントの基本動作確保（UI連携）
  - [x] 代表ログでDB健全性を確認（件数/取得結果）
  - _Requirements: 最低限のJob状態追跡_

- [ ] **17. データベース基本動作確認**
  - [ ] SQLite/D1 接続テストの実装
  - [ ] 基本的なCRUD操作の動作確認
  - [ ] エラーログとデバッグ情報の充実
  - [ ] データベースファイル/接続の存在確認
  - _Requirements: データ永続化の基本動作_

- [x] **18. 分析パイプライン最小実装（splitOnly）**（2025-08-08 完了）
  - [x] チャンク分割フローの動作回復（/api/analyze splitOnly）
  - [x] ステータスAPIの安定化（進捗マッピング/丸め）
  - [x] エラー時のログ強化
  - [x] 統合テスト（5/5）で疎通確認
  - _Requirements: 基本的な処理フロー_
  - [x] 18.1 ネイティブモジュール ABI ドリフト対策（2025-08-12 完了）
    - [x] better-sqlite3 ABI mismatch (NODE_MODULE_VERSION 127→137) 調査と原因特定
    - [x] `npm rebuild better-sqlite3` により修復しフルフローテスト再成功
    - [x] `postinstall` スクリプトに再ビルド処理を追加
    - [x] 設計書 (design.md) に指針とリカバリ手順追記
    - _Requirements: 安定稼働・CI 再現性_

### Phase 2: LLM統合（Week 2）[CRITICAL]

- [ ] **19. LLM接続基本実装**
  - [ ] 1つのプロバイダー（OpenAI推奨）との接続確立
  - [ ] `validateLLMConnection()` 関数の実装
  - [ ] API接続テストと基本レスポンス確認
  - [ ] プロバイダー設定の検証機能
  - _Requirements: AI機能の基盤_

- [ ] **20. Mastraエージェント基本動作**
  - [ ] エージェント初期化問題の解決
  - [ ] 最小限のテキスト分析機能の実装
  - [ ] エラー時のフォールバック機能
  - [ ] ログ出力とデバッグ情報の充実
  - _Requirements: AI分析機能_

### Phase 3: 処理完成（Week 3）[HIGH]

- [ ] **21. 全分析ステップの統合**
  - [ ] チャンク分析→エピソード分析の完全フロー
  - [ ] Job状態更新とエラー回復機能
  - [ ] リトライ機能とタイムアウト処理
  - [ ] 進捗表示の正確性確保
  - _Requirements: 完全な分析処理_

## 08-08 追加の改善タスク（小粒・継続）

- [ ] 24. ProcessingProgressのログパネルを本番でも簡易表示できるトグル（環境変数でON/OFF）
- [ ] 25. `/api/jobs/:jobId/status` の補助ラベル（`chunks_created`等）をサーバ側で正規化し、UI側の分岐を簡素化
- [ ] 26. `resumeDataPath` を用いた中断/再開のミニマム実装（split/analyzeの途中再開）
- [ ] 27. Episodes未生成時のUIメッセージ最適化（404理由の明確化、次アクション誘導）
- [ ] 28. LLMモデル設定の検証ユーティリティ（`getAppConfigWithOverrides()`の自己診断ログ強化）

### 08-09 型適合タスク（新規）

- [ ] TASK-LLM-ADAPTER-001: Mastra Agent が要求する LanguageModelV1 と Vercel AI SDK v5 の LanguageModelV2 の型差異を吸収する軽量アダプタの導入
  - 背景: 現状 `src/agents/layout-generator.ts` で `as any` による一時回避を実施
  - 受け入れ条件:
    - `as any` を除去し、strict typesでビルド通過
    - Agent.model に渡す関数の戻り型がMastra側の期待に完全一致
    - 単体テスト: 既存のレイアウト生成テストがグリーンのまま
  - 参考: Mastra Agents / Vercel AI SDK 最新ドキュメント（MCPで検証済み）

### 08-10 エラーハンドリング移行の締め（新規）

- [x] 29. 旧互換レイヤーの撤去（スタブ化）
  - [x] `src/utils/api-error-response.ts` は非推奨スタブ化（新規参照禁止、後日削除）
  - [x] 参照の横断確認（toErrorResponse/api-error-response の除去）
  - [x] 非推奨スタブの削除を実施（2025-08-10）
- [x] 30. ルート全体の統一適用の棚卸し
  - [x] 全APIルートで `createErrorResponse` を使用
  - [x] ルート内 throw は `ApiError` 階層に統一（ZodErrorはそのまま）
- [x] 31. 共通レスポンダの強化とテスト整合
  - [x] ZodError/HttpError/RetryableError/RateLimitError対応
  - [x] Generic Error時は `defaultMessage` をerrorに、元messageはdetailsへ
- [x] 32. 設計文書の更新
  - [x] `design.md` に統一エラーモデルとレスポンス形を明文化
- [ ] 33. 追加フォローアップ（軽微）
  - [ ] ルート内の `HttpError` 新規使用のlintガード検討（禁止 or 自動変換）
  - [x] 失敗時レスポンスの `code` 値の体系化（定数/enum化） — `ERROR_CODES` と `ErrorCode` ユニオン導入済み（2025-08-10）
  - [x] 成功レスポンスの `createSuccessResponse` への統一（/api/layout/generate を含む）(2025-08-12)
  - [x] StorageKeys に ID バリデーション追加でパストラバーサル防止 (2025-08-12)
  - [x] Job 作成APIシグネチャ統一 (`createJob({ id?, novelId, ... })`) (2025-08-12)
  - [x] RepositoryFactory に DatabaseService 健全性チェック追加 (2025-08-12)
  - [x] `createWithId` ヘルパ削除 (2025-08-12)
  - [x] `HttpError` 新規使用禁止 ESLint ガード導入 (2025-08-12)
  - [x] Repository Port 標準化 (entity/mode discriminant + adapters) 実装 (2025-08-12)
  - [x] Port/Factory テスト追加 (ports-guards / adapters-structure / factory-ttl) (2025-08-12)
  - [ ] Storage Audit API の実装（`utils/storage.ts` に `auditStorageKeys()` を追加）
    - 並列走査（Promise.all）と部分成功の集計設計は確定済（設計書反映済）
    - 実装とユニットテストは未着手（本ファイル更新により可視化）

### Repository Storage Standardization (2025-08-12 完了)

PRレビューコメントからの重要修正を実施し、リポジトリ層とストレージ層の標準化を完了:

- [x] 34. 必須修正 - CLAUDE.md 違反項目解消
  - [x] TASK-TYPE-SAFETY-001: 全 `any` 型使用廃止 (`src/repositories/ports/index.ts`, `src/app/api/novel/db/route.ts`)
    - 受け入れ条件: TypeScript strict モード完全準拠、適切な型ガード使用
    - テスト: 既存型ガードテストがグリーンのまま
  - [x] TASK-STORAGE-PATH-001: StorageKeys重複パス修正
    - 問題: `.local-storage/novels/novels/` 形式の重複パス生成
    - 修正: StorageKeys から prefix 除去、getNovelStorage() の baseDir を活用
    - テスト: ストレージ統合テストでパス検証

- [x] 35. Repository Ports & Adapters Pattern
  - [x] TASK-PORTS-DESIGN-001: Discriminated Union Ports 設計
    - Entity別ポート (`EpisodeDbPort`, `NovelDbPort`, `JobDbPort`, `OutputDbPort`)
    - Read-Only/Read-Write モード明示 (`entity`, `mode` discriminant)
    - Type Guards 実装 (`hasEpisodeWriteCapabilities` 等)
  - [x] TASK-ADAPTERS-IMPL-001: Adapter Pattern 実装
    - 非侵襲適合: `adaptAll()` で DatabaseService → Ports 変換
    - 後方互換性確保、段階的移行対応
  - [x] TASK-FACTORY-CACHE-001: Repository Factory TTL機能
    - 環境変数 `REPOSITORY_FACTORY_TTL_MS` 対応 (dev:5分, prod:30分)
    - メモリ滞留防止のためTTL経過時自動クリア

- [x] 36. Storage & Security 強化
  - [x] TASK-STORAGE-AUDIT-001: Storage Audit並列化
    - 逐次走査 → `Promise.all` 並列処理による I/O 待機短縮
    - 動的 monkey patch 廃止、`StorageFactory.auditKeys` 静的公開
  - [x] TASK-PATH-SECURITY-001: パストラバーサル防止
    - StorageKeys ID バリデーション強化 (null バイト/URL エンコード検出)
    - `validateId()` による allowlist アプローチ実装

- [x] 37. テストカバレッジ拡充
  - [x] TASK-TEST-ADAPTERS-001: アダプターパターンテスト (`src/__tests__/repositories/adapters.test.ts`)
    - モック DatabaseService との統合テスト
    - 全 entity 操作の動作確認
  - [x] TASK-TEST-GUARDS-001: 型ガードテスト拡充 (`src/__tests__/repositories/ports-guards.test.ts`)
    - Write capability 判定テスト
    - Discriminated union 型ガードテスト
    - エッジケース (null/undefined/wrong entity) 対応テスト

- [x] 38. ドキュメント更新
  - [x] design.md: Legacy StorageService の現状（DEPRECATED 残置）に修正
  - [x] storage-structure.md: 現行 StorageKeys のみを「実装済」扱いに調整、未実装キーは「計画中」に分類
  - [x] tasks.md: Storage Audit を「未実装」に訂正し TODO を具体化

### StorageKeys フォローアップ（新規 TODO）

- [ ] SK-THUMB-001: `StorageKeys.pageThumbnail(jobId, ep, page)` を追加し、レンダリング時にサムネイル作成/保存を統一
- [ ] SK-EXPORT-001: `StorageKeys.exportOutput(jobId, fmt)` を追加し、エクスポート成果物のキーを統一
- [ ] SK-RENDER-STATUS-001: `StorageKeys.renderStatus(jobId, ep, page)` を追加し、JSON 状態の保存/取得を標準化
- [ ] LEGACY-STORAGE-REMOVE: `src/services/storage.ts` の削除（依存ゼロの確認と Playwright/E2E の再実行）
  - [ ] STORAGE-AUDIT-IMPL-001: `utils/storage.ts` に `auditStorageKeys()` 実装（並列列挙 + issues 集計） & ユニットテスト

### 2025-08-12 PR#63 Gemini Medium Review Follow-ups

- [x] G-EMO-WS-001: `normalizeEmotion` 空白のみ入力の未指定扱い (" " → undefined) とテスト追加
- [x] G-STO-LOG-001: レガシー `StorageService.getNovel/getChunk` の JSON parse 失敗時ログ出力 (dev/test 限定) 追加
- [x] G-LAYOUT-TYPE-001: MangaLayout interface → Zod 派生型へ一本化 (`panel-layout.ts` を schema inferences のみに縮約) + ドキュメント反映
- [x] G-DOC-STORAGE-001: `database/storage-structure.md` のレガシーパス表記に (LEGACY) 明示と現行キー例注記追加
  - [x] TASK-DOCS-DESIGN-001: `design.md` アーキテクチャ図更新
    - Repository Layer (Ports & Adapters) 追加
    - コード例とメリット明記
  - [x] TASK-DOCS-TASKS-001: `tasks.md` 完了タスク記録
  - [x] TASK-DOCS-STORAGE-001: `database/storage-structure.md` audit 機能追記
  - [x] TASK-DOCS-SCENARIO-001: Scenario Orchestrator DSL 追加分 (Queue Runtime 設計/Envelope/Retry/Idempotency) を design.md 反映

## 完了成果物

本セクションにより以下が実現:

- TypeScript strict 準拠 (any 型完全廃止)
- SOLID 原則準拠のリポジトリ設計
- 型安全性とテスタビリティの大幅向上
- セキュリティ強化 (パストラバーサル防止)
- パフォーマンス改善 (並列ストレージアクセス)
- 包括的テストカバレッジ
- 後方互換性を保持した段階的移行
  - [ ] StorageKeys v2 正規化 (prefix 冗長性解消) マイグレーション設計と PoC (保留)
  - [ ] HEALTH-API-001: `/api/health` 実装と E2E テスト置換 (placeholder test からの移行)
    - 背景: 現在の Playwright テストはプレースホルダで CI 通過のみ目的
    - 受け入れ条件:
      - `/api/health` が 200 で `{ success: true, uptimeSeconds: number }` を返却
      - uptimeSeconds は process.uptime() の整数切り捨て
      - E2E テスト: レスポンス構造と閾値 (>=0) を検証し placeholder 削除
      - design.md / tasks.md 更新

## 既存タスク（延期）

- [ ] **22. UI/UXの最終実装**（Phase 4以降）
  - [ ] 共通UIプリミティブの整備（Button, Card, Spinner, Progress）
  - [ ] API呼び出しの一元化（src/services/api.ts）
  - [ ] マンガエディタコンポーネントの完全実装
  - [ ] エクスポート・共有機能のUI実装
  - [ ] 認証機能の実装（NextAuth.js v5）
  - _Requirements: REQ-4, REQ-5, REQ-6_

- [ ] **23. E2Eテストの実装**（Phase 5以降）
  - [ ] Playwrightによる完全なユーザーフローテスト
  - [ ] テキスト投稿→解析→レイアウト生成→編集→エクスポートのフロー
  - [ ] 日本式レイアウトの正確性検証
  - [ ] パフォーマンステスト（200万文字処理時間）
  - _Requirements: 全要件の統合テスト_

## ⚠️ 現実的な開発計画

**現在の完成率**: 15%
**基本動作達成**: 2-3週間（Phase 1-3完了）
**完全機能達成**: 2-3ヶ月

**重要**: 現在はデモ画面以上の価値を提供できない状態のため、Phase 1-3の緊急修正を最優先で実施する必要があります。
