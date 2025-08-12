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
