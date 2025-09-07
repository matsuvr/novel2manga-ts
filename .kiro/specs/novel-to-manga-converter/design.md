# 新しいLLMエージェントアーキテクチャ

## 概要

このドキュメントは、LLMエージェントの実装を簡素化し、プロバイダー非依存で、決定論的テストが可能で、厳密な型安全性を提供する新しいアーキテクチャについて説明します。
本システムは OpenNext の Node.js ランタイムを前提とし、API ルートから冗長な `export const runtime` 宣言を排除しています。

## アーキテクチャの利点

### 1. エージェントの簡素化

- `base-agent.ts`と`agent.ts`を小さな合成可能なコアに統合
- 単一のパブリックAPI（`AgentCore.run`）
- 責任の明確な分離

### 2. プロバイダー非依存

- サービスはインターフェースに依存し、具体的なLLMに依存しない
- DI/設定によるプロバイダー切り替え
- フォールバック機能（LLMサーバーエラー時のみ）
- 現在の既定プロバイダーは Vertex AI Gemini 2.5 Flash。スクリプト変換とエピソード検出では Gemini 2.5 Pro を使用

### 3. 決定論的テスト

- 安定したFake/Mock LLM
- 薄いアダプター契約テスト
- 少ない可動部分

### 4. 厳密な型安全性

- ゼロ`any`、サイレント`ts-ignore`なし
- JSON-schema型付きツール
- スキーマ一貫性: dialogue配列はoptionalだが、要素が存在する場合はspeakerとtextは両方必須

## ディレクトリ構造

```
src/
├── llm/
│   ├── client.ts              # LlmClientインターフェース
│   ├── providers/
│   │   ├── openai.ts          # OpenAI実装
│   │   ├── cerebras.ts        # Cerebras実装
│   │   ├── gemini.ts          # Gemini実装
│   │   └── fake.ts            # テスト用Fake実装
│   └── index.ts               # ファクトリー関数
├── agent/
│   ├── core.ts                # AgentCoreクラス
│   ├── types.ts               # 型定義
│   ├── policies/
│   │   ├── singleTurn.ts      # 単一ターンポリシー
│   │   └── react.ts           # ReActポリシー
│   ├── tools.ts               # ツールシステム
│   ├── compat.ts              # 後方互換性レイヤー
│   └── index.ts               # エクスポート
└── services/                  # サービス層（DI経由で使用）
    └── application/
        └── health-check.ts    # APIヘルスチェックのビジネスロジック（DB/Storageを軽量 probe）
```

## 出力ストレージ設計

- 変換結果は Cloudflare R2 に保存し、ユーザー単位のパス `results/{userId}/{jobId}.{format}` を採用
- 保存パスとメタ情報を D1 の `outputs` テーブルに記録し、ダウンロード URL 生成に利用

## パブリックAPI

### LlmClient

```typescript
interface LlmClient {
  chat(messages: LlmMessage[], options?: LlmClientOptions): Promise<LlmResponse>
  stream(messages: LlmMessage[], options?: LlmClientOptions): Promise<LlmStreamResponse>
  embeddings?(input: string, options?: LlmClientOptions): Promise<LlmEmbeddingResponse>
}
```

### AgentCore

```typescript
class AgentCore {
  run(input: AgentInput, options?: AgentOptions): Promise<AgentResult>
  setPolicy(policy: AgentPolicy): void
  registerTool(tool: Tool): void
  getTool(name: string): Tool | undefined
}
```

### Tool

```typescript
interface Tool {
  name: string
  description: string
  schema: z.ZodSchema
  handle(args: unknown, context: ToolContext): Promise<ToolResult>
}
```

## 使用例

### 基本的な使用

```typescript
import { AgentCoreFactory } from '@/agents/core'
import { createLlmClientFromConfig } from '@/llm'

const llmClient = createLlmClientFromConfig()
const agent = AgentCoreFactory.create({ llmClient })

const result = await agent.run({
  messages: [{ role: 'user', content: 'こんにちは' }],
})
```

## ランタイム進捗同期（SSE）

- Next.js App Router + OpenNext(Cloudflare Workers)でのSSE連携を採用。
- バックエンド: `/api/jobs/[jobId]/events` が `ReadableStream` を用いて `text/event-stream` を配信。
- フロントエンド: `EventSource` で購読し、ジョブ状態・ページ描画進捗・エピソード単位のページ内訳を反映。
- UIの重複判定は `processingPage/processingEpisode` と per-episode の要約（件数・rendered合計）も監視し、
  「ページ番号のまま止まって見える」事象を防止。
