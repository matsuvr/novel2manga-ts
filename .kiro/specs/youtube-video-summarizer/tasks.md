# Implementation Plan

## プロジェクトセットアップと基盤構築

- [ ] 1. Next.js 15プロジェクトの初期セットアップとTypeScript設定
  - `npx create-next-app@latest youtube-video-summarizer --typescript --app --tailwind`を実行
  - 必要な依存関係をインストール: `@google/generative-ai`, `socket.io`, `socket.io-client`, `zustand`, `@upstash/redis`
  - TypeScript設定を厳格モードに調整し、path aliasを設定
  - ESLintとPrettierの設定ファイルを作成
  - _Requirements: 基盤構築_

- [ ] 2. プロジェクト構造とコアインターフェースの定義
  - `src/types`ディレクトリを作成し、全てのTypeScriptインターフェースを定義
  - VideoSummary, VideoMetadata, ProcessingSession, ErrorInfoインターフェースを作成
  - `src/lib`に定数ファイル（エラーコード、TTL設定等）を作成
  - `src/services`, `src/components`, `src/hooks`ディレクトリを作成
  - _Requirements: 設計に基づく構造化_

## データモデルとバリデーション層の実装

- [ ] 3. URLバリデーションサービスの実装（テスト駆動開発）
- [ ] 3.1 URLバリデーションのテストを作成
  - `src/services/__tests__/urlValidation.test.ts`を作成
  - 有効なYouTube URL（通常形式、短縮形式、モバイル形式）のテストケースを記述
  - 無効なURL、YouTube以外のドメインのテストケースを記述
  - _Requirements: 1.1, 1.2, 1.3, 1.5_

- [ ] 3.2 URLバリデーションサービスの実装
  - `src/services/urlValidation.ts`にURLValidationServiceクラスを実装
  - validateYouTubeURL、normalizeURL、extractVideoIdメソッドを実装
  - 正規表現を使用してYouTube URLパターンをマッチング
  - テストが全て通ることを確認
  - _Requirements: 1.1, 1.2, 1.3, 1.5_

- [ ] 4. エラーハンドリングシステムの構築
- [ ] 4.1 エラーハンドリングのテストを作成
  - `src/services/__tests__/errorHandler.test.ts`を作成
  - 各エラータイプ（INVALID_URL, QUOTA_EXCEEDED等）のテストケースを記述
  - エラーレスポンスの形式とメッセージのテスト
  - _Requirements: 4.1, 4.2, 4.3, 4.5_

- [ ] 4.2 統一エラーハンドラーの実装
  - `src/services/errorHandler.ts`にErrorHandlerクラスを実装
  - エラーコード別のハンドラーマップを実装
  - 日本語のユーザーフレンドリーなエラーメッセージを定義
  - リトライ可能性とアクション提案を含める
  - _Requirements: 4.1, 4.2, 4.3, 4.5_

## 外部サービス統合層の実装

- [ ] 5. Gemini API統合サービスの実装
- [ ] 5.1 Gemini APIサービスのモックとテストを作成
  - `src/services/__tests__/geminiService.test.ts`を作成
  - 動画解析、要約生成、クォータチェックのテストケースを記述
  - APIエラーとタイムアウトのハンドリングテスト
  - _Requirements: 2.1, 2.4, 2.5, 3.1_

- [ ] 5.2 Gemini APIサービスの実装
  - `src/services/geminiService.ts`にGeminiServiceクラスを実装
  - 環境変数からAPIキーを読み込む設定
  - analyzeVideo、generateSummary、checkQuotaStatusメソッドを実装
  - YouTube URL形式でのfile_data送信を実装
  - _Requirements: 2.1, 2.4, 2.5, 3.1, 3.2, 3.3, 3.4_

- [ ] 6. Redisキャッシュサービスの実装
- [ ] 6.1 キャッシュサービスのテストを作成
  - `src/services/__tests__/cacheService.test.ts`を作成
  - get、set、invalidateメソッドのテストケースを記述
  - TTL設定とキー生成のテスト
  - _Requirements: 6.4_

- [ ] 6.2 Redisキャッシュサービスの実装
  - `src/services/cacheService.ts`にCacheServiceクラスを実装
  - Upstash Redisクライアントの初期化
  - 動画IDベースのキー生成とTTL管理
  - シリアライズ/デシリアライズ処理の実装
  - _Requirements: 6.4_

## API層の実装

- [ ] 7. Next.js API Routesの実装
- [ ] 7.1 要約生成APIエンドポイントのテストを作成
  - `src/app/api/summarize/__tests__/route.test.ts`を作成
  - POST /api/summarizeの成功・失敗ケースのテスト
  - キャッシュヒット/ミスのシナリオテスト
  - _Requirements: 2.1, 3.1, 6.4_

- [ ] 7.2 要約生成APIエンドポイントの実装
  - `src/app/api/summarize/route.ts`にPOSTハンドラーを実装
  - URLバリデーション、キャッシュチェック、Gemini API呼び出しの統合
  - エラーハンドリングミドルウェアの適用
  - レート制限の実装
  - _Requirements: 1.1, 2.1, 3.1, 4.1, 4.2, 6.4_

