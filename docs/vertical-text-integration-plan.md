# 縦書きセリフ画像レンダリング 統合プラン

目的: 既存のページレンダリング（node-canvas）において、キャラクターのセリフ（dialogue）を外部の縦書きテキスト画像生成APIで描画し、縦書き吹き出しとして配置できるようにする。

このドキュメントは実装前の設計プランです。URLやトークンなどの秘密情報は `.env` のみで管理し、コードやドキュメントには記載しません。

## 要約（スコープと非スコープ）

- スコープ
  - 外部APIクライアントの追加（セリフ文字列→縦書きPNGの生成）
  - Mangaページレンダリング時に dialogue テキストを横書き描画から「縦書き画像の貼り付け」に切替
  - 吹き出し矩形のレイアウト調整（画像サイズに基づく）
  - レンダリング失敗の明示的エラー化（フォールバック禁止）
  - 単体/統合テストと簡易キャッシュ（同一テキストの再利用）
- 非スコープ
  - DBスキーマ変更（現状は不要）
  - 本番デプロイ設定やCI最適化の大規模変更
  - レイアウトアルゴリズムの抜本的刷新

## 参照: 外部API 仕様（要点のみ）

- エンドポイント: POST `/render`
- 認証: Bearer トークン（`.env` 管理）
- リクエスト例（主要パラメータ）:
  - `text: string`（縦書き化対象）
  - `font_size?: number`（例: 20〜24）
  - `line_height?: number`（例: 1.4〜1.8）
  - `letter_spacing?: number`（例: 0.0〜0.1）
  - `padding?: number`（画像内余白）
  - `max_chars_per_line?: number`（縦中横・改行最適化の目安）
- レスポンス:
  - `image_base64: string`（PNG/透明背景）
  - `width: number`, `height: number`
  - `processing_time_ms: number`, `trimmed: boolean`

## 統合ポイント（現状のレンダリングフロー）

- `src/app/api/render/route.ts` → `renderBatchFromYaml` を呼出
- `src/services/application/render.ts` → `MangaPageRenderer.renderToImage` を実行
- `src/lib/canvas/manga-page-renderer.ts` → `CanvasRenderer` と `SpeechBubblePlacer` により描画
- 現状の `CanvasRenderer.drawSpeechBubble` は横書きテキスト行を計測・描画

本統合では、Dialogue描画経路を以下に置換/拡張します:

1. Dialogue文字列ごとに外部APIを呼び出し、透明PNGと寸法を取得
2. 取得画像を node-canvas の `Image` 化して `ctx.drawImage` で貼付
3. 吹き出し枠（角丸矩形）を画像サイズに基づいて調整（padding考慮）
4. エラー時はそのページのレンダリングを失敗として停止・記録（フォールバック禁止）

## 設計方針

### 1. サービス層と型

- 追加ファイル（案）
  - `src/services/vertical-text-client.ts`
  - `src/types/vertical-text.ts`
  - `src/utils/cache/lru.ts`（簡易LRUが無ければ）
- 型（厳密/No any）
  - `VerticalTextRenderRequest`: { text: string; fontSize?: number; lineHeight?: number; letterSpacing?: number; padding?: number; maxCharsPerLine?: number }
  - `VerticalTextRenderResponse`: { imageBase64: string; width: number; height: number; processingTimeMs?: number; trimmed?: boolean }
  - Zod でスキーマを定義し、入出力検証を実施
- クライアント
  - `renderVerticalText(req)` を公開
  - 認証: `Authorization: Bearer <token>`（`.env` 参照）
  - タイムアウト/リトライ（軽微）: appConfig.api.timeout.pageRender を上限目安に
  - ログ: 失敗時のみメッセージ（URL/トークンはログしない）

### 2. 設定/環境変数

- `.env`（既に設定済み）を読み込むためのキー名（案）
  - `VERTICAL_TEXT_API_URL`
  - `VERTICAL_TEXT_API_TOKEN`
- `src/config/app.config.ts` へ feature flag を追加（案）
  - `rendering.verticalText.enabled: boolean`（デフォルト true）
  - `rendering.verticalText.defaults: { fontSize: number; lineHeight: number; letterSpacing: number; padding: number; maxCharsPerLine: number }`
- `.env.example` はプレースホルダのみ追加（URL/Token の実値は記載しない）

### 3. 描画フローの拡張

