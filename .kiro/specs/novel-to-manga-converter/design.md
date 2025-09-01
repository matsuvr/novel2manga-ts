# 新しいLLMエージェントアーキテクチャ

## 概要

このドキュメントは、LLMエージェントの実装を簡素化し、プロバイダー非依存で、決定論的テストが可能で、厳密な型安全性を提供する新しいアーキテクチャについて説明します。

## アーキテクチャの利点

### 1. エージェントの簡素化

- `base-agent.ts`と`agent.ts`を小さな合成可能なコアに統合
- 単一のパブリックAPI（`AgentCore.run`）
- 責任の明確な分離

### 2. プロバイダー非依存

- サービスはインターフェースに依存し、具体的なLLMに依存しない
- DI/設定によるプロバイダー切り替え
- フォールバック機能（LLMサーバーエラー時のみ）

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
- 目的: 機械的な閾値エラーで停止せず、自然な分割単位に収束させる。

## 設定

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

## 結論

新しいLLMエージェントアーキテクチャは、以下の目標を達成しました：

1. **簡素化**: 単一のパブリックAPI、明確な責任分離
2. **プロバイダー非依存**: インターフェースベースの設計、設定による切り替え
3. **決定論的テスト**: FakeLlmClient、安定したテスト環境
4. **厳密な型安全性**: ゼロany、JSON-schema検証

統合テストも完全に対応し、既存のコードベースとの互換性を保ちながら、段階的な移行が可能です。

## 追加: エピソード本文の永続化（2025-08-21）

- エピソード抽出後、本文テキストをストレージに保存（`analysis` ストレージ、キー: `StorageKeys.episodeText(jobId, episodeNumber)`）。
- DB `episodes` テーブルに `episode_text_path` 列を追加し、保存したキーを格納。
- これにより、後続処理（スクリプト変換・ページ割り振り）や再処理時の再抽出を避け、トレーサビリティが向上。
  Note: The agent implementation previously under `src/agent` has been consolidated into `src/agents`. All imports should target `@/agents/*`. Error handling is unified via `src/agents/errors.ts`.

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
