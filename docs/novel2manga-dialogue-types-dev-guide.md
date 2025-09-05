# 小説→マンガ変換：セリフタイプ別レンダリング機能開発指示書

## 1. 開発概要

小説をマンガに変換するサービスにおいて、セリフの種類（通常の発話、ナレーション、心の声）を判別し、それぞれ異なるスタイルでレンダリングする機能を実装する。

### 主要な変更点

- Script Conversionプロセスでセリフの種類を判定
- データスキーマを更新してセリフの種類情報を保持
- レンダリング時に種類に応じた書体と吹き出しスタイルを適用
- バッチレンダリングAPIとの連携を最適化

## 2. 仕様詳細

### 2.1 セリフの種類と表示仕様

| セリフ種類               | 識別方法                      | 吹き出し形状           | フォント                   | APIパラメータ     |
| ------------------------ | ----------------------------- | ---------------------- | -------------------------- | ----------------- |
| 通常の発話 (speech)      | `キャラ名：「...」`           | 通常の吹き出し（楕円） | アンチック体（デフォルト） | `font: undefined` |
| ナレーション (narration) | `ナレーション：「...」`       | 長方形の枠             | 明朝体                     | `font: "mincho"`  |
| 心の声 (thought)         | `キャラ名（心の声）：「...」` | 雲形吹き出し           | ゴシック体                 | `font: "gothic"`  |

### 2.2 データフロー

```
原文 → Script Conversion（種類判定） → パネルデータ（種類付き） → レンダリング（種類別スタイル適用）
```

## 3. 実装手順

### Step 1: スキーマの更新（`src/types/script.ts`）

#### 1.1 MangaPanelSchema の更新

現在の `dialogue` フィールド（文字列配列）を、種類情報を含むオブジェクト配列に変更する。

```typescript
// 新しいDialogueLineスキーマを追加
export const DialogueLineSchema = z.object({
  type: z.enum(['speech', 'narration', 'thought']),
  speaker: z.string().optional(), // ナレーションの場合は省略
  text: z.string(),
})

// MangaPanelSchemaを更新
export const MangaPanelSchema = z.object({
  no: z.number().int(),
  cut: z.string(),
  camera: z.string(),
  narration: z.array(z.string()).optional(), // 削除予定（dialogueに統合）
  dialogue: z.array(DialogueLineSchema).optional(), // 更新
  sfx: z.array(z.string()).optional(),
  importance: z.number().int(),
})
```

**注意**: `narration` フィールドは後方互換性のため一時的に残すが、最終的には `dialogue` に統合する。

### Step 2: Script Conversion プロンプトの更新（`src/config/app.config.ts`）

#### 2.1 システムプロンプトの更新

`scriptConversion.systemPrompt` に以下の指示を追加：

```
* セリフ種類の判定ルール：
  - 地の文から抽出した語り・説明は type:"narration" として「ナレーション」話者で dialogue に含める
  - キャラクターの内面・思考は type:"thought" として「キャラ名（心の声）」話者で dialogue に含める
  - 通常の発話は type:"speech" として「キャラ名」話者で dialogue に含める
  - narration フィールドは使用しない（後方互換性のため空配列とする）
```

#### 2.2 JSON出力形式の更新

```json
"panels": [
  {
    "no": 1,
    "cut": "...",
    "camera": "...",
    "narration": [], // 後方互換性のため空配列
    "dialogue": [
      {"type": "narration", "text": "ワシントン・スクエア西の小地区は..."},
      {"type": "speech", "speaker": "スー", "text": "ジョンジー、大丈夫？"},
      {"type": "thought", "speaker": "スー", "text": "なんて顔色が悪いんだろう..."}
    ],
    "sfx": [...],
    "importance": 1
  }
]
```

### Step 3: Script Converter の更新（`src/agents/script/script-converter.ts`）

#### 3.1 convertChunkToMangaScript 関数の更新

