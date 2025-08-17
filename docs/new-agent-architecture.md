# 新しいエージェントアーキテクチャ

## 概要

LLMエージェントの実装を簡素化し、プロバイダー非依存で、テスト可能で、型安全な新しいアーキテクチャに移行しました。

## 主要な改善点

### 1. 簡素化されたエージェント

- `base-agent.ts` + `agent.ts` を統合
- 単一の公開API: `AgentCore.run()`
- コンポーザブルなコア

### 2. プロバイダー非依存

- サービスはインターフェースに依存
- 設定/DIによるプロバイダー切り替え
- 統一されたエラーハンドリング

### 3. 決定論的テスト

- 安定したFake/Mock LLM
- 薄いアダプター契約テスト
- 少ない可動部分

### 4. 厳密な型

- `any`の排除
- 暗黙的な`ts-ignore`の禁止
- JSON Schema型付きツール

## アーキテクチャ

### ディレクトリ構造

```
src/
├── llm/
│   ├── client.ts          # LLMクライアントインターフェース
│   ├── providers/         # プロバイダー実装
│   │   ├── openai.ts
│   │   ├── cerebras.ts
│   │   └── gemini.ts
│   ├── fake.ts           # テスト用Fake LLM
│   └── index.ts          # ファクトリー
├── agent/
│   ├── core.ts           # エージェントコア
│   ├── types.ts          # 型定義
│   ├── tools.ts          # ツールレジストリ
│   ├── policies/         # 実行ポリシー
│   │   ├── singleTurn.ts
│   │   └── react.ts
│   ├── compat.ts         # 互換性レイヤー
│   └── index.ts          # エクスポート
```

## 使用方法

### 基本的な使用

```typescript
import { AgentCore, AgentCoreFactory } from '@/agent/core'
import { createLlmClientFromConfig } from '@/llm'

// LLMクライアントを作成
const client = createLlmClientFromConfig('cerebras')

// エージェントを作成
const agent = AgentCoreFactory.create(client, 'single-turn')

// エージェントを実行
const result = await agent.run(
  {
    messages: [{ role: 'user', content: 'Hello, how are you?' }],
  },
  {
    systemPrompt: 'You are a helpful assistant.',
    maxTokens: 1000,
  },
)

console.log(result.messages[result.messages.length - 1].content)
```

### ツールの使用

```typescript
import { ToolFactory } from '@/agent/tools'

// ツールを定義
const calculator = ToolFactory.create(
  'calculator',
  'Performs basic arithmetic',
  {
    type: 'object',
    properties: {
      operation: { type: 'string', enum: ['add', 'subtract', 'multiply', 'divide'] },
      a: { type: 'number' },
      b: { type: 'number' },
    },
    required: ['operation', 'a', 'b'],
  },
  async (args) => {
    const { operation, a, b } = args as { operation: string; a: number; b: number }
    switch (operation) {
      case 'add':
        return a + b
      case 'subtract':
        return a - b
      case 'multiply':
        return a * b
      case 'divide':
        return a / b
      default:
        throw new Error(`Unknown operation: ${operation}`)
    }
  },
)

// ツールを登録
agent.registerTool(calculator)

// ReActポリシーで実行
agent.setPolicyByName('react')

const result = await agent.run(
  {
    messages: [{ role: 'user', content: 'Calculate 5 + 3' }],
  },
  {
    tools: [
      {
        type: 'function',
        function: {
          name: 'calculator',
          description: 'Performs basic arithmetic',
          parameters: calculator.schema,
        },
      },
    ],
  },
)
```

### テスト

```typescript
import { createFakeLlmClient, fakeResponses } from '@/llm/fake'
import { AgentCore } from '@/agent/core'

describe('Agent Tests', () => {
  it('should handle basic conversation', async () => {
    const client = createFakeLlmClient({
      responses: [fakeResponses.simple],
    })

    const agent = new AgentCore({ client })

    const result = await agent.run({
      messages: [{ role: 'user', content: 'Hello' }],
    })

    expect(result.messages).toHaveLength(2)
    expect(result.messages[1].content).toBe('This is a simple test response.')
  })
})
```

## 移行ガイド

### 既存のエージェントから新しいアーキテクチャへ

#### 1. 互換性レイヤーの使用

