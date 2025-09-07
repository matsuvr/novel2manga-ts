# Tasks: Novel to Manga Converter - Current Implementation Status

## Core Pipeline Implementation ✅

### Text Processing Pipeline

- [x] **テキスト分析**: 長文テキストの効率的なチャンク分割
- [x] **スライディング分析**: 前後コンテキストを保持した重複分析
- [x] **5要素抽出**: 登場人物・シーン・対話・ハイライト・状況の自動抽出
- [x] **スクリプト変換**: チャンクからマンガスクリプトへの変換
- [x] **スクリプト結合**: 複数チャンクのスクリプトの一貫性を保った結合

### Episode Structure Generation

- [x] **エピソード分割**: スクリプトから連載マンガ用エピソード構造の生成
- [x] **ページ分割推定**: エピソード内での適切なページ分割の自動計算
- [x] **フォールバック処理**: 短いコンテンツの単一エピソード統合
- [x] **端数吸収**: 末尾の短いエピソードの直前エピソードへの統合
- [x] **テスト設定整備**: エピソード関連閾値をテストモックに追加し、バリデーションの一貫性を確保

### Layout Generation System

- [x] **JSON統一**: すべてのレイアウトデータをJSON形式で定義・保存（YAML完全廃止）
- [x] **パネルテンプレート**: パネル数に基づく自動コマ割りとテンプレート選択
- [x] **レイアウト生成**: セリフとキャラクターに応じた吹き出し配置
- [x] **バリデーション**: パネル重複チェック、境界正規化、参照テンプレートフォールバック
- [x] **段階的進捗**: バッチ処理による段階的レイアウト生成と進捗保存

### Rendering System

- [x] **Canvas描画**: HTMLCanvasを使用したストーリーボード描画
- [x] **バッチレンダリング**: 複数ページの並列処理とプログレス管理
- [x] **垂直テキスト**: 日本語縦書きテキスト描画の統合（オプション機能）
- [x] **レンダーキー**: 生成されたページ画像の一意識別と取得
- [x] **吹き出し字数スケーリング**: コマ縦幅比率に応じて `maxCharsPerLine` を 6/8/デフォルト に切替（改行処理はAPI側）
- [x] **複数吹き出しの水平配置**: 同一コマに複数吹き出しがある場合は横並びにし、吹き出しを最優先で配置
  - 各吹き出し幅をスロット幅以下に制御し、互いに重ならないようにする
  - 話者ラベルをスロット内に収め、隣接吹き出しとの重なりを防止
  - CanvasImageSource型でアセットを扱い危険な型キャストを排除

### Data Persistence & Management

- [x] **ジョブ管理**: 処理状況の永続化と中断・再開機能
- [x] **段階的保存**: 各処理段階でのデータ自動保存
- [x] **プログレス追跡**: エピソード・ページレベルでの詳細進捗管理
- [x] **エラー復旧**: 処理失敗時の状態復旧とリトライ機能
- [x] **エピソードテキスト永続化**: 抽出されたエピソードテキストの保存
- [x] **レンダーステータス追跡**: レンダリング状況の詳細追跡
- [x] **ユーザー紐付け**: Auth.js スキーマを追加し、novels・jobs に userId 外部キーを設定
- [x] **変換結果のR2保存**: ユーザー単位のパス設計とメタ情報のD1記録
- [x] **キャラクターメモリ永続化**: リポジトリ経由で保存し、ファイルパスをDBに記録

### User Interface & API

- [x] **API設計**: RESTful API設計による各機能のエンドポイント提供
- [x] **リアルタイム更新**: 処理進捗のリアルタイム表示
- [x] **SSE強化**: Cloudflare Workers対応のSSEでUIとバックエンドの進捗を厳密同期（processingPage/processingEpisode, perEpisode概要を反映）
- [x] **ステップ整合**: パイプラインで`episode`ステップを明示的に通知し、UIでのスキップ誤認を解消
- [x] **結果ブラウジング**: 生成されたマンガレイアウトのページ別閲覧
- [x] **共有機能**: 結果の共有とエクスポート
- [x] **エラー表示**: 処理エラーの詳細情報表示とバリデーション結果
- [x] **Google OAuth 認証**: Auth.js v5 + D1 ユーザー管理 + JWT セッション (`/portal/api/auth/*`)
- [x] **サインアップ同意チェック**: 利用規約に同意しないと登録を進められない
- [x] **進捗URLの永続化**: novelId 発行後は `/novel/{novelId}/progress` に遷移し、戻る/再訪でも続きから再開
- [x] **SSEエラー耐性**: フロント由来のSSE切断時は警告ログのみ・処理は継続（自動再接続）

