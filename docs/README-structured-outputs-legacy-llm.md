# Structured Outputs - 型安全なLLM応答

このモジュールは、OpenAI、Groq、Grokなどの対応プロバイダーで、ZodスキーマをベースとしたStructured Outputsを型安全に利用できる機能を提供します。

## 特徴

- **型安全性**: ZodスキーマからTypeScript型を自動推論
- **プロバイダー対応**: OpenAI、Groq、Grok等のStructured Outputs対応
- **Refusal対応**: 安全性拒否レスポンスのハンドリング
- **エラー処理**: 構造化されたエラーハンドリングとデバッグ支援
- **パフォーマンス**: 効率的なJSON Schema生成と検証

## 使用例

### 基本的な使用方法

```typescript
import { z } from 'zod'
import { OpenAIClient } from './providers/openai.js'
import { withStructuredOutputs } from './structured-client.js'

// 1. Zodスキーマを定義
const UserProfileSchema = z.object({
  name: z.string(),
  age: z.number(),
  interests: z.array(z.string()),
  active: z.boolean(),
})

// 2. LLMクライアントを作成してラップ
const openaiClient = new OpenAIClient({
  apiKey: process.env.OPENAI_API_KEY!,
  model: 'gpt-4o-2024-08-06',
})
const structuredClient = withStructuredOutputs(openaiClient)

// 3. 型安全な構造化応答を取得
const messages = [
  {
    role: 'user' as const,
    content: 'Create a user profile for a 25-year-old developer named Alice',
  },
]

const response = await structuredClient.chatWithSchema(messages, UserProfileSchema, 'UserProfile')

if (response.refusal) {
  console.log('Request was refused:', response.refusal)
} else if (response.parsed) {
  // response.parsedは自動的にUserProfile型になる
  console.log('Name:', response.parsed.name)
  console.log('Age:', response.parsed.age)
  console.log('Interests:', response.parsed.interests)
}
```

### 複雑なスキーマの例

```typescript
const MangaPageSchema = z.object({
  id: z.string(),
  pageNumber: z.number().positive(),
  panels: z.array(
    z.object({
      id: z.string(),
      position: z.object({
        x: z.number(),
        y: z.number(),
        width: z.number(),
        height: z.number(),
      }),
      content: z.object({
        dialogue: z.string().optional(),
        narration: z.string().optional(),
        characters: z.array(z.string()),
      }),
    }),
  ),
  metadata: z.record(z.unknown()),
})

const response = await structuredClient.chatWithSchema(
  [{ role: 'user', content: 'Create a manga page layout for a dramatic scene' }],
  MangaPageSchema,
  'MangaPage',
  { temperature: 0.7, maxTokens: 2000 },
)

if (response.parsed) {
  // 完全に型安全なアクセス
  response.parsed.panels.forEach((panel) => {
    console.log(`Panel ${panel.id}: ${panel.position.width}x${panel.position.height}`)
  })
}
```

### エラーハンドリング

```typescript
// 安全なパース（エラー時でも継続）
const result = await structuredClient.safeChatWithSchema(messages, UserProfileSchema, 'UserProfile')

if (result.success) {
  console.log('Success:', result.response?.parsed)
} else {
  console.error('Failed:', result.error)
}
```

### プロバイダー別の使用

```typescript
// Groqクライアント
import { OpenAICompatibleClient } from './providers/openai-compatible.js'

const groqClient = new OpenAICompatibleClient({
  apiKey: process.env.GROQ_API_KEY!,
  baseUrl: 'https://api.groq.com/openai/v1',
  provider: 'groq',
  model: 'llama-3.1-70b-versatile',
})

const structuredGroq = withStructuredOutputs(groqClient)

// Grokクライアント（xAI）
const grokClient = new OpenAICompatibleClient({
  apiKey: process.env.XAI_API_KEY!,
  baseUrl: 'https://api.x.ai/v1',
  provider: 'grok',
  model: 'grok-beta',
})

const structuredGrok = withStructuredOutputs(grokClient)
```

## API リファレンス

### `createResponseFormat<T>(schema, schemaName, strict?)`

ZodスキーマからJSON Schema形式のresponseFormatを生成します。

### `parseStructuredOutput<T>(content, schema)`

JSON文字列をZodスキーマで検証してパースします。エラー時は例外をスローします。

### `safeParseStructuredOutput<T>(content, schema)`

安全なパース。エラー時は`{success: false, error: string}`を返します。

### `StructuredLlmClient`

型安全なStructured Outputsを提供するLLMクライアントラッパー。

#### メソッド

- `chatWithSchema<T>(messages, schema, schemaName, options?)`: 構造化チャット
- `safeChatWithSchema<T>(...)`: 安全な構造化チャット
- `parseResponse<T>(response, schema)`: 既存レスポンスのパース
- `raw`: 元のLlmClientへのアクセス

### `withStructuredOutputs(client)`

LlmClientをStructuredLlmClientでラップする便利関数。

## 制限事項

- OpenAI Structured OutputsはJSON Schema referencesをサポートしません
- Groqは一部のJSON Schema機能に制限があります（`const`, `format`, `pattern`など）
- プロバイダーによってはrefusal機能が限定的です

## デバッグ

構造化出力が期待通りに動作しない場合：

1. 生の`response.content`を確認
2. JSON Schemaが正しく生成されているか確認
3. プロバイダー固有の制限を確認（特にGroq）
4. `safeParseStructuredOutput`を使用してエラー詳細を取得
