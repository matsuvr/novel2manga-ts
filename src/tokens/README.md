# Gemini Token Counter Implementation

このディレクトリには、Gemini (Vertex AI 含む) のトークン計測・表示機能の実装が含まれています。

## 📋 概要

この機能は、Gemini API / Vertex AI 利用時に以下の情報を取得・表示します：

- **入力トークン数**
- **出力トークン数**
- **合計トークン数**
- **キャッシュトークン数** (利用時)
- **思考トークン数** (thinkingモデル利用時)

## 🏗️ アーキテクチャ

### 主要コンポーネント

#### `TokenMeter` クラス (`tokenMeter.ts`)

- **目的**: Gemini SDK との統合とトークン計測の中心的な役割を担う
- **主要メソッド**:
  - `preflight()`: 送信前のトークン予測 (countTokens API使用)
  - `finalize()`: 応答後の確定値抽出 (usageMetadataから)

#### 統合ポイント

##### LLM クライアント統合 (`llm/providers/gemini.ts`)

- GeminiClient に TokenMeter を統合
- 送信前: preflight → UI表示
- 送信後: finalize → 確定値反映
- 両ストリーミング・非ストリーミング対応

##### UI統合

- **`TextInputArea.tsx`**: 送信前のリアルタイム推定表示とツールチップ
- **`ResultsDisplay.tsx`**: 完了後の確定値表示
- **`ProcessingProgress.tsx`**: 進行中の暫定表示

## 🔧 使用方法

### 基本的な初期化

```typescript
// Google AI (API Key) の場合
const meter = new TokenMeter({
  model: 'gemini-2.5-flash',
  apiKey: 'your-api-key',
})

// Vertex AI の場合
const meter = new TokenMeter({
  model: 'gemini-2.5-pro',
  vertexai: {
    project: 'your-project-id',
    location: 'us-central1',
    serviceAccountPath: '/path/to/service-account.json',
  },
})
```

### preflight: 送信前の予測

```typescript
// 文字列入力の場合
const result = await meter.preflight('こんにちは、世界！')
console.log(`推定トークン数: ${result.inputTokens}`)

// 複雑な入力の場合
const result = await meter.preflight({
  contents: [{ role: 'user', parts: [{ text: '質問' }] }],
  systemInstruction: {
    role: 'system',
    parts: [{ text: '指示' }],
  },
})
```

### finalize: 応答後の確定値

```typescript
// API応答からトークン情報を抽出
const tokenUsage = meter.finalize(apiResponse)
console.log(`確定値:`, {
  input: tokenUsage.promptTokenCount,
  output: tokenUsage.candidatesTokenCount,
  total: tokenUsage.totalTokenCount,
  cached: tokenUsage.cachedContentTokenCount,
  thoughts: tokenUsage.thoughtsTokenCount,
})
```

## 📊 トークン計測ルール

### APIベースの計測 (優先)

- **正確な計測**: `countTokens` API または `usageMetadata` を使用
- **マルチモーダル対応**: 画像/動画/音声の正確なトークン計算

### フォールバック推定 (API障害時)

- **日本語/中国語/韓国語**: 1文字 ≒ 1トークン
- **英語**: 4文字 ≒ 1トークン (スペース含む)
- **画像**: 258トークン/タイル (384px以下)
- **動画**: 263トークン/秒
- **音声**: 32トークン/秒

### 言語混合の場合

```typescript
// "Hello こんにちは world" の場合:
// - 英語部分: "Hello world" (11文字) ≒ 3トークン
// - 日本語部分: "こんにちは" (5文字) ≒ 5トークン
// - 合計: 8トークン
```

## 🎯 UI表示仕様

### 送信前 (TextInputArea)

- **リアルタイム表示**: "🔢 入力トークン見積り: 150"
- **ツールチップ**: 計測ルールの詳細表示
- **色分け**: 推定値を示すカラーバッジ

### 進行中 (ProcessingProgress)

- **暫定表示**: "入力 100 / 出力 50 トークン"
- **更新頻度**: 定期ポーリング (デフォルト5秒間隔)

### 完了後 (ResultsDisplay)

- **確定値**: "入力: 120 | 出力: 80 | 合計: 200"
- **キャッシュ/思考表示**: 該当する場合のみ表示
- **コスト推定**: 設定されたレートでの概算表示

## 🔍 テスト

### ユニットテスト

```bash
# TokenMeter のテスト実行
npm test -- src/__tests__/tokens/tokenMeter.test.ts
```

テストカバー範囲:

- ✅ preflight メソッドの様々な入力形式
- ✅ finalize メソッドのメタデータ抽出
- ✅ フォールバック推定の正確性
- ✅ Google AI と Vertex AI の両方対応
- ✅ エラーハンドリング

## ⚙️ 環境変数

### Google AI (API Key)

```bash
GEMINI_API_KEY=your-api-key
```

### Vertex AI

```bash
VERTEX_AI_PROJECT=your-project-id
VERTEX_AI_LOCATION=us-central1
GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account.json
```

## 📈 テレメトリ

### preflight イベント

```json
{
  "service": "tokens_preflight",
  "model": "gemini-2.5-flash",
  "inputTokens": 150,
  "latency": 45,
  "fallbackNote": "Fallback estimation due to API failure"
}
```

### finalize イベント

```json
{
  "service": "tokens_final",
  "model": "gemini-2.5-flash",
  "promptTokenCount": 120,
  "candidatesTokenCount": 80,
  "totalTokenCount": 200,
  "latency": 1250,
  "streamed": true
}
```

## 🔧 APIリファレンス

### TokenMeterOptions

```typescript
interface TokenMeterOptions {
  model?: string // デフォルト: 'gemini-2.5-flash'
  apiKey?: string // Google AI API Key
  vertexai?: {
    // Vertex AI 設定
    project: string
    location: string
    serviceAccountPath?: string
  }
}
```

### TokenPreflight

```typescript
interface TokenPreflight {
  inputTokens: number // 推定入力トークン数
  note?: string // フォールバック時の注記
}
```

### TokenUsage

```typescript
interface TokenUsage {
  promptTokenCount: number // 確定入力トークン数
  candidatesTokenCount: number // 確定出力トークン数
  totalTokenCount: number // 確定合計トークン数
  cachedContentTokenCount?: number // キャッシュ利用トークン数
  thoughtsTokenCount?: number // 思考トークン数
  promptTokensDetails?: unknown // モダリティ詳細
  candidatesTokensDetails?: unknown // 出力モダリティ詳細
}
```

## 🚨 制限事項と注意点

1. **API依存**: トークン計測は Gemini API の可用性に依存
2. **レート制限**: countTokens API にもレート制限が適用される
3. **コスト**: 高頻度での preflight 呼び出しはコストに影響
4. **リアルタイム性**: 大きなファイルの場合、初回推定に時間がかかる
5. **マルチモーダル**: 現在ベーシックなテキストベースのみ。高度な画像/動画対応は今後

## 📝 今後の拡張予定

- [ ] T-08: マルチモーダル前処理実装 (images/videos/audio)
- [ ] E2Eテスト実装
- [ ] 高度なコスト計算機能
- [ ] カスタムモデル対応
- [ ] トークン使用履歴の永続化
- [ ] リアルタイム課金連携