- [ ] 8. WebSocket進捗通知サービスの実装
- [ ] 8.1 WebSocketサーバーの設定
  - `src/lib/socketServer.ts`にSocket.ioサーバーを設定
  - Next.jsのカスタムサーバー設定を追加
  - セッション管理とルーム機能の実装
  - _Requirements: 2.2_

- [ ] 8.2 進捗通知サービスの実装
  - `src/services/progressService.ts`にProgressServiceクラスを実装
  - notifyProgress、createSession、closeSessionメソッドを実装
  - フロントエンドとの通信プロトコルを定義
  - _Requirements: 2.2_

## フロントエンドコンポーネントの実装

- [ ] 9. 基礎UIコンポーネントの実装
- [ ] 9.1 共通UIコンポーネントのテストを作成
  - `src/components/__tests__`に各コンポーネントのテストを作成
  - Button、Input、LoadingSpinner、ErrorMessageのテスト
  - ユーザーインタラクションとアクセシビリティのテスト
  - _Requirements: 5.1, 5.5_

- [ ] 9.2 共通UIコンポーネントの実装
  - `src/components/ui`ディレクトリに基本コンポーネントを作成
  - Tailwind CSSを使用したスタイリング
  - アクセシビリティ属性（ARIA）の追加
  - レスポンシブデザインの実装
  - _Requirements: 5.1, 5.3, 5.4, 5.5_

- [ ] 10. URL入力フォームコンポーネントの実装
- [ ] 10.1 URLInputFormコンポーネントのテストを作成
  - `src/components/__tests__/URLInputForm.test.tsx`を作成
  - URL入力、バリデーション、送信のテストケース
  - エラー表示とクリア機能のテスト
  - _Requirements: 1.1, 1.2, 1.3, 1.4_

- [ ] 10.2 URLInputFormコンポーネントの実装
  - `src/components/URLInputForm.tsx`を作成
  - React Hook Formを使用したフォーム管理
  - リアルタイムバリデーションの実装
  - エラーメッセージの日本語表示
  - _Requirements: 1.1, 1.2, 1.3, 1.4, 5.1_

- [ ] 11. 要約表示コンポーネントの実装
- [ ] 11.1 SummaryDisplayコンポーネントのテストを作成
  - `src/components/__tests__/SummaryDisplay.test.tsx`を作成
  - 要約データの表示、構造化表示のテスト
  - コピー機能とローディング状態のテスト
  - _Requirements: 3.4, 3.5_

- [ ] 11.2 SummaryDisplayコンポーネントの実装
  - `src/components/SummaryDisplay.tsx`を作成
  - 要約、トピック、キーポイント、結論の構造化表示
  - クリップボードコピー機能の実装
  - @tailwindcss/typographyを使用した読みやすい表示
  - _Requirements: 3.4, 3.5, 5.3_

- [ ] 12. 進捗表示コンポーネントの実装
- [ ] 12.1 ProgressIndicatorコンポーネントのテストを作成
  - `src/components/__tests__/ProgressIndicator.test.tsx`を作成
  - 進捗率表示、推定時間表示のテスト
  - WebSocket接続とメッセージ受信のテスト
  - _Requirements: 2.2, 6.3_

- [ ] 12.2 ProgressIndicatorコンポーネントの実装
  - `src/components/ProgressIndicator.tsx`を作成
  - Socket.ioクライアントの統合
  - プログレスバーとステータスメッセージの表示
  - 推定完了時間の計算と表示
  - _Requirements: 2.2, 5.2, 6.3_

## 状態管理とフック実装

- [ ] 13. Zustand状態管理の実装
- [ ] 13.1 アプリケーション状態ストアの作成
  - `src/store/appStore.ts`にZustandストアを定義
  - 処理状態、エラー、要約データの管理
  - WebSocket接続状態の管理
  - _Requirements: 全体的な状態管理_

- [ ] 13.2 カスタムフックの実装
  - `src/hooks/useSummarize.ts`で要約処理のロジックを統合
  - `src/hooks/useWebSocket.ts`でWebSocket接続を管理
  - `src/hooks/useClipboard.ts`でコピー機能を提供
  - _Requirements: 機能統合_

## メインアプリケーションの統合

- [ ] 14. ホームページの実装と全体統合
- [ ] 14.1 メインページのテストを作成
  - `src/app/__tests__/page.test.tsx`を作成
  - 完全なユーザーフローのテスト
  - コンポーネント間の連携テスト
  - _Requirements: 統合テスト_

- [ ] 14.2 メインページの実装
  - `src/app/page.tsx`にホームページを実装
  - 全コンポーネントの統合
  - レイアウトとヘッダー/フッターの追加
  - エラーバウンダリーの設定
  - _Requirements: 全要件の統合_

- [ ] 15. E2Eテストの実装
- [ ] 15.1 Playwrightの設定とE2Eテストの作成
  - `playwright.config.ts`を設定
  - `e2e/summarize.spec.ts`に完全なフローのテストを記述
  - URL入力→進捗表示→要約表示→コピーの全工程をテスト
  - エラーケースとリトライのテスト
  - _Requirements: 1.1-6.5の統合検証_

- [ ] 15.2 パフォーマンステストの実装
  - `e2e/performance.spec.ts`にパフォーマンステストを記述
  - 応答時間の測定（キャッシュヒット/ミス）
  - 同時接続のテスト
  - _Requirements: 6.1, 6.2, 6.5_