デモモードとテストモードの戻り値を新しいスキーマに合わせて更新：

```typescript
// デモモード/テストモードの場合
if (options?.isDemo || isTestEnv) {
  const panels = [
    {
      no: 1,
      cut: 'デモ用のカット',
      camera: 'WS・標準',
      narration: [], // 後方互換性のため空配列
      dialogue: [
        { type: 'narration' as const, text: `${input.chunkText.substring(0, 50)}...` },
        { type: 'speech' as const, speaker: 'デモキャラ', text: 'サンプル発話' },
      ],
      sfx: [],
      importance: 1,
    },
  ]
  // ...
}
```

### Step 4: パネルレイアウトタイプの更新（`src/types/panel-layout.ts`）

#### 4.1 Dialogue インターフェースに type フィールドを追加

```typescript
export interface Dialogue {
  speaker: string
  text: string
  emotion?: string
  position?: Point
  size?: Size
  type?: 'speech' | 'narration' | 'thought' // 追加
}
```

### Step 5: Script Adapters の更新（`src/utils/script-adapters.ts`）

#### 5.1 新旧フォーマット変換ロジックの追加

```typescript
// dialogueフィールドの変換処理を追加
function convertDialogueFormat(dialogue: any[]): Dialogue[] {
  return dialogue.map((item) => {
    // 新形式（オブジェクト）の場合
    if (typeof item === 'object' && 'type' in item) {
      return {
        speaker: item.speaker || (item.type === 'narration' ? 'ナレーション' : ''),
        text: item.text,
        type: item.type,
      }
    }
    // 旧形式（文字列）の場合
    if (typeof item === 'string') {
      // パターンマッチングで種類を判定
      if (item.startsWith('ナレーション：')) {
        return {
          speaker: 'ナレーション',
          text: item.replace(/^ナレーション[：:]/, ''),
          type: 'narration',
        }
      }
      const thoughtMatch = item.match(/^(.+?)（心の声）[：:](.+)$/)
      if (thoughtMatch) {
        return {
          speaker: thoughtMatch[1],
          text: thoughtMatch[2],
          type: 'thought',
        }
      }
      // 通常の発話
      const speechMatch = item.match(/^(.+?)[：:](.+)$/)
      if (speechMatch) {
        return {
          speaker: speechMatch[1],
          text: speechMatch[2],
          type: 'speech',
        }
      }
      // フォールバック
      return {
        speaker: '',
        text: item,
        type: 'speech',
      }
    }
    // その他の場合
    return {
      speaker: String(item.speaker || ''),
      text: String(item.text || item),
      type: 'speech',
    }
  })
}
```

### Step 6: Canvas Renderer の更新（`src/lib/canvas/canvas-renderer.ts`）

#### 6.1 吹き出し描画メソッドの更新

```typescript
private drawSpeechBubble(ctx: CanvasRenderingContext2D, dialogue: Dialogue) {
  const { position, size, type = 'speech' } = dialogue

  // タイプに応じて吹き出しスタイルを変更
  switch (type) {
    case 'narration':
      // 長方形の枠を描画
      ctx.strokeStyle = '#000000'
      ctx.lineWidth = 2
      ctx.fillStyle = '#ffffff'
      ctx.fillRect(position.x, position.y, size.width, size.height)
      ctx.strokeRect(position.x, position.y, size.width, size.height)
      // 話者ラベル（ナレーション）は表示しない
      break

    case 'thought':
      // 雲形吹き出しを描画
      this.drawCloudBubble(ctx, position, size)
      break

    case 'speech':
    default:
      // 通常の楕円形吹き出しを描画
      this.drawEllipseBubble(ctx, position, size)
      break
  }
}

private drawCloudBubble(ctx: CanvasRenderingContext2D, position: Point, size: Size) {
  // 雲形吹き出しの実装
  const { x, y } = position
  const { width, height } = size

  ctx.strokeStyle = '#000000'
  ctx.lineWidth = 2
  ctx.fillStyle = '#ffffff'

  // 雲形を小さな円の組み合わせで描画
  const cloudRadius = Math.min(width, height) * 0.15
  const cloudCount = 8

  ctx.beginPath()
  for (let i = 0; i < cloudCount; i++) {
    const angle = (Math.PI * 2 * i) / cloudCount
    const cx = x + width/2 + Math.cos(angle) * (width/2 - cloudRadius)
    const cy = y + height/2 + Math.sin(angle) * (height/2 - cloudRadius)
    ctx.arc(cx, cy, cloudRadius, 0, Math.PI * 2)
  }
  ctx.closePath()
  ctx.fill()
  ctx.stroke()
}
```

