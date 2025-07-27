# Implementation Plan

## 進捗状況
- Created: 2025-07-26
- Status: Ready for implementation
- Total tasks: 39
- Completed: 0
- Remaining: 39

## プロジェクト構造セットアップ

- [ ] 1. プロジェクト基盤とディレクトリ構造の作成
  - フロントエンド（React + TypeScript + Vite）とバックエンド（Express.js + TypeScript）のモノレポ構造を作成
  - package.jsonでのワークスペース設定、共通の開発ツール（ESLint、Prettier、TypeScript設定）をセットアップ
  - テストフレームワーク（Vitest、React Testing Library、Playwright）の基本設定を構築
  - _Requirements: 6.1, 6.7_

- [ ] 2. TypeScript型定義とインターフェースの作成
  - shared/types.ts にPresentation、Slide、SlideElement、Template、Themeのインターフェース定義を作成
  - Position、Size、ElementStyle、Background等の補助型を定義
  - フロントエンドとバックエンドで共有する型システムを構築
  - _Requirements: 1.1, 2.1, 3.1_

## バックエンド実装

### データベース層

- [ ] 3. データベース接続とスキーマ作成
  - PostgreSQL接続設定（データベースコネクションプール、環境変数管理）を実装
  - userテーブル、presentationsテーブル、slidesテーブルのDDLスクリプトを作成・実行
  - データベースマイグレーション機能とシード用のサンプルデータを実装
  - _Requirements: 1.1, 1.2_

- [ ] 4. MongoDB接続とテンプレートコレクション
  - MongoDB接続設定とテンプレート、テーマコレクションのスキーマ定義を実装
  - 基本テンプレート（5種類以上）とテーマデータのシードスクリプトを作成
  - テンプレートのクエリ機能とキャッシュ機能を実装
  - _Requirements: 3.1, 3.7_

### モデル層

- [ ] 5. UserモデルとAuthenticationの実装
  - User クラスをbcryptによるパスワードハッシュ機能付きで実装
  - JWT認証機能（トークン生成、検証、リフレッシュ）を実装
  - ユーザー登録・ログインのビジネスロジックとバリデーションを作成
  - _Requirements: 6.1_

- [ ] 6. Presentationモデルの実装
  - Presentation クラスの作成（タイトル、説明、オーナー情報の管理）
  - プレゼンテーション作成時のデフォルト空白スライド生成ロジック実装
  - プレゼンテーション削除時の関連スライド自動削除機能を実装
  - _Requirements: 1.1, 1.2_

- [ ] 7. Slideモデルとslide order管理
  - Slide クラスの実装（order管理、要素配列、背景設定）
  - スライド並び替え機能（order値の自動調整）をtryCatch付きで実装
  - 最後のスライド削除防止機能（「最低1枚のスライドが必要です」エラー）を実装
  - _Requirements: 1.3, 1.4, 1.5_

- [ ] 8. SlideElementモデルとコンテンツ管理
  - SlideElement クラス（テキスト、画像、図形の要素管理）を実装
  - 要素のposition、size、style、zIndex管理機能を実装
  - 要素追加・削除・更新のCRUD操作とバリデーション機能を実装
  - _Requirements: 2.1, 2.2, 2.4, 2.6_

### サービス層

- [ ] 9. PresentationServiceの実装
  - プレゼンテーション作成・更新・削除・取得のサービスメソッドを実装
  - テンプレート適用機能（全スライドへのデザインテーマ適用）を実装
  - プレゼンテーション一覧取得とオーナー権限チェック機能を実装
  - _Requirements: 1.1, 1.2, 3.2_

- [ ] 10. SlideServiceとスライド操作機能
  - スライド追加（指定位置への挿入）、削除、並び替えのサービス機能を実装
  - スライドコンテンツ更新と自動保存機能を実装
  - レイアウト変更時の既存コンテンツ再配置ロジックを実装
  - _Requirements: 1.2, 1.3, 1.4, 3.3_

- [ ] 11. FileServiceとメディア管理
  - 画像ファイルアップロード（JPG、PNG、GIF対応、10MB制限）を実装
  - ファイルサイズチェックと「ファイルサイズが大きすぎます」エラーハンドリングを実装
  - プレゼンテーション保存・読み込み機能（独自JSON形式）を実装
  - _Requirements: 2.3, 2.5, 5.1, 5.2, 5.3_

- [ ] 12. ExportServiceとファイル形式変換
  - PptxGenJSを使用したPowerPoint形式エクスポート機能を実装
  - PDF形式エクスポート機能と進行状況インジケーター連携を実装
  - ファイル処理中のエラーハンドリング（容量不足等）を実装
  - _Requirements: 5.4, 5.5, 5.7, 5.8_