- パイプラインではエピソード境界推定の期間に `currentStep=episode` を明示し、完了時に `episodeCompleted` を更新。
  これにより「エピソード構成がスキップに見える」問題を解消。

### トークン使用量の記録と表示（2025-09 追加）

- すべてのLLM呼び出しで、入出力トークンを `token_usage` テーブルに記録（`jobId`/`agentName`/`provider`/`model`/`promptTokens`/`completionTokens`）。
- 結果ページでは、モデル別に「<provider> <model> 入力Xトークン・出力Yトークン」を一覧表示。
- 進捗画面では、完了済み呼び出しの累積として「現在 入力X/出力Y トークン消費中…」を定期更新（間隔は `app.config.ts` にて一元管理）。

### 進捗ページの永続URL（復帰性の担保）

- novelId 発行後は、進捗表示を `/novel/{novelId}/progress` のユニークURLで提供する。
- ユーザーがブラウザの戻る/再読み込みを行っても、同URLに戻ればフロントエンドが `/api/resume` を呼び出し、
  対応する最新ジョブの `jobId` を取得・再開し、SSEを再接続する。
- SSEの一時的切断は `onerror` で警告ログのみを記録し、`EventSource` の自動再接続に任せて処理を継続する。
  これにより、フロントエンド由来の一時的エラーで全処理が停止することを防止する。

### ログ設計（開発体験の改善）

- コンソール出力は環境変数 `LOG_CONSOLE_LEVEL` で最小レベルを制御（`debug|info|warn|error`）。
  既定は `warn`。大量アクセス時もコンソールは静かで、`dev.log` に全レベルの詳細が記録される。
  例: `LOG_CONSOLE_LEVEL=warn npm run dev`。

### ツール付きの使用

```typescript
import { AgentCoreFactory } from '@/agents/core'
import { ReActPolicy } from '@/agents/policies/react'
import { ToolFactory } from '@/agents/tools'

const agent = AgentCoreFactory.create({
  llmClient: createLlmClientFromConfig(),
  policy: new ReActPolicy(),
})

// ツールを登録
const calculator = ToolFactory.create({
  name: 'calculator',
  description: '数式を計算します',
  schema: z.object({ expression: z.string() }),
  handle: async ({ expression }) => {
    return { result: eval(expression) }
  },
})

agent.registerTool(calculator)

const result = await agent.run({
  messages: [{ role: 'user', content: '2 + 2を計算してください' }],
})
```

## テスト戦略

### ユニットテスト

- `FakeLlmClient`による決定論的テスト
- エージェントポリシーのユニットテスト
- ツールスキーマ検証テスト

### 契約テスト

- 各`providers/*`に対する共有アダプターテスト
- 同じプロンプトで形状を検証

### 統合テスト

- サービスレベルのテスト（FakeLlm使用）
- ネットワーク不要
- ドメイン出力を検証

### E2Eテスト

- 最小限のフロー（1つの実際のプロバイダー）
- 決定論的パス
- CIではfakeをデフォルト使用
- レンダリングAPI経由で生成ページを取得するシナリオを追加

## パイプライン・ガードレール（2025-08-28 追加）

- 空scriptの早期失敗: チャンク台本化（chunk-script-step）で `script.scenes.length === 0` の場合は保存せずに即時エラーとし、後続へ進めない。
- マージ時0シーン禁止: 結合処理（script-merge-step）で全チャンクから収集したシーン数が0なら `script_combined.json` を保存せずエラー。
- 簡易サマリ保存: `script_chunk_{i}.json` 保存時に `script_chunk_{i}.summary.json` を併置（scenes数、先頭シーンの行数、テキストプレビュー）。
- 目的: 曖昧な中間成果物を排し、原因箇所を特定可能にする。LLM出力が空の場合はそこで停止し、ログとサマリで診断容易性を高める。

## 端数吸収ポリシー（2025-08-28 追加）

- チャンク分割後: 末尾チャンクが `minChunkSize` 未満なら直前チャンクへ連結。オーバーラップ重複を避けるため、原文から再スライスして結合。
- エピソード束ね後: 末尾エピソードが最小目安（20p）未満なら直前エピソードに吸収。
- 実ページ数基準の最終統合（2025-09-05 追加）: ページ割り確定後（PageBreakStep）、各エピソードの実ページ数を計測し、`app.config.ts > episodeBundling.minPageCount` 未満は次話へ順次統合（連鎖統合可）。最終話が閾値未満の場合は直前話に統合する。
- 目的: 機械的な閾値エラーで停止せず、自然な分割単位に収束させる。

## 設定

