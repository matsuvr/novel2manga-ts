# 設計書：Gemini（Vertex AI 含む）トークン計測・表示機能

公式ドキュメント `docs/gemini-underdtand-tokens-count.md` も参照して下さい。

## 1. 目的・背景

- 目的：Gemini API / Vertex AI 利用時に、**入力・出力・合計トークン数**（必要に応じて **思考トークン**・**キャッシュ**内訳）を
  ①送信前（見積り）、②生成中（暫定）、③生成完了後（確定）で取得・表示する。
- 根拠：
  - 送信前の見積り：`models.countTokens` を使う（**入力のみ**の合計を返す）。
  - 応答後の確定値：`generateContent` / `streamGenerateContent` のレスポンス `usageMetadata` を読む（**入出力内訳と合計**、思考モデルなら `thoughtsTokenCount`、キャッシュ利用時は `cachedContentTokenCount`）。

## 2. 対応範囲 / 非対象

- 対応：Node/TS（`@google/genai`）を基準。Python / Go は同等の API で呼び出し層を用意。
- Vertex AI：**同一 SDK** で環境変数による切替（例：`GOOGLE_GENAI_USE_VERTEXAI=True`、`GOOGLE_CLOUD_PROJECT`、`GOOGLE_CLOUD_LOCATION`）。
- 非対象：料金の自動取得・換算（コスト表示は任意の「概算」機能として内部設定で算出）。

## 3. 用語と計測ルール（UIへの反映方針）

- `promptTokenCount`＝入力、`candidatesTokenCount`＝出力、`totalTokenCount`＝合計。
- `cachedContentTokenCount`＝コンテキストキャッシュ利用時のカウント。
- `thoughtsTokenCount`＝思考系モデル（2.5 系等）使用時の思考トークン。
- マルチモーダルの概算ルール（UI ツールチップで説明・事前見積りの参考にする）：
  - 画像：短辺長辺ともに ≤384px で 258 tokens。超える場合は 768×768 タイル単位で各 258 tokens。
  - 動画：263 tokens/秒、音声：32 tokens/秒。
  - ※確定値は `countTokens` / `usageMetadata` を**常に優先**。

## 4. アーキテクチャ / 構成

- **呼び出しラッパ**：`TokenMeter`（共通モジュール）
  - `preflight(contents|request)` → `{ inputTokens }`（= `countTokens.totalTokens`）
  - `finalize(response)` → `{ promptTokenCount, candidatesTokenCount, totalTokenCount, cachedContentTokenCount?, thoughtsTokenCount?, details? }`

- **送信フロー**
  1. 送信直前：`countTokens` 実行 → 入力見積りを UI 表示
  2. 生成実行：`generateContent` または `streamGenerateContent`
  3. 完了：レスポンスの `usageMetadata` 読取 → UI を**確定値**に更新
  4. チャット：`history + nextUserMessage` を `countTokens` に渡して次ターンの見積り

- **依存**：SDK 初期化、認証情報、ファイルアップロード機構（画像/動画/音声の場合）

## 5. データモデル（共通型）

```ts
// TypeScript 想定。Python/Go も同等のフィールドを持つ辞書/構造体で統一。
type TokenPreflight = {
  inputTokens: number // countTokens.totalTokens
  note?: string // 概算フォールバック時の注記など
}

type TokenUsage = {
  promptTokenCount: number // 入力
  candidatesTokenCount: number // 出力
  totalTokenCount: number // 合計
  cachedContentTokenCount?: number // キャッシュ
  thoughtsTokenCount?: number // 思考トークン（thinkingモデル）
  promptTokensDetails?: any // 任意: モダリティ内訳等
  candidatesTokensDetails?: any
}
```

## 6. インターフェース仕様（Node/TS 基準）

```ts
export interface ITokenMeter {
  preflight(contentsOrRequest: string | any[] | Record<string, any>): Promise<TokenPreflight>
  finalize(generateContentResponse: any): TokenUsage
}

export class TokenMeter implements ITokenMeter {
  constructor(opts?: { model?: string; apiKey?: string })
  preflight(contentsOrRequest: string | any[] | Record<string, any>): Promise<TokenPreflight>
  finalize(resp: any): TokenUsage
}
```