### API層

- [ ] 13. 認証API endpoints
  - POST /api/auth/register, /api/auth/login, /api/auth/logout の実装
  - JWT middleware とprotected routes の認証チェック機能を実装
  - 認証エラー時のレスポンス（401 Unauthorized）とエラーメッセージを実装
  - _Requirements: 6.1_

- [ ] 14. プレゼンテーション管理API
  - GET/POST/PUT/DELETE /api/presentations のCRUD API を実装
  - プレゼンテーション詳細取得（/api/presentations/:id）とオーナー権限チェックを実装
  - API バリデーション（express-validator使用）とエラーレスポンスを実装
  - _Requirements: 1.1, 1.2_

- [ ] 15. スライド操作API
  - POST /api/presentations/:id/slides（スライド追加）の実装
  - PUT/DELETE /api/slides/:id（スライド更新・削除）の実装
  - POST /api/presentations/:id/reorder（スライド並び替え）の実装
  - _Requirements: 1.2, 1.3, 1.4_

- [ ] 16. ファイル管理API
  - POST /api/media/upload（メディアファイルアップロード）をmulter使用で実装
  - POST /api/presentations/:id/export/pptx（PowerPointエクスポート）の実装
  - POST /api/presentations/:id/export/pdf（PDFエクスポート）の実装
  - _Requirements: 2.3, 5.4, 5.7_

- [ ] 17. テンプレート・テーマAPI
  - GET /api/templates（テンプレート一覧取得）の実装
  - PUT /api/presentations/:id/template（テンプレート適用）の実装
  - PUT /api/presentations/:id/theme（テーマ更新とリアルタイムプレビュー）の実装
  - _Requirements: 3.1, 3.2, 3.4, 3.6_

## フロントエンド実装

### 基盤コンポーネント

- [ ] 18. Redux Store とstate management 
  - Redux Toolkit で presentation、slides、ui の state slice を作成
  - Undo/Redo機能（createSlice with extraReducers）を実装
  - Presentation 作成・更新・削除のaction creators と reducers を実装
  - _Requirements: 6.3_

- [ ] 19. API client とHTTP通信層
  - axios を使用したAPI client の作成（ベースURL設定、認証ヘッダー自動付与）
  - プレゼンテーション、スライド、ファイル操作のAPI呼び出し関数を実装
  - エラーハンドリング と Loading state 管理を実装
  - _Requirements: 6.5, 6.6_

- [ ] 20. 基本UIコンポーネント（Mantine UI使用）
  - Button、Input、Modal、Tooltip等の再利用可能コンポーネントを作成
  - ツールチップ機能（メニューやボタンのマウスオーバー時説明表示）を実装
  - ローディングインジケーターと進行状況表示コンポーネントを作成
  - _Requirements: 6.2, 6.6_

### 認証・ルーティング

- [ ] 21. 認証コンポーネント
  - LoginForm と RegisterForm コンポーネント（バリデーション付き）を実装
  - 認証状態管理（JWT token のlocalStorage保存・読み込み）を実装
  - ProtectedRoute コンポーネント（未認証時のリダイレクト）を実装
  - _Requirements: 6.1_

- [ ] 22. アプリケーションルーティング
  - React Router でのページルーティング（/, /editor/:id, /presentation/:id）を実装
  - Navigation コンポーネント（メニューバー、ユーザーメニュー）を実装
  - 404ページとエラーBoundaryコンポーネントを実装
  - _Requirements: 6.7, 6.8_

### メインエディター画面

- [ ] 23. PresentationEditorメインコンポーネント
  - エディター画面のレイアウト（ツールバー、スライドパネル、キャンバス、プロパティパネル）を実装
  - プレゼンテーション読み込み機能とエラーハンドリングを実装
  - 未保存変更の検出と保存確認ダイアログを実装
  - _Requirements: 6.7, 5.6_

- [ ] 24. ToolBarコンポーネント
  - テキスト、図形（四角形、円、線）、画像追加ツールボタンを実装
  - ツール選択状態の管理とアクティブツール表示を実装
  - キーボードショートカット（Ctrl+Z, Ctrl+Y等）のイベントハンドリングを実装
  - _Requirements: 2.1, 2.6, 6.3, 6.4_

- [ ] 25. SlidePanelとサムネイル管理
  - スライドサムネイル一覧表示とクリック選択機能を実装
  - pragmatic-drag-and-dropを使用したスライド並び替え機能を実装
  - 現在選択中スライドのハイライト表示とドロップ位置の視覚的表示を実装
  - _Requirements: 1.4, 1.6, 1.7_