### 吹き出し文字組（2025-09-02 追加）

– 1吹き出しの最大文字数を50に統一（`app.config.ts > scriptConstraints.dialogue.maxCharsPerBubble`）。
– Script Conversionの直後に自動ポストプロセスを適用し、上限超過の発話はパネル分割で処理。
– 分割により増えた2コマ目以降の`cut`は「前のコマを引き継ぐ」を使用し、`camera`や`importance`は元パネルを継承。
– 対象は `speech`/`thought`/`narration`（設定 `applyToTypes` で制御）。

### エピソード長制約（2025-09-05 追加）

– 1エピソードの最大コマ数は `app.config.ts > processing.episode.maxPanelsPerEpisode` で設定（デフォルト1000）。

- 以前は50に固定していたが、長編入力でエピソードが過剰に細分化され文脈が失われていたため大幅に引き上げた。
- 1000はおおよそ200ページ相当であり、LLM処理とメモリ消費の範囲内で最大規模をカバーする上限として設定。
- 実際の配信単位はエピソード束ね処理で `episodeBundling.minPageCount` 未満のものを統合するため、リソース使用は制御される。
  – 小規模スクリプト閾値や最小コマ数も同セクションに集約し、エピソード分割とバリデーションで参照。
  – テスト環境では `getEpisodeConfig` モックにこれらの閾値を明示し、欠落による NaN バリデーションエラーを防止。

## データベースアクセス層の抽象化（2025-09-04 追加）

- 目的: better-sqlite3（同期）と Cloudflare D1（非同期）の差異をアダプタ層で吸収し、業務ロジックから同期/非同期分岐を排除。
- 主要コンポーネント:
  - `src/infrastructure/database/adapters/base-adapter.ts`: `DatabaseAdapter` 抽象クラス（`transaction`/`runSync`/`isSync`）。
  - `src/infrastructure/database/adapters/sqlite-adapter.ts`: Drizzle + better-sqlite3 用の同期アダプタ。同期 `transaction` を提供。非同期コールバックは明示エラーで拒否。
  - `src/infrastructure/database/adapters/d1-adapter.ts`: Cloudflare D1 用の非同期アダプタ。`transaction` はコールバックを await。原子性は D1 の `batch()` 利用を前提とし、隠蔽フォールバックは実装しない。
  - `src/infrastructure/database/connection.ts`: 接続生成とアダプタ自動判定（D1-like なら D1Adapter、それ以外は SqliteAdapter）。

- 設計上の制約:
  - フォールバック禁止: 非同期トランザクションを擬似的に同期化しない。better-sqlite3 のトランザクション内で `async` を投げると明示的に失敗させる。
  - 型安全: `any` 不使用。D1 は `@cloudflare/workers-types` の `D1Database` を参照。
  - テスト: アダプタはユニットテストで契約を検証（同期/非同期、エラー動作）。

### 実装インパクト（Phase 1）

- God Object（`src/services/database.ts`）の段階的移行前提で、まず同期/非同期境界をアダプタで確立。
- 既存の Drizzle（better-sqlite3）パスは動作維持。Workers/D1 導入時は `createDatabaseConnection({ d1 })` で切替可能。

- 縦書きレンダリングAPIへ渡す `maxCharsPerLine` はコマの相対縦幅に応じて動的決定。
  - `height <= 0.2`: 6 文字/行
  - `height <= 0.3`: 8 文字/行
  - それ以外: `appConfig.rendering.verticalText.defaults.maxCharsPerLine` を使用（既定は 14）
- 改行処理はレンダリングAPI側で行うため、当該値のみ指定し、フォールバックは実装しない。

### 複数吹き出しの水平配置（2025-09-04 追加）

- 同一コマに複数の吹き出しがある場合、縦積みではなく横並びに配置し文字の視認性を確保する。
- 吹き出し領域を最優先で確保し、説明テキストや描き文字は残余スペースに収める。

### バッチレンダリング（2025-09-03 追加）

- 縦書きテキストレンダリングは、セリフ単位の逐次呼び出しから「ページ単位の一括呼び出し」へ移行。
- エンドポイント: `POST /render/batch`
  - `defaults` にページ共通の `fontSize/lineHeight/letterSpacing/padding` を設定。
  - `items` に各ダイアログの `{ text, font?, maxCharsPerLine }` を順序保持で投入。
- 目的: ネットワーク往復回数を削減し、1ページ内のセリフ描画を効率化。
- エラー時はフォールバックせず即停止し、詳細ログを残す。

## プロバイダー差異の吸収（2025-08-31 追加）

