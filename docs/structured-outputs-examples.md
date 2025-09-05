# Structured Outputs Examples - TypeScript + Zod Implementation

このドキュメントは、OpenAI CookbookのStructured Outputs例をTypeScript + Zodで実装したパターンを紹介します。既存の`src/llm/structured-client.ts`と`src/llm/zod-helper.ts`を使用した型安全なLLM応答の取得方法を学べます。

## セットアップ

まず、必要なライブラリをインポートして、構造化LLMクライアントをセットアップします：

```typescript
import { z } from 'zod'
import type { LlmClient, LlmMessage } from '../src/llm/client.js'
import { withStructuredOutputs } from '../src/llm/structured-client.js'

// LLMクライアントを構造化出力対応でラップ
const structuredClient = withStructuredOutputs(llmClient)
```

## 例1：数学チューター - 段階的な問題解決

数学の問題を段階的に解決するLLMチューターの実装例です。

### Zodスキーマ定義

```typescript
// 各ステップのスキーマ
const MathStepSchema = z.object({
  explanation: z.string().describe('この段階の詳細な理由'),
  output: z.string().describe('この段階の数式または結果'),
})

// 全体の推論スキーマ
const MathReasoningSchema = z.object({
  steps: z.array(MathStepSchema).describe('解法ステップの配列'),
  final_answer: z.string().describe('問題の最終回答'),
})

// TypeScript型を自動生成
export type MathReasoning = z.infer<typeof MathReasoningSchema>
export type MathStep = z.infer<typeof MathStepSchema>
```

### 実装

```typescript
export class MathTutor {
  private structuredClient: ReturnType<typeof withStructuredOutputs>

  constructor(client: LlmClient) {
    this.structuredClient = withStructuredOutputs(client)
  }

  private readonly systemPrompt = `
    あなたは親切な数学の家庭教師です。数学の問題が与えられます。
    目標は、段階的な解法と最終回答を出力することです。
    各ステップでは、方程式として出力し、explanation フィールドで推論を詳しく説明してください。
  `.trim()

  /**
   * 数学の問題を段階的な推論で解決
   */
  async solveProblem(question: string): Promise<MathReasoning | null> {
    const messages: LlmMessage[] = [
      { role: 'system', content: this.systemPrompt },
      { role: 'user', content: question },
    ]

    const response = await this.structuredClient.chatWithSchema(
      messages,
      MathReasoningSchema,
      'MathReasoning',
    )

    if (response.refusal) {
      throw new Error(`数学チューターが拒否: ${response.refusal}`)
    }

    return response.parsed || null
  }

  /**
   * 解法をフォーマットして表示
   */
  formatSolution(solution: MathReasoning): string {
    let formatted = '段階的な解法:\n\n'

    solution.steps.forEach((step, index) => {
      formatted += `ステップ ${index + 1}: ${step.explanation}\n`
      formatted += `${step.output}\n\n`
    })

    formatted += `最終回答: ${solution.final_answer}`
    return formatted
  }
}
```

### 使用例

```typescript
const mathTutor = new MathTutor(llmClient)
const solution = await mathTutor.solveProblem('8x + 7 = -23 を解いてください')

if (solution) {
  console.log(mathTutor.formatSolution(solution))
  // 出力:
  // ステップ 1: 変数を含む項を分離します。両辺から7を引きます。
  // 8x + 7 - 7 = -23 - 7
  //
  // ステップ 2: 両辺を簡略化します。
  // 8x = -30
  // ...
}
```

## 例2：テキストの要約 - 発明に関する記事の構造化分析

記事から発明に関する構造化情報を抽出する例です。

### Zodスキーマ定義

```typescript
// コンセプトのスキーマ
const ConceptSchema = z.object({
  title: z.string().describe('コンセプトの短いタイトル'),
  description: z.string().describe('コンセプトの詳細説明'),
})

// 記事要約のスキーマ
const ArticleSummarySchema = z.object({
  invented_year: z.number().int().positive().describe('発明された年'),
  summary: z.string().describe('発明の一文要約'),
  inventors: z.array(z.string()).describe('発明者の氏名（フルネームまたは姓）'),
  description: z.string().describe('発明の短い説明'),
  concepts: z.array(ConceptSchema).describe('発明に関連する主要コンセプト'),
})

export type ArticleSummary = z.infer<typeof ArticleSummarySchema>
export type Concept = z.infer<typeof ConceptSchema>
```

### 実装