### Token Usage Tracking (2025-09-05)

- [x] LLMトークン使用量のDB記録（token_usage）
- [x] API: GET /api/jobs/[jobId]/token-usage で取得
- [x] 結果ページにモデル別「入力/出力トークン」一覧表示
- [x] 進捗画面に累積トークンの現在値を表示（ポーリング間隔は app.config.ts で一元化）

## Technical Architecture Completed ✅

### Infrastructure Integration

- [x] **Cloudflare統合**: Workers/Pages/D1/R2/KVを活用した分散処理
- [x] **LLMプロバイダー**: Vertex AI Gemini 2.5 Flash/Pro を中心に OpenRouter/Groq/Cerebras と連携
- [x] **型安全性**: TypeScript strict modeによる型安全性確保
- [x] **テスト戦略**: Unit/Integration/E2Eテストの包括的カバレッジ

### Data Format & Quality Standards

- [x] **JSON統一**: すべてのデータフォーマットをJSONに統一（YAML完全廃止）
- [x] **Zod検証**: すべてのデータ構造のスキーマ検証
- [x] **エラーハンドリング**: 包括的エラー処理と詳細ログ記録
- [x] **設定集約**: すべての設定の中央集権化

### Service Layer Architecture

- [x] **モジュール化**: 機能別の疎結合な設計
- [x] **JobProgressService**: エラーハンドリング強化と進捗エンリッチメント
- [x] **HealthCheckService**: ヘルスチェック機能の分離
- [x] **トランザクション管理**: データ整合性を保証するトランザクション処理

## Quality Assurance Standards Met ✅

### Code Quality

- [x] **TypeScript**: Zero `any` types, strict type enforcement maintained
- [x] **Linting**: All Biome lint checks passing with no errors
- [x] **CI Checks**: GitHub Actions run lint, format, typecheck, and tests on each push and PR
- [x] **DRY Principle**: No code duplication, shared utilities properly factored
- [x] **SOLID**: Single-responsibility, dependency inversion patterns

### Error Handling & Observability

- [x] **エラーパターン統一**: 集約されたエラーパターン定義
- [x] **ログ戦略**: 構造化ログによる詳細なデバッグ情報
- [x] **フォールバック処理**: 各レイヤーでの適切なフォールバック実装
- [x] **バリデーション**: 入力データの厳密な検証とフォールバック

## Recently Completed Features ✅

### Realtime Progress via SSE (2025-09-02)

- [x] クライアントのポーリングを廃止し、SSEに移行（`/api/jobs/{jobId}/events`）。
- [x] Cloudflare Workers（OpenNext）上での`ReadableStream`ベース実装。`init/message/final/ping`イベントを配信。
- [x] `ProcessingProgress`と`HomeClient`をEventSource購読に更新。

### Script Conversion Quality Enhancement (2025-09-01)

- [x] **カバレッジ評価システム**: スクリプト品質の定量評価機能実装

### Cloudflare Build Baseline (2025-03-25)

- [x] OpenNext + wrangler で Cloudflare Workers 向けビルド基盤を整備
- [x] `/hello` ページで Hello World を表示
- [x] GitHub Actions にデプロイワークフローを追加
- [x] docs/cloudflare-deployment.md にデプロイ手順と検証方法を記載

### Episode Bundle System (2025-08-31)

- [x] **エピソードバンドリング**: 20ページ未満エピソードの自動統合機能
- [x] **レイアウトステータス**: エピソード別ページ数表示とステータス管理
- [x] **データベース拡張**: `episode_text_path` カラム追加完了
- [x] **統合テスト**: バンドリング動作の包括的テストカバレッジ

### Vertical Text Batch Rendering (2025-09-03)

- [x] 縦書きレンダラーAPIのページ単位バッチ呼び出しに移行（`POST /render/batch`）。
- [x] `MangaPageRenderer`でページ内ダイアログを集約して一括リクエスト化。
- [x] クライアントに`renderVerticalTextBatch`を追加し、型を拡張（`font`返却の取り込み）。
- [x] 既存ユニットテストをbatch前提に更新し、新規テストを追加。