- 共通インターフェース: すべてのLLM呼び出しは `LlmClient` を介して行い、プロバイダー毎の差異はアダプター層で吸収する。
- Gemini/Vertex AI: `contents` に `role: 'system'` を含めない。代わりに `systemInstruction` トップレベルにシステムプロンプトを渡す。
- OpenAI系/Groq系: OpenAI互換のメッセージ配列（`system`/`user`）を使用。Structured Outputsは対応プロバイダーのみ厳密化。
- 役割マッピング: `assistant`→`model`（Gemini系）、`tool` は未サポートのため無効化または `user` 相当として取り扱い（現状は未使用）。
- フォールバック禁止: 仕様差異で失敗した場合はエラーを明示し、その場で処理を停止する（自動フォールバックは実装しない）。

### 環境変数

```bash
LLM_PROVIDER=openai|anthropic|cloudflare|fake
OPENAI_API_KEY=your-key
ANTHROPIC_API_KEY=your-key
# その他のプロバイダー固有の設定
```

## 進捗ストリーミング（SSE）

- エンドポイント: `GET /api/jobs/{jobId}/events`（`text/event-stream`）。OpenNext + Cloudflare Workers で `ReadableStream` により配信。
- イベント:
  - `init`: 接続時スナップショット `{ job, chunks }`
  - `message`: 状態が変化した際の差分push（同上フォーマット）
  - `final`: 完了/失敗の最終通知（同上）
  - `ping`: 20秒毎のkeepalive
- クライアント: `EventSource`で購読。`ProcessingProgress` は受信データを既存の更新関数へ渡してUIに反映。
- 参考: Cloudflare Workers は Next.js でレスポンスストリーミングをサポート（Workers公式 Next.js ガイド）。

### 設定ファイル

```typescript
// src/config/llm.config.ts
export const providers: Record<LLMProvider, ProviderConfig> = {
  openai: {
    apiKey: process.env.OPENAI_API_KEY,
    model: 'gpt-4',
    maxTokens: 4096,
    timeout: 30000,
  },
  fake: {
    apiKey: 'fake-key',
    model: 'fake-model',
    maxTokens: 8192,
    timeout: 30000,
  },
  // その他のプロバイダー
}
```

## パフォーマンス

### フォールバック

- プライマリLLMが失敗した場合、自動的に代替プロバイダーを試行
- 設定可能なフォールバックチェーン

## エピソード束ね指針（20～50ページは目安）

- 束ねステップは「1エピソードあたり20～50ページ」を“目安”として利用する。
- 厳密なバリデーションは行わず、範囲外でも処理は継続する。
- LLM提案が空 or 指針に沿う分割が得られない場合は、全ページを1エピソードとして扱うフォールバックを適用する。
- ログには警告を記録するが、エラーとしては扱わない（処理は継続）。
- エラー追跡とメトリクス

### ストリーミング

- 正規化されたイテレーター
- アダプターレベルでのマッピング
- プロバイダー固有の違いを抽象化

## 移行ガイド

### 段階的移行

1. 新しいモジュールを既存のものと並行して導入
2. 薄い互換性シム（`CompatAgent`）を提供
3. サービスを1つずつ移行
4. レガシーファイルを削除

### 既存コードの移行例

```typescript
// 古い方法
import { BaseAgent } from '@/agents/base-agent'
const agent = new BaseAgent({ provider: 'openai' })
const result = await agent.generateObject(schema, prompt)

// 新しい方法
import { AgentCoreFactory } from '@/agents/core'
import { createLlmClientFromConfig } from '@/llm'

const agent = AgentCoreFactory.create({
  llmClient: createLlmClientFromConfig(),
})
const result = await agent.run({
  messages: [{ role: 'user', content: prompt }],
  options: { schema },
})
```

## 統合テスト対応状況

### 完了した対応

- ✅ `src/__tests__/integration/__helpers/test-agents.ts`の更新

---

## Novel → Manga Orchestration（理想フロー）

本サービスの最終的な一気通貫フローは次の通り。

- 読み込み（ID or テキスト）
- 機械的チャンク分割（固定長＋オーバーラップ）
- チャンク要素抽出（登場人物/シーン/対話/ハイライト/状況）
- チャンク束の統合分析（重複統合・重要要素抽出）
- 物語弧分析でエピソード境界決定
- 台本化（セリフ/ナレーション/ト書きに正規化）
- ページ分割（重要度に応じたページ配分）
- コマ割り割当（ページ内の行割当）
- レイアウト（YAML化，テンプレート適用とバリデーション）
- レンダリング（画像生成は将来，現状はレイアウトの描画）