### Step 7: MangaPageRenderer の更新（`src/lib/canvas/manga-page-renderer.ts`）

#### 7.1 createPanelsFromChunks メソッドの更新

```typescript
private async createPanelsFromChunks(
  chunks: ChunkAnalysisResult[],
  pageIndex: number,
): Promise<Panel[]> {
  // ... 既存のコード ...

  for (let i = 0; i < panelLayouts.length; i++) {
    const layout = panelLayouts[i]
    const chunk = chunks[i]

    // 新形式のdialogueデータを正規化
    const normalizedDialogues: Dialogue[] = (chunk.dialogues || []).map((d: any) => {
      // 新形式（type付きオブジェクト）の場合
      if (typeof d === 'object' && 'type' in d) {
        return {
          speaker: d.speaker || '',
          text: d.text,
          emotion: d.emotion,
          type: d.type,
        }
      }
      // 既存形式への後方互換
      return {
        speaker: d.speaker || '',
        text: d.text || '',
        emotion: d.emotion,
        type: 'speech' as const,
      }
    })

    // ... 残りのコード ...
  }
}
```

#### 7.2 getFontForDialogue 関数の更新（`src/types/vertical-text.ts`）

```typescript
export function getFontForDialogue(dialogue: Dialogue): 'gothic' | 'mincho' | undefined {
  // typeフィールドが存在する場合は優先
  if (dialogue.type) {
    switch (dialogue.type) {
      case 'narration':
        return 'mincho'
      case 'thought':
        return 'gothic'
      case 'speech':
      default:
        return undefined // アンチック体
    }
  }

  // 後方互換性: speakerからタイプを推測
  if (dialogue.speaker === 'ナレーション') {
    return 'mincho'
  }
  if (dialogue.speaker?.includes('（心の声）')) {
    return 'gothic'
  }

  return undefined // デフォルト（アンチック体）
}
```

### Step 8: バリデーションの更新（`src/utils/script-validation.ts`）

#### 8.1 新しいdialogue形式のバリデーション

```typescript
export function validateDialogueFields(script: NewMangaScript): ValidationResult {
  const issues: string[] = []

  script.panels.forEach((panel, panelIndex) => {
    panel.dialogue?.forEach((dialogue, dialogueIndex) => {
      // 型チェック
      if (typeof dialogue !== 'object') {
        issues.push(`Panel ${panelIndex + 1}, Dialogue ${dialogueIndex + 1}: Must be an object`)
        return
      }

      // typeフィールドのバリデーション
      if (!['speech', 'narration', 'thought'].includes(dialogue.type)) {
        issues.push(
          `Panel ${panelIndex + 1}, Dialogue ${dialogueIndex + 1}: Invalid type "${dialogue.type}"`,
        )
      }

      // speakerフィールドのバリデーション
      if (dialogue.type !== 'narration' && !dialogue.speaker) {
        issues.push(
          `Panel ${panelIndex + 1}, Dialogue ${dialogueIndex + 1}: Speaker required for type "${dialogue.type}"`,
        )
      }

      // textフィールドのバリデーション
      if (!dialogue.text || dialogue.text.trim() === '') {
        issues.push(`Panel ${panelIndex + 1}, Dialogue ${dialogueIndex + 1}: Text cannot be empty`)
      }
    })
  })

  return {
    valid: issues.length === 0,
    issues,
  }
}
```

