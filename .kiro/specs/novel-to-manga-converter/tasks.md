# Implementation Plan

- [x] 1. プロジェクト構造とコアインターフェースのセットアップ
  - [x] Next.js 14プロジェクトの初期化（App Router、TypeScript、Tailwind CSS）
  - [x] src/types, src/services, src/agents, src/componentsのディレクトリ構造作成
  - [x] TypeScriptインターフェース定義（Job、Chunk等の基本型）
  - [x] Mastraフレームワークのインストールと基本設定
  - [x] テスト環境のセットアップ（Vitest、Testing Library）
  - _Requirements: プロジェクト基盤_

- [ ] 2. データモデルの実装（テスト駆動開発）
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

- [x] 3. AI処理レイヤーの実装（Mastraエージェント）（部分実装）
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

- [ ] 4. ビジネスロジックレイヤーの実装
- [x] 4.1 エピソード構成サービス（部分実装）
  - [x] JobNarrativeProcessorの実装（src/services/job-narrative-processor.ts）
  - [x] チャプター分割とクライマックス検出（NarrativeArcAnalyzer統合）
  - [x] 連載形式のエピソード分割ロジック
  - _Requirements: REQ-3 - 連載エピソード構成_

- [ ] 4.2 パネルレイアウトエンジン
  - [ ] PanelLayoutEngineのテスト作成
  - [ ] YAMLからのレイアウト解析
  - [ ] 日本式マンガレイアウト（右から左、上から下）の実装
  - [ ] コマサイズ自動調整アルゴリズム
  - _Requirements: REQ-3 - コマ割り_

- [ ] 4.3 吹き出し配置エンジン
  - [ ] SpeechBubblePlacerのテスト作成
  - [ ] 対話テキストの吹き出し自動配置
  - [ ] スタイル判定（通常、叫び、思考）とデザイン適用
  - _Requirements: REQ-3 - 吹き出し配置_

- [ ] 5. Canvas APIによるレイアウト描画
- [ ] 5.1 基本描画コンポーネント
  - [ ] CanvasRendererのテスト作成
  - [ ] Canvas APIを使用した枠線描画
  - [ ] テキストレンダリング（状況説明、セリフ）
  - _Requirements: レイアウト画像生成_

- [ ] 5.2 マンガページレンダリング
  - [ ] MangaPageRendererのテスト作成
  - [ ] 複数パネルの配置と描画
  - [ ] 吹き出しの描画（形状、テール方向）
  - [ ] 絵コンテスタイルの仕上げ
  - _Requirements: Canvas描画_

- [x] 6. APIエンドポイントの実装（部分実装）
- [x] 6.1 認証とプロジェクト管理API（基礎実装）
  - [ ] NextAuth.js v5のセットアップとテスト
  - [ ] /api/auth/*エンドポイント実装
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
  - [ ] /api/generate-imagesエンドポイント（Canvas描画）
  - [x] エラーハンドリング基本実装
  - _Requirements: REQ-1, REQ-2, REQ-3_

- [x] 6.3 ストレージとデータ管理API（実装済み）
  - [x] /api/novel/storageエンドポイント（テキスト保存・取得）
  - [x] /api/novel/dbエンドポイント（Novel情報のDB管理）
  - [x] /api/novel/[uuid]/chunksエンドポイント（チャンク分割・取得）
  - [x] JSON形式でのメタデータ付きファイル保存
  - [x] Cloudflare R2とローカルストレージの両対応
  - _Requirements: REQ-6 - データ管理_

- [ ] 6.4 エクスポートと共有API
  - [ ] /api/exportエンドポイントのテスト作成
  - [ ] PDF、PNG連番、CBZ形式のエクスポート実装
  - [ ] /api/shareエンドポイント（72時間有効リンク生成）
  - _Requirements: REQ-5 - エクスポート_

- [x] 7. フロントエンドコンポーネントの実装（基礎実装）
- [x] 7.1 基盤UIコンポーネント
  - [x] Loggerコンポーネント実装（src/components/Logger.tsx）
  - [x] Tailwind CSSによるスタイリング
  - [x] ローディング状態とエラー表示の基本実装
  - _Requirements: UI基盤_

- [x] 7.2 テキスト入力とプレビュー（基本実装）
  - [x] テキスト入力UI実装（src/app/page.tsx）
  - [x] 文字数カウントと制限表示
  - [x] リアルタイムプレビュー機能
  - [x] プログレス表示（処理状況）
  - _Requirements: REQ-1 - テキスト入力_

- [ ] 7.3 マンガエディタコンポーネント
  - [ ] MangaPreviewのテスト作成
  - [ ] インタラクティブなコマ編集（ドラッグ&ドロップ）
  - [ ] 吹き出しテキスト編集機能
  - [ ] スタイルテンプレート選択
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
  - [x] 環境変数の整理（.envはシークレットのみ）
  - [x] 複数LLMプロバイダー対応（OpenAI、Gemini、Groq、Local）
  - [x] OpenRouterプロバイダー実装と統合
  - [x] Cloudflareバインディング型定義
  - _Requirements: 設定管理とLLM統合_

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

- [ ] 15. Canvas描画とマンガレンダリング実装
  - [x] Canvas描画基盤実装（src/lib/canvas/）
  - [ ] MangaPageRendererの実装（5要素からマンガページ生成）
  - [ ] /api/renderエンドポイントの実装
  - [ ] PanelLayoutEngineの実装（コマ割り計算）
  - [ ] SpeechBubblePlacerの実装（吹き出し配置）
  - _Requirements: REQ-3 - マンガレイアウト生成_

- [ ] 8.2 E2Eテストの実装
  - [ ] Playwrightによる完全なユーザーフローテスト
  - [ ] テキスト投稿→解析→レイアウト生成→編集→エクスポートのフロー
  - [ ] 日本式レイアウトの正確性検証
  - [ ] パフォーマンステスト（10,000文字処理時間）
  - _Requirements: 全要件の統合テスト_