システムは Analyze/Layout/Render の3 APIでオーケストレーションされる。Analyzeが上記の分析・境界・台本・ページ/コマ割り・YAML保存までを担当し，Layoutは指定エピソードのレイアウト再生成，Renderはページ単位の描画を行う。

### Emotion（感情表現）の扱い（更新）

- 感情は enum で分類しない。自由記述の `string` として受け入れる。
- システムによる正規化・シノニム折りたたみは行わない（例: `think → thought` などを廃止）。
- レンダリング時の吹き出しスタイル（`normal|thought|shout`）は、emotion 文字列に依存せず、テキストの記号のみから推定する。
  - `！/!` を含む → `shout`
  - 先頭が `（/(` → `thought`
  - それ以外 → `normal`
- 吹き出し形状: 通常発話は楕円、ナレーションは長方形、内心の声は雲形で描画し、文字との間に余白を確保する。
- これにより、英語の固定語彙やフォールバックを排除し、日本語の自由記述に完全対応する。

### 呼び出しシーケンスの概要（番号付き）

1. Analyze API
   1.1 チャンク分割（固定長＋オーバーラップ）
   1.2 チャンク分析（LLM）とストレージ保存
   1.3 物語弧分析でエピソード境界決定
   1.4 台本化（scriptConversion）
   1.5 ページ分割推定（pageBreakEstimation）
   1.6 コマ割り割当（panel assignment）
   1.7 レイアウトYAML保存
2. Layout API（任意）
   2.1 特定エピソードの再計画・再生成
3. Render API（任意）
   3.1 レイアウトYAMLを元にページ画像描画

注: 将来的にシーケンス図（Mermaid）を追加予定。

### プロンプト方針（更新）

- 「コマ割りだけ（ページごとの panelCount のみ）を推定するプロンプト」は撤廃。
- 新フローでは以下の2段構え:
  - 脚本化（scriptConversion）でセリフ/ナレーション/ト書きを正規化
  - ページ分割推定（pageBreakEstimation）でページ境界を決める（panelCountの決定はテンプレート選択ロジックへ委譲）
- コマの配置・サイズはシステム側のテンプレート選択/正規化ロジックで決定する（LLMは関与しない）。

### Orchestrator（Scenario DSL）

`createNovelToMangaScenario()` を API 駆動へ刷新。実行順は `analyze → layout → render`。UI/CLI/Playwright から `/api/scenario/run` に `kind: 'dsl'` で投入し，同順で進行。デモ・本番の差はアダプターの呼び先のみで統一。

### チャンク分割ポリシー

`splitTextIntoSlidingChunks(text, chunkSize, overlap, { minChunkSize, maxChunkSize, maxOverlapRatio })` を採用。前後チャンクのテキストをプロンプトへ文脈として渡しつつ，分析対象は中央チャンクに限定するプロンプトで統一。

### エラー処理方針

フォールバックで隠蔽せず，失敗時は詳細を記録して停止。分析未取得やYAML検証失敗などは致命として扱う。

HealthCheckService では DB と Storage をそれぞれ軽量 probe し、失敗時は操作名とタイムスタンプを含む構造化ログを出力する。

- ✅ `FakeLlmClient`を使用したモックの実装
- ✅ 新しいLLMエージェントアーキテクチャとの互換性確保
- ✅ すべての統合テストが正常に動作

### 対応済みテストファイル

- ✅ `service-integration.test.ts` (5 tests)
- ✅ `workflow.test.ts` (4 tests)
- ✅ `api-contracts.test.ts` (8 tests)
- ✅ `layout-counts-snap.test.ts` (2 tests)
- ✅ `service-layout.integration.test.ts` (2 tests)
- ✅ `simple.test.ts` (2 tests)

### スキップされたテスト

- ⏭️ `render.pipeline.vertical-text.bounds.integration.test.ts` (2 tests)
- ⏭️ `render.pipeline.vertical-text.integration.test.ts` (1 test)

**合計: 23 passed, 3 skipped**

## トラブルシューティング

### よくある問題

#### 1. プロバイダーが見つからない

```bash
Error: Unknown LLM provider: fake
```

**解決策**: `src/config/llm.config.ts`でプロバイダーを追加

#### 2. ツールのスキーマ検証エラー

```bash
Error: Tool schema validation failed
```

**解決策**: Zodスキーマを確認し、入力データの型を修正

#### 3. フォールバックが動作しない

```bash
Error: All providers failed
```

**解決策**: フォールバックチェーンの設定を確認

### デバッグ

#### トレースの有効化