## 4. テスト計画

### 4.1 ユニットテスト

1. **Script Converter テスト** (`src/__tests__/script-converter.test.ts`)
   - セリフタイプの正しい判定
   - 新旧フォーマットの変換

2. **バリデーションテスト** (`src/__tests__/script-validation.test.ts`)
   - 無効なtypeフィールドの検出
   - 必須フィールドの欠落検出

3. **Vertical Text Client テスト** (`src/__tests__/vertical-text-client.test.ts`)
   - フォント選択ロジックの検証

### 4.2 統合テスト

1. **End-to-End レンダリングテスト**
   - 原文 → Script変換 → レンダリング の一連の流れ
   - 各セリフタイプが正しいスタイルで描画されることを確認

2. **バッチ処理テスト**
   - 複数のセリフタイプを含むページの一括レンダリング
   - パフォーマンスとメモリ使用量の確認

## 5. 移行計画

### Phase 1: 後方互換性を保持した実装（1週目）

- 新スキーマの実装
- 旧形式（文字列配列）から新形式への自動変換
- テストの作成と実行

### Phase 2: データ移行（2週目）

- 既存データの変換スクリプト作成
- 段階的なデータ移行
- 動作確認

### Phase 3: 旧形式の廃止（3週目）

- narrationフィールドの削除
- 旧形式サポートコードの削除
- ドキュメントの更新

## 6. 注意事項

### 6.1 パフォーマンス最適化

- バッチAPIの呼び出し回数を最小限に抑える
- フォント情報をキャッシュして重複判定を避ける

### 6.2 エラーハンドリング

- フォールバックは実装しない（CLAUDE.md準拠）
- エラー時は詳細なメッセージと共に処理を停止

### 6.3 コード品質

- 古いロジックは積極的に削除
- コンテキスト汚染を防ぐため、不要なコードは残さない

## 7. 実装チェックリスト（進捗）

- [x] スキーマの更新（DialogueLineSchema追加・panels.dialogueをオブジェクト配列化）
- [x] app.config.tsのプロンプト更新（種類判定ルール・JSON例修正）
- [x] Script Converterの更新（デモ戻り値/カバレッジ計測の新形式対応）
- [x] Panel Layoutタイプの確認（DialogueSchemaにtype既存のため変更不要）
- [x] Script Adaptersの変換ロジック追加（新旧format相互変換ユーティリティ）
- [x] Canvas Rendererの吹き出し描画更新（ナレーションの話者ラベル非表示/形状の適用確認）
- [x] MangaPageRendererの正規化処理更新（dialogue.type伝搬）
- [x] getFontForDialogue関数の更新（type優先・後方互換推測）
- [x] バリデーション関数の追加（dialogueオブジェクト検証）
- [ ] ユニットテストの作成・更新（必要箇所の追加）
- [ ] 統合テストの作成（E2Eは別PRで計画）
- [x] ドキュメントの更新（進捗反映）

### 進捗メモ

- Phase 1の「後方互換性を保持した実装」範囲で、スキーマ/プロンプト/コンバータ/描画入力の型整備を完了。
- Canvas描画: drawBubbleShapeで長方形（narration）/雲形（thought）/楕円（speech）を適用。ナレーション時は話者ラベルを抑制。
- ユニットテスト追加: bubbles形状とナレーションでのラベル非表示を検証。

## 8. 参考資料

- 縦書きテキストレンダリングAPI仕様（添付済み）
- 現在のプロジェクト構造: `G:\TsProjects\novel2manga-ts`
- 主要設定ファイル: `src/config/app.config.ts`
- スキーマ定義: `src/types/script.ts`