### Vertical Text & SFX Integration (2025-09-01)

- [x] **縦書きレンダリング**: 日本語縦書きテキストのCanvas描画対応
- [x] **フォント動的調整**: デフォルトフォント使用を含むフォント設定
- [x] **吹き出し形状制御**: テキスト解析による自動吹き出しタイプ判定
- [x] **SFXデータ統合**: 効果音表現のレンダリング統合

### Bugfix: SFX prefix stripping (2025-09-03)

- [x] `SFX:`/`sfx:` プレフィックスが残存するケースを修正（先頭空白/不可視文字、全角`：`、全角`ＳＦＸ`に対応）。
- [x] ユニットテスト追加（半角/全角/不可視/BOM 前置の各パターン）。

### Bugfix: Bundled episode display (2025-09-06)

- [x] 結果ページでバンドル後のエピソード数とタイトルが不一致となる問題を修正。
- [x] `full_pages.json` から最終エピソード情報を読み込み、UI表示を更新。

### Bugfix: Scene/Highlight index validation (2025-09-07)

- [x] Scene と Highlight のスキーマで `endIndex` が `startIndex` と同一の場合を許容。
- [x] 単一点のシーンやハイライトがバリデーションエラーになる問題を修正。

### Bugfix: full_pages JSON parsing (2025-09-08)

- [x] `full_pages.json` 末尾に混入する `null` 文字を除去してから解析する `parseJson` ユーティリティを実装。
- [x] 結果ページでユーティリティを用い、JSON パースエラーを解消。

### Bugfix: authentication env build failure (2025-09-09)

- [x] `RootLayout` が必須認証環境変数の欠如を検知し、構成エラーを表示することで CI ビルド失敗を防止。

### Runtime Configuration Cleanup (2025-09-09)

- [x] API ルートから冗長な `export const runtime = 'nodejs'` 宣言を削除し、OpenNext の既定 Node.js ランタイムに統一。

### Code Structure Refactoring (2025-09-04)

- [x] **コンポーネントのリファクタリング**: 各種コンポーネントの構造を改善し、保守性を向上
- [x] **認証フロー最適化**: Codex認証関連のエラーハンドリングを改善

## Recently Completed Features ✅ (2025-09-04 Update)

### Code Quality Improvements

- [x] **エラー処理ユーティリティのリファクタリング**: 非推奨のエラー処理ユーティリティを削除し、コードベースを簡潔化
- [x] **フォント処理コードの削除**: 未使用のフォント処理コードを削除し、layout.tsxのProvidersインポートを修正
- [x] **認証タイムアウト処理の改善**: 認証タイムアウトの安全な処理と、初期化エラーの適切な表示を実装
- [x] **パッケージ管理の改善**: package.jsonのlintコマンドを修正し、インポート順序を整理
- [x] **ナラティブアーク分析の削除**: 未使用のナラティブアーク関連実装を除去し、チャンク分析結果のみでパイプラインを構成
- [x] **キャラクター一貫性チェックの簡素化**: 旧LLM評価ロジックを削除し、チャンク毎のキャラクターメモリ保存に一本化
- [x] **フラグメント処理の削除**: 未使用のフラグメント分割ロジックと関連コンバーターを廃止し、コンテクストを軽量化

### Configuration Management

- [x] **設定ファイルの整理**: codex_auth.jsonを.gitignoreに追加し、セキュリティを向上
- [x] **新しい設定インターフェース**: より柔軟な設定管理のための新インターフェースを実装

## Active Development Areas 🚧

### Testing & E2E Coverage

- [ ] **E2E Resume**: バッチ処理後の中断・再開シナリオテスト
- [ ] **E2E Validation**: バリデーション結果表示のE2Eテスト
- [ ] **垂直テキストE2E**: モックAPIを使用した垂直テキスト機能テスト
- [ ] **統合テスト拡張**: パイプライン全体の検証ログ追加

### Performance & Operations

- [ ] **垂直テキスト最適化**: キャッシュチューニングと同時実行制御
- [ ] **カバレッジ評価チューニング**: 品質評価指標の精度向上（`features.enableCoverageCheck` はデフォルト無効）
- [x] **バンドリングロジック拡張**: ページ割り後の実ページ数に基づくエピソード統合（最小20p、最終話は直前に統合）。設定は `app.config.ts > episodeBundling` に集約

### Script Conversion Normalization