```typescript
const result = await agent.run(input, {
  tracing: true,
  maxSteps: 10,
})
console.log(result.trace)
```

#### プロバイダー情報の確認

```typescript
console.log(result.metadata?.provider)
```

## 開発ツールとCI

### 最新の改善（2025-09-04）

- **Biome統合の最適化**: lintコマンドを`npx @biomejs/biome lint . --fix`に修正し、より効率的なコード品質チェックを実現
- **Prettier設定の維持**: JSONファイルのフォーマットチェックを継続的に実施
- **CI/CDパイプラインの安定化**: GitHub Actions でのビルドとテストの実行を最適化

### 基本設定

- **Lint**: Biome を使用し、`npm run lint` で静的解析を実行。
- **Format**: Prettier により `npm run format` でコード整形。
- **CI**: GitHub Actions が `check:ci` スクリプトとテストを全PRで自動実行。

## 今後の改善

### 短期目標

- [ ] レンダリングパイプラインの統合テスト対応
- [ ] パフォーマンスメトリクスの追加
- [ ] より多くのLLMプロバイダーのサポート

### 長期目標

- [ ] 動的ポリシー選択
- [ ] 分散エージェント実行
- [ ] 高度なツールチェーン

## スクリプト変換品質評価システム（2025-09-01 追加）

### カバレッジ評価機能

`assessScriptCoverage` 関数により、生成されたマンガスクリプトの品質を定量評価：

#### 評価指標

- **パネル密度**: テキスト長に対する適切なパネル数（1000文字あたり2パネル目安）
- **対話カバレッジ**: 原文の会話「」記号との対応率（30%以上を期待）
- **ナレーション完全性**: 長文テキスト（200文字超）でナレーション不足の検出
- **キャラクター活用率**: 定義されたキャラクターの台詞での使用状況

#### 品質保証プロセス

1. カバレッジ比率が閾値未満の場合、詳細理由をログ記録
2. リトライメカニズムによる品質改善（最大3回まで）
3. SFXデータの統合とレンダリングへの反映

### エピソードバンドル機能（2025-08-31 追加）

短いエピソードの効率的な統合システム：

#### バンドリングロジック

- **閾値判定**: 20ページ未満のエピソードを自動検出
- **隣接統合**: 直前エピソードとの結合による読みやすさ向上
- **ページ数再計算**: 統合後の総ページ数とレイアウト調整

#### データベース拡張

- `episodes` テーブルに `episode_text_path` カラム追加（完了済み）
- エピソードテキストの永続化とトレーサビリティ向上
- レイアウトステータス管理の強化

## 垂直テキスト・SFX統合（2025-09-01 最新）

### 日本語縦書き対応

- Canvas描画エンジンでの縦書きテキストレンダリング
- フォント設定の動的調整（デフォルトフォント使用を含む）
- SFXデータの効果音表現統合

### 吹き出し形状の動的制御

- テキスト解析による吹き出しタイプ自動判定
  - `!` 記号 → `shout`（強調型）
  - `（` 開始 → `thought`（思考型）
  - その他 → `normal`（通常型）

## リファクタリング履歴（2025-09-04）

### エラー処理の簡潔化

- **非推奨ユーティリティの削除**: 使用されていない古いエラー処理ユーティリティクラスを削除
- **エラーパターンの統合**: 分散していたエラーパターン定義を一元管理化
- **シンプルな例外処理**: 複雑なエラーハンドリングロジックを簡素化

### UIレイヤーの最適化

- **フォント処理の削除**: 不要なフォント処理コードを削除し、パフォーマンスを向上
- **Providersインポートの修正**: layout.tsxのProvidersインポートを修正し、適切なコンポーネント構造を維持
- **bodyタグクラス名の整理**: クラス名の書式を統一し、可読性を向上

### 認証とセキュリティ

- **Codex認証の改善**:
  - 認証タイムアウトの安全な処理を実装
  - 初期化エラーを適切に表示し、ユーザー体験を向上
  - codex_auth.jsonを.gitignoreに追加し、セキュリティを強化

### 開発環境の改善

- **Lintコマンドの修正**: package.jsonのlintコマンドを修正し、Biomeとの統合を改善
- **インポート順序の整理**: 一貫性のあるインポート順序により、コードの可読性を向上
- **設定インターフェースの追加**: より柔軟な設定管理のための新しいインターフェースを導入

### 今後の改善点

- パフォーマンスメトリクスの詳細な収集と分析
- エラーハンドリングのさらなる最適化
- 設定管理システムの拡張

## 結論

新しいLLMエージェントアーキテクチャは、以下の目標を達成しました：