```typescript
export class ArticleSummarizer {
  private structuredClient: ReturnType<typeof withStructuredOutputs>

  constructor(client: LlmClient) {
    this.structuredClient = withStructuredOutputs(client)
  }

  private readonly systemPrompt = `
    発明に関する記事の内容が提供されます。
    提供されたスキーマに従って記事を要約することが目標です。
    パラメータの説明:
    - invented_year: 記事で議論されている発明が作られた年
    - summary: 発明が何であるかの一文要約
    - inventors: 発明者のフルネーム（存在する場合）または姓の配列
    - concepts: 発明に関連する主要コンセプト（タイトルと説明を含む）
    - description: 発明の短い説明
  `.trim()

  /**
   * 発明に関する記事を要約
   */
  async summarizeArticle(articleContent: string): Promise<ArticleSummary | null> {
    const messages: LlmMessage[] = [
      { role: 'system', content: this.systemPrompt },
      { role: 'user', content: articleContent },
    ]

    const response = await this.structuredClient.chatWithSchema(
      messages,
      ArticleSummarySchema,
      'ArticleSummary',
      { temperature: 0.2 },
    )

    if (response.refusal) {
      throw new Error(`記事要約が拒否: ${response.refusal}`)
    }

    return response.parsed || null
  }

  /**
   * 記事要約をフォーマットして表示
   */
  formatSummary(summary: ArticleSummary): string {
    let formatted = `発明要約:\n\n`
    formatted += `年: ${summary.invented_year}\n`
    formatted += `要約: ${summary.summary}\n\n`

    formatted += `発明者:\n`
    summary.inventors.forEach((inventor) => {
      formatted += `- ${inventor}\n`
    })

    formatted += `\n主要コンセプト:\n`
    summary.concepts.forEach((concept) => {
      formatted += `- ${concept.title}: ${concept.description}\n`
    })

    formatted += `\n説明: ${summary.description}`
    return formatted
  }
}
```

### 使用例

```typescript
const summarizer = new ArticleSummarizer(llmClient)
const summary = await summarizer.summarizeArticle(articleText)

if (summary) {
  console.log(summarizer.formatSummary(summary))
  // 出力:
  // 発明要約:
  // 年: 1989
  // 要約: 畳み込みニューラルネットワーク（CNN）は画像などの構造化グリッドデータを処理するための深層ニューラルネットワークです。
  // ...
}
```

## 例3：エンティティ抽出 - 商品検索パラメータの抽出

ユーザーの入力から商品検索パラメータを抽出する例です。

### Zodスキーマ定義

```typescript
// 商品カテゴリの列挙型
const CategoryEnum = z.enum(['shoes', 'jackets', 'tops', 'bottoms'])

// 商品検索パラメータのスキーマ
const ProductSearchParametersSchema = z.object({
  category: CategoryEnum.describe('メイン商品カテゴリ'),
  subcategory: z.string().describe('メインカテゴリ内の具体的なサブカテゴリ'),
  color: z.string().describe('色の希望（標準的な色名を使用）'),
})

export type ProductSearchParameters = z.infer<typeof ProductSearchParametersSchema>
export type Category = z.infer<typeof CategoryEnum>
```

### 実装

```typescript
export class ProductRecommendationAgent {
  private structuredClient: ReturnType<typeof withStructuredOutputs>

  constructor(client: LlmClient) {
    this.structuredClient = withStructuredOutputs(client)
  }

  private readonly systemPrompt = `
    あなたは衣類推薦エージェントで、ユーザーにぴったりの商品を見つけることに特化しています。
    ユーザーの入力と、性別、年齢層、季節などの追加コンテキストが提供されます。
    ユーザーのプロファイルと好みにマッチする衣類をデータベースから検索するツールが装備されています。
    ユーザー入力とコンテキストに基づいて、データベース検索に使用する最も適切なパラメータ値を決定してください。

    ウェブサイトで利用可能な異なるカテゴリ:
    - shoes: ブーツ、スニーカー、サンダル
    - jackets: 冬用コート、カーディガン、パーカー、レインジャケット
    - tops: シャツ、ブラウス、Tシャツ、クロップトップ、セーター
    - bottoms: ジーンズ、スカート、ズボン、ジョガー

    幅広い色が利用可能ですが、一般的な色名を使用してください。
  `.trim()

  /**
   * ユーザー入力とコンテキストから商品検索パラメータを抽出
   */
  async extractSearchParameters(
    userInput: string,
    context: string,
  ): Promise<ProductSearchParameters | null> {
    const messages: LlmMessage[] = [
      { role: 'system', content: this.systemPrompt },
      { role: 'user', content: `コンテキスト: ${context}\nユーザー入力: ${userInput}` },
    ]

    const response = await this.structuredClient.chatWithSchema(
      messages,
      ProductSearchParametersSchema,
      'ProductSearchParameters',
      { temperature: 0 },
    )

    if (response.refusal) {
      throw new Error(`商品推薦エージェントが拒否: ${response.refusal}`)
    }

    return response.parsed || null
  }

  /**
   * 検索パラメータをフォーマットして表示
   */
  formatSearchParameters(params: ProductSearchParameters): string {
    return `検索パラメータ:
カテゴリ: ${params.category}
サブカテゴリ: ${params.subcategory}
色: ${params.color}`
  }
}
```

### 使用例

