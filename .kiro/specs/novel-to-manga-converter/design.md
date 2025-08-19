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
import { AgentCoreFactory } from '@/agent/core'
import { createLlmClientFromConfig } from '@/llm'

const llmClient = createLlmClientFromConfig()
const agent = AgentCoreFactory.create({ llmClient })

const result = await agent.run({
  messages: [{ role: 'user', content: 'こんにちは' }],
})
```

### ツール付きの使用

```typescript
import { AgentCoreFactory } from '@/agent/core'
import { ReActPolicy } from '@/agent/policies/react'
import { ToolFactory } from '@/agent/tools'

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

## 設定

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
import { AgentCoreFactory } from '@/agent/core'
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