1. **簡素化**: 単一のパブリックAPI、明確な責任分離
2. **プロバイダー非依存**: インターフェースベースの設計、設定による切り替え
3. **決定論的テスト**: FakeLlmClient、安定したテスト環境
4. **厳密な型安全性**: ゼロany、JSON-schema検証
5. **品質保証**: スクリプトカバレッジ評価による自動品質チェック
6. **効率的統合**: エピソードバンドル機能による最適な読み体験
7. **コードベースの健全性**: 2025-09-04のリファクタリングによる保守性向上

統合テストも完全に対応し、既存のコードベースとの互換性を保ちながら、段階的な移行が可能です。最新の機能追加により、より堅牢で使いやすいマンガ変換システムを提供しています。

## 認証とユーザー管理（2025-08-31 追加）

- Auth.js 互換の `users`/`accounts`/`sessions` スキーマを導入し、D1 データベースでの認証情報を管理。
- `novels` と `jobs` テーブルに `user_id` 外部キーを追加し、ユーザー単位でデータを紐付け。
- これにより、マルチユーザー環境でのデータ分離とアクセス制御が可能になった。

## 追加: エピソード本文の永続化（2025-08-21）

- エピソード抽出後、本文テキストをストレージに保存（`analysis` ストレージ、キー: `StorageKeys.episodeText(jobId, episodeNumber)`）。
- DB `episodes` テーブルに `episode_text_path` 列を追加し、保存したキーを格納。
- これにより、後続処理（スクリプト変換・ページ割り振り）や再処理時の再抽出を避け、トレーサビリティが向上。
  Note: The agent implementation previously under `src/agent` has been consolidated into `src/agents`. All imports should target `@/agents/*`. Error handling is unified via `src/agents/errors.ts`.

## 追加: キャラクターメモリのリポジトリ永続化（2025-09-xx）

- キャラクターメモリを `JsonStorageKeys.characterMemoryFull` / `JsonStorageKeys.characterMemoryPrompt` 経由でストレージ保存。
- `jobs` テーブルに `character_memory_path` と `prompt_memory_path` を追加し、保存したキーを記録。
- これによりデータディレクトリ依存を排し、全処理がリポジトリ層を介して一貫化。
- スクリプト変換後のLLMによるキャラクター一貫性チェックを廃止し、チャンク毎のメモリ永続化に一本化。

### Bugfix: Bundled episode display (2025-09-06)

- 結果ページでバンドル後のエピソード数とタイトルが一致しない問題を修正。
- `full_pages.json` から最終エピソード情報を取得し、UI表示と生成結果を統一。
- バンドルされたエピソードのタイトルは統合された最初のエピソードのものを採用。

### Bugfix: Scene/Highlight index validation (2025-09-07)

- Scene と Highlight のスキーマで `endIndex` が `startIndex` と同一の場合も許容。
- 単一点のシーンやハイライトに対するバリデーションエラーを解消。

### Bugfix: full_pages JSON parsing (2025-09-08)

- R2 経由の `full_pages.json` 末尾に混入する `null` 文字が原因で結果ページが JSON パースに失敗する問題を修正。
- 末尾の `\u0000` を除去してから JSON を解析する `parseJson` ユーティリティを追加し、結果ページで利用。

### Feature Toggle: Script Coverage Check (2025-09-??)

- `app.config.ts` に `features.enableCoverageCheck` を追加。
- 既定は `false` とし、`true` の場合のみスクリプト変換でカバレッジ評価とリトライを実行。
- 一時的に機能を無効化しつつ、必要に応じて再有効化できるようにする。

## エラーハンドリングアーキテクチャ（2025-08-27 更新）

### 統一エラーパターン管理

LLM構造化ジェネレーターにおけるエラー処理は、共通のエラーパターン定義により一元化されています：

#### エラーパターン分類

- **接続エラーパターン** (`CONNECTIVITY_ERROR_PATTERNS`): ネットワーク/接続問題を示すエラー
  - プロバイダーフォールバックの対象（pre-response エラー）
  - 例: `ECONNRESET`, `ENOTFOUND`, `ETIMEDOUT`, `fetch failed`, `network error`, `TLS`

- **JSON/スキーマエラーパターン** (`JSON_SCHEMA_ERROR_PATTERNS`): LLM応答後に発生するエラー
  - プロバイダーフォールバックの対象外（post-response エラー）
  - 例: `json_validate_failed`, `Failed to generate JSON`, `schema validation failed`, `invalid_type`