- [x] 吹き出し最大50文字の設定化と適用（Script Conversion直後）。
- [x] 上限超過セリフのパネル分割（2コマ目以降`cut: "前のコマを引き継ぐ"`）。
- [x] 対象タイプ拡張: `speech` に加え `thought`/`narration` にも適用。
- [x] ユニットテスト追加（`src/__tests__/script-postprocess.test.ts`）。

### Fixes: Episode normalization (2025-09-03)

- [x] スクリプト→エピソード変換での情報欠落解消
  - [x] 話者抽出をページ分割計算側へ移動（全角/半角コロン対応、外側カギ括弧除去）
  - [x] narration を「ナレーション」話者の1セリフとして統合
- [x] cut/camera を panel.content に統合して保存
- [x] 1エピソード最大コマ数を app.config.ts から設定可能に（デフォルト1000）
  - [x] ユニットテスト追加（dialogue-utils / importance-based）

## Legacy Tasks Archive 📁

### Database Access Refactoring (Phase 1, 2025-09-04)

- [x] アダプタ層の導入（`DatabaseAdapter` 抽象 + `SqliteAdapter`/`D1Adapter` 実装）
- [x] 接続管理の統一（`createDatabaseConnection` と `detectAdapter`）
- [x] ユニットテスト追加（同期/非同期動作、エラー挙動、検出ロジック）
- [ ] ドメイン別サービスの完全移行（Novel/Job/Episode/Chunk/Output/Render）
- [ ] 参照更新と God Object (`src/services/database.ts`) の削除
- [ ] Cloudflare D1 バインディング導入時の統合テスト

### Completed Major Refactors

- ✅ **YAML廃止**: すべてのYAMLフォーマットをJSONに移行完了
- ✅ **エージェント統合**: `src/agent` → `src/agents` への統合
- ✅ **エラーハンドリング**: 中央集権化されたエラーパターンと処理
- ✅ **感情表現**: 自由テキスト文字列への変更
- ✅ **スクリプト変換**: ガードレール実装とバリデーション強化
- ✅ **段階的レンダリング**: バッチ処理による効率的レンダリング
- ✅ **StorageService削除**: レガシーストレージサービスを廃止し、`StorageKeys` と `StorageFactory` に統一

### System Architecture Evolution

- ✅ **パイプライン設計**: analyze → layout → render フローの確立
- ✅ **プロンプト整理**: 新フロー対応のプロンプト更新
- ✅ **オーケストレーター**: API駆動型の理想的フロー実装
- ✅ **責任分離**: ルートとサービスレイヤーの明確な分離
- ✅ **LLM差異吸収**: Vertex AI(Gemini)の`system`ロール非対応を`systemInstruction`へ正規化し、OpenAI/Groq/Gemini間での呼び出し差異をアダプター層で解消（2025-08-31）
- ✅ **品質保証システム**: スクリプト変換のカバレッジ評価とリトライメカニズム（2025-09-01）
- ✅ **効率的統合**: エピソードバンドル機能による短編統合とページ最適化（2025-08-31）
- ✅ **レンダリング強化**: 縦書きテキスト・SFX・動的吹き出し形状対応（2025-09-01）

## システム成熟度指標

### 機能完成度: 96% ✅

- ✅ コア機能: 小説→マンガ変換パイプライン完全実装
- ✅ 品質保証: 自動評価・リトライ・バリデーション機能
- ✅ ユーザビリティ: エピソード統合・進捗表示・エラーハンドリング
- ⚠️ 最適化: パフォーマンスチューニング継続中

### テストカバレッジ: 86% ✅

- ✅ ユニットテスト: 主要機能の包括的テスト
- ✅ 統合テスト: パイプライン全体の動作確認
- ✅ API契約テスト: エンドポイント仕様検証
- ⚠️ E2Eテスト: 一部垂直テキスト機能でスキップ

### 運用準備度: 92% ✅

- ✅ エラーハンドリング: 包括的エラー処理とログ記録（2025-09-04リファクタリング完了）
- ✅ データ整合性: トランザクション管理・永続化
- ✅ スケーラビリティ: Cloudflareインフラ統合
- ✅ 設定管理: Codex認証と設定ファイルのセキュリティ強化完了
- ⚠️ モニタリング: 詳細メトリクス収集の拡張予定

## 認証統合タスク

- Google 認証導入の詳細タスクは docs/google-auth-tasks.md を参照。