- `contentsOrRequest`：`contents` 形式（文字列 / parts 配列）または generateContentRequest 丸ごと。
- Vertex 切替時も同じ呼び出し（初期化パラメータで切替）。
- ストリーミング：**集約レスポンス**から `usageMetadata` を読む。

### 参考コード（極小・擬似）

```ts
const meter = new TokenMeter({ model: 'gemini-2.5-flash' })
const { inputTokens } = await meter.preflight(contents) // 送信前見積り
const resp = await ai.models.generateContent({ model: 'gemini-2.5-flash', contents })
const usage = meter.finalize(resp) // 応答後確定
```

## 7. UI 仕様（最低要件）

- **送信前（入力欄付近）**：「入力トークン見積り：N」
  - ツールチップ：画像/動画/音声の概算ルール、確定値は完了後に表示されること。

- **ストリーミング中**：プレースホルダ下部に「入力見積り：N（暫定）」を表示。
- **完了後（結果ページ）**：
  - 「入力：X｜出力：Y｜合計：Z」
  - 任意表示：「思考：A」「キャッシュ：B」「モダリティ内訳」
  - 任意で「概算コスト（設定テーブル×トークン）」を別行で表示（※「概算」バッジ必須）。

## 8. エラー処理 / フォールバック

- `countTokens` 失敗：言語に応じた概算を使用
  - 英語：**4 文字 ≒ 1 token**
  - 日本語：**1 文字 ≒ 1 token**（日本語/中国語/韓国語などのCJK言語）
  - 混合テキスト：言語検出またはデフォルトで日本語基準を使用
- UI に **「概算」バッジ**を表示。完了後に確定値へ差し替え。
- `usageMetadata` 欠落（レアケース）：最終集約レスを待って再取得。最終的に得られない場合は「確定値なし」表示＋サーバーログ。

## 9. テレメトリ / ロギング

- 送信前イベント：`tokens_preflight`（model, inputTokens, payloadHash, latency）
- 送信後イベント：`tokens_final`（model, promptTokenCount, candidatesTokenCount, totalTokenCount, cached/thoughts, latency, streamed）
- PII/機密は送らない（ハッシュ化/統計化）。

## 10. 設定・環境変数

- `GEMINI_API_KEY`（Google AI）／またはサービスアカウント（Vertex）
- `GOOGLE_GENAI_USE_VERTEXAI`（true/false）
- `GOOGLE_CLOUD_PROJECT`, `GOOGLE_CLOUD_LOCATION`（Vertex）
- `MODEL_ID` 既定：`gemini-2.5-flash`（変更可能）

## 11. テスト観点（受け入れ）

- テキスト単発／チャット履歴＋次発話／画像1枚（≤384px, >384px）／動画（短尺）／音声
- 思考モデルで `thoughtsTokenCount` が出ること
- キャッシュ利用時に `cachedContentTokenCount` が反映されること
- ストリーミング完了時に確定値へ差し替えられること
- `countTokens` ダウン時の概算フォールバック表示

## 12. ロールアウト

- 機能フラグ `feature.tokens.enabled` で段階展開
- 検証環境 → ステージング → 本番。メトリクス監視（平均/95p 応答遅延・エラー率）。

---

# チェックボックス付きタスク表（依存関係つき）

> **記号**：
> 依存＝「このタスクの前に完了している必要があるタスクID」
> 成果物＝PR/モジュール/画面などの具体物