- **リトライ可能JSON エラーパターン** (`RETRYABLE_JSON_ERROR_PATTERNS`): 同一プロバイダー内でリトライ可能なエラー
  - 一時的なJSON生成の問題に対してリトライロジックを適用
  - JSON/スキーマエラーのサブセット

- **HTTP エラーパターン** (`HTTP_ERROR_PATTERNS`): ステータスコードベースの分類
  - `CLIENT_ERROR` (4xx): クライアント/プロンプト問題、フォールバック対象外
  - `SERVER_ERROR` (5xx): サーバー問題、フォールバック対象

#### 実装場所

- **定義**: `src/errors/error-patterns.ts` - 全エラーパターンの一元管理
- **利用**: `src/agents/structured-generator.ts` - エラー判定ロジックで使用

#### 利点

1. **重複排除**: 複数の関数間でエラーパターンを共有
2. **保守性**: パターン変更時の単一変更点
3. **一貫性**: エラー分類ロジックの統一
4. **可読性**: 各パターンの用途と例を明確に文書化

### ページブレーク正規化の堅牢化

`normalizePageBreakResult` 関数は、LLMの多様な応答形式に対応する包括的な正規化処理を提供：

#### 対応する応答形式

1. **標準形式**: `{ pages: [...] }` - そのまま返却
2. **単純配列**: `[{ pageNumber: 1, ... }, ...]` - pagesプロパティでラップ
3. **入れ子形式**: `[{ pages: [...] }, { pages: [...] }]` - フラット化してページ番号を再採番
4. **混合形式**: 有効なページオブジェクトのみをフィルタリング
5. **不明形式**: 空のページ配列を返してクラッシュを防止

#### 品質保証

- 型ガード関数による安全な型チェック
- イミュータブルな更新パターン
- シーケンシャルなページ番号の保証
- 包括的なJSDoc文書化

## 追加: Legacy StorageService 完全削除（2025-09-01）

- 旧 `src/services/storage.ts` を廃止し、全ストレージ操作は `StorageKeys` と `StorageFactory` を利用
- 階層ディレクトリと `txt` ベース保存を排除し、フラットキー + JSON 形式に統一

## 追加: Google OAuth 認証基盤（2025-09-02）

- Auth.js v5 と Google プロバイダーによるログイン/ログアウトを実装
- `@auth/drizzle-adapter` を用い、ユーザー・セッション情報を D1 に永続化
- Next.js App Router 向けに `SessionProvider` を組み込み、クライアントでセッションを管理

## サインアップ同意フロー（2025-09-?? 更新）

- サインアップ画面で利用規約への同意チェックを導入。
- チェックが入るまで送信ボタンは無効化され、同意しない限り登録を進められない。

## 追加: ナラティブアーク分析の完全削除（2025-09-XX）

- 旧来のナラティブアーク分析ステップをパイプラインから廃止し、不要なトークン消費を解消。
- エピソード境界は統合スクリプトから直接推定し、`narrativeAnalysis` 系設定・キーを全て削除。
- これにより前半処理のLLM呼び出しが単純化され、チャンク分析結果のみで後続処理を実施する。

## スクリプト→エピソード正規化（2025-09-03 追加）

- 話者抽出の移動: レンダラー依存を避けるため、スクリプトの `dialogue`/`narration` 文字列からの話者抽出・引用符除去を「エピソード生成（ページ分割）段階」で実施するよう変更。
- 形式の統一:
  - `dialogue`: `太郎：「セリフ」` / `太郎: セリフ` に全角/半角コロン両対応、外側の「」/『』/""/'' を除去し `{ speaker, text }` へ正規化。
  - `narration`: スクリプトの `narration` 配列要素は1つのセリフとして扱い、`speaker` は常に `ナレーション` とする。
- コンテンツ統合: `cut` と `camera` を改行結合し `pages[].panels[].content` に格納（後続レンダリングでそのまま表示可能）。
- 実装:
  - 共有ユーティリティ `src/agents/script/dialogue-utils.ts` を追加し、`importance-based-page-break.ts` と `segmented-page-break-estimator.ts`（デモ経路）から利用。
  - 既存のレンダラー内の話者抽出ロジックは互換のため残置するが、主たる抽出は前段で完了するため依存しない。

## フラグメント処理の削除（2025-09-05）

- 未使用となっていたエピソードフラグメント分割とフラグメント方式のスクリプト変換を完全に廃止。
- チャンク単位処理に一本化することで、設定とコードのコンテクストを軽量化。

## 認証基盤

- Google OAuth + Auth.js + D1 Adapter を採用予定。詳細は docs/google-auth-design.md を参照。