```typescript
const agent = new ProductRecommendationAgent(llmClient)

const params = await agent.extractSearchParameters(
  '新しいコートを探しています。いつも寒いので温かいものを！できれば目の色に合うものを。',
  '性別: 女性, 年齢層: 40-50, 外見: 青い目',
)

if (params) {
  console.log(agent.formatSearchParameters(params))
  // 出力:
  // 検索パラメータ:
  // カテゴリ: jackets
  // サブカテゴリ: winter coats
  // 色: blue
}
```

## 応用例：複雑なネストスキーマ（漫画ページレイアウト）

より複雑な構造を持つ漫画ページのレイアウト生成の例です。

### Zodスキーマ定義

```typescript
// パネル位置のスキーマ
const PanelPositionSchema = z.object({
  x: z.number().min(0).describe('パネルのX座標'),
  y: z.number().min(0).describe('パネルのY座標'),
  width: z.number().positive().describe('パネルの幅'),
  height: z.number().positive().describe('パネルの高さ'),
})

// パネル内容のスキーマ
const PanelContentSchema = z.object({
  dialogue: z.string().optional().describe('パネル内のキャラクターの台詞'),
  narration: z.string().optional().describe('パネル内のナレーションテキスト'),
  characters: z.array(z.string()).describe('パネルに登場するキャラクター'),
})

// 漫画パネルのスキーマ
const MangaPanelSchema = z.object({
  id: z.string().describe('パネルの一意識別子'),
  position: PanelPositionSchema.describe('パネルの位置と寸法'),
  content: PanelContentSchema.describe('パネル内の内容'),
})

// 漫画ページ全体のスキーマ
const MangaPageSchema = z.object({
  id: z.string().describe('ページの一意識別子'),
  pageNumber: z.number().positive().describe('漫画内のページ番号'),
  panels: z.array(MangaPanelSchema).min(1).describe('このページのパネル配列'),
  metadata: z.record(z.unknown()).optional().describe('ページの追加メタデータ'),
})

export type MangaPage = z.infer<typeof MangaPageSchema>
export type MangaPanel = z.infer<typeof MangaPanelSchema>
```

### 実装と使用例

```typescript
export class MangaPageGenerator {
  private structuredClient: ReturnType<typeof withStructuredOutputs>

  constructor(client: LlmClient) {
    this.structuredClient = withStructuredOutputs(client)
  }

  /**
   * シーン説明に基づいて漫画ページレイアウトを生成
   */
  async generatePageLayout(
    sceneDescription: string,
    pageNumber: number,
  ): Promise<MangaPage | null> {
    const messages: LlmMessage[] = [
      {
        role: 'system',
        content: `あなたは専門的な漫画ページレイアウトデザイナーです。提供されたシーン説明に基づいて
                 漫画ページレイアウトを作成してください。各パネルの位置、内容、キャラクターを含めて
                 ください。シーンの劇的な流れに適した視覚的に興味深いレイアウトを作ってください。`,
      },
      {
        role: 'user',
        content: `ページ${pageNumber}のこのシーンの漫画ページレイアウトを作成: ${sceneDescription}`,
      },
    ]

    const response = await this.structuredClient.chatWithSchema(
      messages,
      MangaPageSchema,
      'MangaPage',
      { temperature: 0.7, maxTokens: 2000 },
    )

    if (response.refusal) {
      throw new Error(`漫画ページ生成が拒否: ${response.refusal}`)
    }

    return response.parsed || null
  }
}
```

## Refusal（拒否）ハンドリング

Structured Outputsでは、安全性の理由でモデルがリクエストを拒否する場合があります：

```typescript
const response = await structuredClient.chatWithSchema(messages, schema, 'SchemaName')

if (response.refusal) {
  console.log('リクエストが拒否されました:', response.refusal)
  // 拒否時の処理
} else if (response.parsed) {
  // 正常な構造化データ
  console.log('取得データ:', response.parsed)
} else {
  // パースエラー（構造化データが期待される形式ではない）
  console.log('パースに失敗しました。生の内容:', response.content)
}
```

## エラーハンドリング

安全なパースには`safeChatWithSchema`を使用できます：

```typescript
const result = await structuredClient.safeChatWithSchema(messages, schema, 'SchemaName')

if (result.success) {
  console.log('成功:', result.response?.parsed)
} else {
  console.error('失敗:', result.error)
}
```

## 最適化のヒント

1. **スキーマ設計**: 複雑すぎるスキーマは避け、必要最小限の構造にする
2. **説明の追加**: `.describe()`を使用して各フィールドの目的を明確にする
3. **エラーハンドリング**: Refusalと解析エラーの両方に対応する
4. **プロバイダー制限**: 各プロバイダーのStructured Outputs対応状況を確認

## 制限事項

- OpenAI Structured OutputsはJSON Schema referencesをサポートしません
- Groqは一部のJSON Schema機能に制限があります（`const`, `format`, `pattern`など）
- プロバイダーによってはrefusal機能が限定的です

Structured Outputsは`gpt-4o-mini`、`gpt-4o-2024-08-06`、および将来のモデルでのみ利用可能です。