| チェック | ID       | タスク                           | 目的/概要                                           | 依存             | 成果物                         |
| -------- | -------- | -------------------------------- | --------------------------------------------------- | ---------------- | ------------------------------ |
| ☐        | **T-01** | SDK/認証の下準備                 | `@google/genai` 導入、APIキー/Vertex 環境の切替実装 | なし             | SDK 設定差分、ENV ドキュメント |
| ☐        | **T-02** | モデルID/設定の抽象化            | `MODEL_ID`、Vertex 切替を設定化                     | T-01             | `config/model.ts`              |
| ☐        | **T-03** | `TokenMeter` 実装（preflight）   | `countTokens` をラップ、`inputTokens` 返却          | T-01, T-02       | `pkg/tokens/tokenMeter.ts`     |
| ☐        | **T-04** | `TokenMeter` 実装（finalize）    | `usageMetadata` を正規化して返却                    | T-03             | 同上（ finalize ）             |
| ☐        | **T-05** | 送信フロー統合（非ストリーム）   | 送信前見積り→生成→確定反映                          | T-03, T-04       | サービス層 PR                  |
| ☐        | **T-06** | 送信フロー統合（ストリーミング） | 集約レスから `usageMetadata` 取得                   | T-03, T-04       | サービス層 PR                  |
| ☐        | **T-07** | チャット履歴見積り               | `history + nextUserMessage` で `countTokens`        | T-03             | チャットサービス PR            |
| ☐        | **T-08** | マルチモーダル前処理             | 画像/動画/音声のアップロード→contents化             | T-01             | メディア層 PR                  |
| ☐        | **T-09** | UI：送信前の見積り表示           | 入力欄近くに「入力見積り：N」                       | T-05             | フロント PR                    |
| ☐        | **T-10** | UI：ツールチップ（概算ルール）   | 画像=258/タイル、動画=263/秒、音声=32/秒            | T-09             | フロント PR                    |
| ☐        | **T-11** | UI：結果ページの確定値表示       | 入力・出力・合計／思考／キャッシュ表示              | T-05 or T-06     | フロント PR                    |
| ☐        | **T-12** | UI：ストリーム暫定→確定差替え    | 進行中は暫定、完了で確定に置換                      | T-06, T-11       | フロント PR                    |
| ☐        | **T-13** | エラー時フォールバック           | `countTokens` 失敗時の概算表示                      | T-05             | サービス＋UI PR                |
| ☐        | **T-14** | テレメトリ埋め込み               | preflight/final のイベント送信                      | T-05, T-06       | 監視ダッシュボード             |
| ☐        | **T-15** | ユニットテスト                   | TokenMeter/サービスの単体                           | T-03, T-04       | テストコード                   |
| ☐        | **T-16** | E2Eテスト                        | テキスト/画像/動画/チャット/思考/キャッシュ         | T-08, T-11, T-12 | E2E スイート                   |
| ☐        | **T-17** | ドキュメント                     | 使い方、環境変数、制限、既知の注意点                | T-11, T-13       | README / Runbook               |
| ☐        | **T-18** | フラグ/ロールアウト              | `feature.tokens.enabled` 導入                       | T-11, T-14       | リリース手順書                 |

### 実装順のガイド（依存の要約）

1. T-01 → T-02 → T-03 → T-04
2. 送信フロー：T-05（非ストリーム）／T-06（ストリーム）→ T-09, T-11, T-12
3. 補助：T-07（チャット）、T-08（マルチモーダル）、T-10（ツールチップ）、T-13（フォールバック）
4. 品質：T-14（テレメトリ）、T-15, T-16（テスト）→ T-17（Docs）→ T-18（ロールアウト）

---

## コーディングAI向け補足指示（重要ポイントのみ）

- **必ず** 送信前に `countTokens` を実行し、その戻り値（`totalTokens`）を UI に表示する。
- 生成完了時は `usageMetadata` から **入力/出力/合計**を読み取り UI を確定表示に更新。
- ストリーミングでは **最終集約レスポンス**で `usageMetadata` を取得する実装にする。
- チャットの見積りは **履歴＋次発話**を `countTokens` に渡す。
- 画像/動画/音声は概算ルールを**ツールチップ**で提示。確定は API の値を優先。
- `countTokens` 失敗時は **4文字≒1トークン**の概算で表示し、「概算」バッジを付ける。完了後の確定値で必ず置換。
- Vertex/Google AI の両モードで動くよう、**初期化時の切替**と**環境変数**を必ず実装。

必要なら、この表を GitHub Issue テンプレ（チェックボックス付き）に落とし込むフォーマットでも出せます。
