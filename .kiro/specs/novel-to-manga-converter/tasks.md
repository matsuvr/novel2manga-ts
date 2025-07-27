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

- [x] 2.3 プロジェクトモデルとリレーション
  - [x] Jobモデルの実装（workers/src/types/index.ts）
  - [x] Cloudflare D1スキーマ定義（jobs、chunks）
  - [x] データベースサービスの実装（workers/src/services/database.ts）
  - _Requirements: REQ-6 - データ管理_

- [ ] 3. AI処理レイヤーの実装（Mastraエージェント）
- [ ] 3.1 テキスト解析エージェント
  - TextAnalysisAgentのテスト作成（チャンク分割、要素抽出）
  - Mastraエージェント実装（analyzeTextメソッド）
  - 長文テキストのチャンク分割ロジック（10,000文字制限対応）
  - _Requirements: REQ-1 - テキスト入力と解析_

- [ ] 3.2 5要素抽出エージェント
  - FiveElementExtractorのテスト作成
  - LLMプロンプトエンジニアリング（登場人物、シーン、対話、ハイライト、状況）
  - Mastraツール実装（extractElements）
  - _Requirements: REQ-1.4 - 5要素識別_

- [ ] 3.3 レイアウト生成エージェント
  - LayoutGenerationAgentのテスト作成
  - YAML形式のマンガレイアウト記述生成
  - コマ割りアルゴリズム実装（重要度ベース、読み順考慮）
  - _Requirements: REQ-3 - レイアウト設計_

- [ ] 4. ビジネスロジックレイヤーの実装
- [ ] 4.1 エピソード構成サービス
  - EpisodeComposerのテスト作成
  - チャプター分割とクライマックス検出アルゴリズム
  - 連載形式のエピソード分割ロジック
  - _Requirements: REQ-3 - 連載エピソード構成_

- [ ] 4.2 パネルレイアウトエンジン
  - PanelLayoutEngineのテスト作成
  - YAMLからのレイアウト解析
  - 日本式マンガレイアウト（右から左、上から下）の実装
  - コマサイズ自動調整アルゴリズム
  - _Requirements: REQ-3 - コマ割り_

- [ ] 4.3 吹き出し配置エンジン
  - SpeechBubblePlacerのテスト作成
  - 対話テキストの吹き出し自動配置
  - スタイル判定（通常、叫び、思考）とデザイン適用
  - _Requirements: REQ-3 - 吹き出し配置_

- [ ] 5. Canvas APIによるレイアウト描画
- [ ] 5.1 基本描画コンポーネント
  - CanvasRendererのテスト作成
  - Canvas APIを使用した枠線描画
  - テキストレンダリング（状況説明、セリフ）
  - _Requirements: レイアウト画像生成_

- [ ] 5.2 マンガページレンダリング
  - MangaPageRendererのテスト作成
  - 複数パネルの配置と描画
  - 吹き出しの描画（形状、テール方向）
  - 絵コンテスタイルの仕上げ
  - _Requirements: Canvas描画_

- [x] 6. APIエンドポイントの実装（部分実装）
- [x] 6.1 認証とプロジェクト管理API（基礎実装）
  - [ ] NextAuth.js v5のセットアップとテスト
  - [ ] /api/auth/*エンドポイント実装
  - [ ] /api/projectsのCRUD APIテスト作成と実装
  - [x] Cloudflare Workers基盤設定（Hono + D1 + R2）
  - _Requirements: REQ-6 - プロジェクト管理_

- [x] 6.2 テキスト解析とレイアウト生成API（部分実装）
  - [x] /api/analyzeエンドポイント実装（workers/src/routes/analyze.ts）
  - [x] テキストチャンク分割機能（workers/src/utils/text-splitter.ts）
  - [ ] Mastraエージェント統合（テキスト解析、5要素抽出）
  - [ ] /api/episodesエンドポイント実装
  - [ ] /api/generate-imagesエンドポイント（Canvas描画）
  - [x] エラーハンドリング基本実装
  - _Requirements: REQ-1, REQ-2, REQ-3_

- [x] 6.3 エクスポートと共有API（基礎実装）
  - [ ] /api/exportエンドポイントのテスト作成
  - [ ] PDF、PNG連番、CBZ形式のエクスポート実装
  - [ ] /api/shareエンドポイント（72時間有効リンク生成）
  - [x] Cloudflare R2へのファイルアップロード基礎実装（StorageService）
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
  - MangaPreviewのテスト作成
  - インタラクティブなコマ編集（ドラッグ&ドロップ）
  - 吹き出しテキスト編集機能
  - スタイルテンプレート選択
  - _Requirements: REQ-4 - カスタマイズ_

- [x] 8. 統合とE2Eテスト（部分実装）
- [x] 8.1 アプリケーション統合（部分実装）
  - [x] メインアプリケーションのルーティング設定
  - [x] Server ComponentsとClient Componentsの統合
  - [ ] 認証ガードの実装
  - [x] テキスト分割機能の動作確認
  - _Requirements: システム統合_

- [ ] 8.2 E2Eテストの実装
  - Playwrightによる完全なユーザーフローテスト
  - テキスト投稿→解析→レイアウト生成→編集→エクスポートのフロー
  - 日本式レイアウトの正確性検証
  - パフォーマンステスト（10,000文字処理時間）
  - _Requirements: 全要件の統合テスト_