### Konva.jsキャンバスエディター

- [ ] 26. SlideCanvasコンポーネント基盤
  - Konva.js Stage と Layer の初期化とReactライフサイクル連携を実装
  - キャンバスサイズ管理とウィンドウリサイズ対応を実装
  - レイヤー分離（背景、コンテンツ、UI）とパフォーマンス最適化を実装
  - _Requirements: 6.8_

- [ ] 27. テキスト編集機能
  - テキストボックス追加（クリック位置への配置、編集モード開始）を実装
  - リアルタイムテキスト入力と自動保存機能を実装
  - フォント、サイズ、色、太字、斜体のフォーマット機能を実装
  - _Requirements: 2.1, 2.2, 2.8_

- [ ] 28. オブジェクト選択と変形機能
  - オブジェクト選択時の選択ハンドル表示を実装
  - マウスドラッグによる移動、リサイズ機能を実装
  - グリッドスナップ機能（移動中の整列支援）を実装
  - _Requirements: 2.4, 2.7_

- [ ] 29. 画像とメディア操作
  - 画像ファイルのドラッグ&ドロップ機能を実装
  - 画像サイズ自動調整と位置調整機能を実装
  - ファイルサイズチェック（10MB制限）とエラー表示を実装
  - _Requirements: 2.3, 2.5_

- [ ] 30. 図形描画機能
  - 四角形、円、線の図形挿入機能を実装
  - 図形の色とサイズ編集オプション（プロパティパネル連携）を実装
  - 図形オブジェクトの変形とスタイル適用機能を実装
  - _Requirements: 2.6_

### テンプレート・テーマ管理

- [ ] 31. TemplateSelectorコンポーネント
  - テンプレート一覧表示（5種類以上のプレビュー付き）を実装
  - テンプレート選択とプレゼンテーション全体への適用機能を実装
  - レイアウトオプション（タイトル+コンテンツ、2列、画像中心等）の表示を実装
  - _Requirements: 3.1, 3.2, 3.7_

- [ ] 32. テーマカスタマイズ機能
  - 背景色・テーマカラー変更のカラーピッカーを実装
  - フォント選択（利用可能フォント一覧から選択）機能を実装
  - リアルタイムプレビュー（テーマ設定調整中の即座反映）を実装
  - _Requirements: 3.4, 3.5, 3.6_

### プレゼンテーション実行モード

- [ ] 33. PresentationViewerコンポーネント
  - フルスクリーン表示機能（プレゼンテーション開始ボタン）を実装
  - 矢印キー・クリックでのスライド遷移とスムーズなトランジション効果を実装
  - Escキーでの編集画面復帰機能を実装
  - _Requirements: 4.1, 4.2, 4.3, 4.4_

- [ ] 34. プレゼンテーション制御機能
  - スライド番号と総スライド数の表示を実装
  - マウスポインター自動非表示機能を実装
  - プレゼンテーション中のエラーハンドリング（編集モード自動復帰）を実装
  - _Requirements: 4.5, 4.6, 4.7_

### ファイル管理UI

- [ ] 35. FileManagerコンポーネント
  - 保存・名前を付けて保存のダイアログとファイル名入力を実装
  - 既存プレゼンテーションファイルの読み込み機能を実装
  - サポートファイル形式（.ppt、.pptx、.pdf）のフィルタリング機能を実装
  - _Requirements: 5.1, 5.2, 5.3, 5.8_

- [ ] 36. エクスポート機能UI
  - PDFエクスポートボタンとファイルダウンロード機能を実装
  - ファイル処理中の進行状況インジケーター表示を実装
  - エクスポートエラー時のエラーメッセージ表示を実装
  - _Requirements: 5.4, 5.7_

## 統合・テスト・最終調整

- [ ] 37. ユーザーガイダンス機能
  - 初回起動時のチュートリアル（基本機能の案内）を実装
  - 無効操作時の分かりやすいエラーメッセージと解決方法表示を実装
  - ヘルプドキュメントとFAQページを実装
  - _Requirements: 6.1, 6.5_

- [ ] 38. 統合テストとE2Eテスト
  - Playwright を使用した完全なユーザージャーニーテストを実装
  - プレゼンテーション作成→編集→保存→発表の完全フローテストを実装
  - エラーケースとエッジケースのテストシナリオを実装
  - _Requirements: 全要件_

- [ ] 39. アプリケーション全体の統合と最終調整
  - フロントエンドとバックエンドの完全連携確認を実装
  - パフォーマンス最適化（Konva.jsキャッシュ、Reduxセレクター最適化）を実装
  - プロダクション環境設定とエラーログ収集機能を実装
  - _Requirements: 全要件_