- `MangaPageRenderer` に「Dialogueの前処理フェーズ」を追加（サーバー描画のみ対象）
  - 対象ページの dialogue[] を走査 → 文字列ごとに `vertical-text-client` で画像取得
  - 画像は `CanvasRenderer` に渡すため、`PreparedDialogueAsset` を作成
    - { text, emotion, image: Image, width, height, layoutHint? }
  - 簡易LRUキャッシュ（キー: text + パラメータ）でAPI負荷を低減
- `CanvasRenderer.drawSpeechBubble` の責務分割
  - A) ラベル: `drawSpeechBubbleText()`（既存の横書き）
  - B) 新規: `drawSpeechBubbleVerticalImage()`（縦書き画像）
  - Feature flag が有効かつ `PreparedDialogueAsset` がある場合は B を採用
- 吹き出しサイズ計算
  - 画像サイズ + 内側padding（画像生成時の padding + 吹き出し余白）から枠サイズを決定
  - テール（尾）描画ロジックは現状維持

### 4. エラー処理（フォールバック禁止）

- API失敗・検証失敗・デコード失敗のいずれも、その Dialogue を含むページのレンダリングを `failed` とする
- `renderBatchFromYaml` の `renderPage` 内で例外を握りつぶさず、`results` に `failed` を記録
- UIへの戻り値は既存どおり（ページ単位の失敗を反映）

### 5. テスト戦略

- 単体テスト（Vitest, `src/__tests__`）
  - `vertical-text-client` の入出力検証（fetch をモック）
  - 画像Base64→Buffer→Image 変換の正常/異常系
  - CanvasRenderer の分岐（縦書き画像を使う経路）が呼ばれること
- 統合テスト（Vitest integration, `tests/integration`）
  - `renderBatchFromYaml` に対し、縦書きAPIをモックしつつ 1ページの成功/失敗を検証
  - 失敗時にフォールバックしないことを確認
- E2E（Playwright）
  - 主要フロー（1ページレンダ→サムネ作成）でモックAPIを経由し成功すること

### 6. パフォーマンス/キャッシュ

- 同一テキストの重複呼び出しをLRUで抑制（容量/TTLは控えめ）
- バッチ内並列数（concurrency）に対し、縦書きAPIのレートを考慮
  - 必要に応じて `app.config.ts` に `rendering.verticalText.maxConcurrent` を追加

### 7. セキュリティ/運用

- URL/Token は `.env` のみ。ログ出力はエラー概要とtrace id程度に限定
- タイムアウト・リトライは控えめ（過剰再試行を避ける）
- 将来のR2キャッシュ（縦書き画像の永続化）は別タスク（本プラン外）

## 実装タスク分解

1. 型とクライアント

- `src/types/vertical-text.ts` に Zod スキーマと型を定義
- `src/services/vertical-text-client.ts` に API呼び出し実装（env参照、タイムアウト）

2. レンダリング統合

- `MangaPageRenderer.renderToCanvas()` 前に Dialogue アセット準備フェーズを追加
- `CanvasRenderer` を拡張し、縦書き画像描画APIを追加（既存関数は保持）
- 画像貼付にあわせて吹き出し枠サイズと位置を微調整

3. 設定とFeature Flag

- `app.config.ts` に `rendering.verticalText` セクション追加
- `.env.example` にプレースホルダを追加（実値は記載しない）

4. テスト

- 単体/統合/E2Eのテストケースを追加・更新

5. ドキュメント/タスク

- `.kiro/specs/novel-to-manga-converter/design.md` にアーキ更新
- `.kiro/specs/novel-to-manga-converter/tasks.md` にタスク進捗/受入条件を追記

## 受入基準（Acceptance Criteria）

- Dialogueテキストが横書きではなく縦書き画像で描画される
- 画像は透明背景で吹き出し内に正しく収まる（はみ出しなし）
- API失敗時は当該ページが失敗として記録され、フォールバックは行わない
- 単体/統合/E2Eテストが通過し、lint/format/型チェックがクリーン
- Secrets/URLはコード/ログ/PRに露出しない

## リスクと対策

- 外部APIの遅延/失敗: タイムアウトと軽めのリトライ、並列数制御、キャッシュ
- 画像サイズ過大: `max_chars_per_line`/`font_size`/`padding` の既定値で調整
- node-canvasのImage生成失敗: Base64検証と失敗時の即時エラー化

## ロードマップ（実装順）

1. 型/クライアント/設定（Feature Flag 含む）
2. Dialogueアセット準備フェーズ + Canvas拡張（縦書き画像描画）
3. 最小テスト（ユニット）→ 統合 → E2E（モック）
4. ドキュメント/タスク更新、プルリク作成

以上。