```typescript
// 既存のコード
import { BaseAgent } from '@/agents/base-agent'

const agent = new BaseAgent({
  name: 'my-agent',
  instructions: 'You are helpful',
  provider: 'cerebras',
})

const result = await agent.generateObject(schema, prompt)

// 新しいコード（互換性レイヤー）
import { CompatAgent } from '@/agent/compat'

const agent = new CompatAgent({
  name: 'my-agent',
  instructions: 'You are helpful',
  provider: 'cerebras',
})

const result = await agent.generateObject(schema, prompt)
```

#### 2. 段階的移行

```typescript
// ステップ1: 新しいエージェントを作成
import { AgentCore, AgentCoreFactory } from '@/agent/core'
import { createLlmClientFromConfig } from '@/llm'

const client = createLlmClientFromConfig('cerebras')
const agent = AgentCoreFactory.create(client, 'single-turn')

// ステップ2: 既存のロジックを移植
const result = await agent.run(
  {
    messages: [{ role: 'user', content: prompt }],
  },
  {
    systemPrompt: instructions,
    maxTokens: maxTokens,
  },
)

// ステップ3: レスポンスを処理
const lastMessage = result.messages[result.messages.length - 1]
const response = lastMessage.content
```

### エラーハンドリング

```typescript
import { AgentError, ToolError, PolicyError } from '@/agent/types'

try {
  const result = await agent.run(input, options)
} catch (error) {
  if (error instanceof ToolError) {
    console.error(`Tool error: ${error.toolName}`, error.message)
  } else if (error instanceof PolicyError) {
    console.error(`Policy error: ${error.policy}`, error.message)
  } else if (error instanceof AgentError) {
    console.error(`Agent error: ${error.code}`, error.message)
  } else {
    console.error('Unknown error:', error)
  }
}
```

## 設定

### 環境変数

```bash
# LLMプロバイダー設定
LLM_PROVIDER=cerebras  # openai, cerebras, gemini, fake
CEREBRAS_API_KEY=your_key
OPENAI_API_KEY=your_key
GEMINI_API_KEY=your_key
```

### 設定ファイル

```typescript
// src/config/llm.config.ts
export const providers = {
  cerebras: {
    apiKey: process.env.CEREBRAS_API_KEY,
    model: 'qwen-3-235b-a22b-instruct-2507',
    maxTokens: 8192,
    timeout: 30_000,
  },
  // ...
}
```

## パフォーマンス

### フォールバック機能

```typescript
import { createLlmClientWithFallback } from '@/llm'

// 複数のプロバイダーを試行
const client = await createLlmClientWithFallback(['cerebras', 'openai', 'gemini'])
```

### ストリーミング

```typescript
const stream = agent.getClient().stream(messages, options)

for await (const chunk of stream) {
  console.log(chunk.content)
  if (chunk.done) break
}
```

## テスト戦略

### 単体テスト

```typescript
// Fake LLMを使用したテスト
const client = createFakeLlmClient({
  responses: [{ content: 'Expected response' }],
})

const agent = new AgentCore({ client })
const result = await agent.run(input)
expect(result.messages[1].content).toBe('Expected response')
```

### 統合テスト

```typescript
// 実際のプロバイダーを使用したテスト
const client = createLlmClientFromConfig('cerebras')
const agent = new AgentCore({ client })

// 実際のAPIを呼び出し
const result = await agent.run(input)
expect(result.metadata?.provider).toBe('cerebras')
```

## 今後の計画

1. **段階的移行**: 既存のエージェントを新しいアーキテクチャに移行
2. **機能拡張**: より多くのポリシーとツールの追加
3. **最適化**: パフォーマンスとメモリ使用量の改善
4. **監視**: 詳細なトレースとメトリクスの追加

## トラブルシューティング

### よくある問題

1. **プロバイダーエラー**: APIキーとエンドポイントの確認
2. **ツールエラー**: JSON Schemaの検証
3. **タイムアウト**: 最大ステップ数の調整
4. **メモリ不足**: バッチサイズの削減

### デバッグ

```typescript
// 詳細なトレースを有効化
const result = await agent.run(input, options)
console.log('Trace:', result.trace)
console.log('Usage:', result.usage)
console.log('Metadata:', result.metadata)
```
