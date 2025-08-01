# 小説処理フロー統合テスト

このテストは、小説ファイルから漫画のコマ割りYAMLを生成するまでの一連の処理をエンドツーエンドでテストします。

## テスト対象の処理フロー

1. **小説ファイルの読み込み**
   - `docs/宮本武蔵地の巻.txt` を使用
   - 約10万文字の長文小説でテスト

2. **小説のアップロード**
   - `/api/novel` エンドポイントでアップロード
   - UUIDベースの管理

3. **チャンク分割**
   - `/api/novel/{uuid}/chunks` エンドポイントで分割
   - 設定可能なチャンクサイズとオーバーラップ

4. **テキスト分析**
   - `/api/novel/analyze` エンドポイントで各チャンクを分析
   - 登場人物、シーン、対話、ハイライト、状況を抽出

5. **エピソード分析**
   - `/api/novel/episodes` エンドポイントで物語弧を分析
   - 漫画エピソードの境界を決定

6. **コマ割りYAML生成**
   - `/api/layout/generate` エンドポイントでレイアウト生成
   - 日本式漫画のコマ割り設計

## LLMフォールバック機能

- **プライマリ**: OpenRouter
- **フォールバック**: Gemini → Claude
- プロバイダーの接続エラーやタイムアウト時に自動切り替え

## 前提条件

### 環境変数設定

`.env.test` ファイルを作成し、以下のAPI Keyを設定してください：

```env
# 最低限必要（フォールバック機能テストのため2つ以上）
OPENROUTER_API_KEY=your_openrouter_api_key_here
GEMINI_API_KEY=your_gemini_api_key_here

# オプション（より多くのフォールバックオプション）
CLAUDE_API_KEY=your_claude_api_key_here
OPENAI_API_KEY=your_openai_api_key_here
GROQ_API_KEY=your_groq_api_key_here
```

### 必要なファイル

- `docs/宮本武蔵地の巻.txt` が存在すること
- 小説ファイルは約10万文字以上の長文である必要があります

### サーバー

テスト実行前に、以下のいずれかを行ってください：

1. **手動でサーバー起動**:
   ```bash
   npm run dev
   ```

2. **自動起動スクリプト使用**:
   ```bash
   npm run test:full-flow      # Linux/Mac
   npm run test:full-flow:win  # Windows
   ```

## テスト実行方法

### 1. 基本的なテスト実行

```bash
# 環境変数を読み込んでテスト実行
npm run test:integration

# ウォッチモード
npm run test:integration:watch
```

### 2. 完全自動テスト（推奨）

```bash
# Linux/Mac
npm run test:full-flow

# Windows
npm run test:full-flow:win
```

このスクリプトは以下を自動で行います：
- 前提条件チェック
- サーバー起動確認・自動起動
- テスト実行
- 結果レポート
- クリーンアップ

### 3. 手動実行

```bash
# 1. サーバー起動
npm run dev

# 2. 別ターミナルでテスト実行
npx vitest run tests/integration/novel-processing-flow.test.ts \
  --reporter=verbose \
  --timeout=600000 \
  --config=vitest.config.ts
```

## テスト仕様

### タイムアウト設定

- **ファイル読み込み**: 10秒
- **アップロード**: 30秒
- **チャンク分割**: 60秒
- **テキスト分析**: 5分（API呼び出し×チャンク数）
- **エピソード分析**: 3分
- **レイアウト生成**: 2分

### 検証ポイント

#### 1. 小説読み込み
- ファイル存在確認
- 5万文字以上の文字数確認

#### 2. アップロード
- HTTP 200レスポンス
- UUIDの返却
- タイトル/著者の正確性

#### 3. チャンク分割
- 最低10チャンクの生成
- 各チャンクの構造検証
- インデックスの整合性

#### 4. テキスト分析
- 5要素の抽出確認
  - characters: 登場人物
  - scenes: シーン
  - dialogues: 対話
  - highlights: ハイライト
  - situations: 状況

#### 5. エピソード分析
- エピソード境界の特定
- 信頼度50%以上
- 各エピソードの構造検証

#### 6. レイアウト生成
- YAML形式の出力
- パネル構造の検証
- 日本式読み順の確認

#### 7. フォールバック機能
- プライマリプロバイダーの接続確認
- フォールバック動作の検証
- エラーハンドリング

## トラブルシューティング

### よくある問題

1. **API Key エラー**
   ```
   Error: API key not found for provider: openrouter
   ```
   → `.env.test` でAPI Keyが正しく設定されているか確認

2. **サーバー接続エラー**
   ```
   Error: fetch failed (ECONNREFUSED)
   ```
   → `npm run dev` でサーバーが起動しているか確認

3. **小説ファイルエラー**
   ```
   Error: ENOENT: no such file or directory
   ```
   → `docs/宮本武蔵地の巻.txt` が存在するか確認

4. **LLM タイムアウト**
   ```
   Error: Request timeout
   ```
   → API Keyが有効か確認、レート制限に注意

### パフォーマンス調整

- チャンク数を減らす（テスト用途では最初の3-10チャンクのみ）
- API呼び出し間隔の調整（2秒間隔）
- 並列処理の制限

## 期待される結果

成功時の出力例：

```
✓ 小説読み込み成功: 123456文字
✓ 小説アップロード成功: UUID=abc123...
✓ チャンク分割成功: 25個のチャンクを生成
✓ テキスト分析完了: 3チャンクを分析
✓ エピソード分析完了: 2個のエピソードを生成
✓ コマ割りYAML生成完了: 8ページ分のレイアウト
✓ OpenRouter接続成功
✓ 統合テスト完了: 小説→漫画レイアウトまでの全工程が正常に動作

処理完了サマリー:
{
  "novel": {
    "uuid": "abc123...",
    "originalLength": 123456
  },
  "chunking": {
    "totalChunks": 25,
    "avgChunkSize": 4938
  },
  "episodes": {
    "totalEpisodes": 2,
    "avgSignificance": 7.5,
    "avgConfidence": 0.85
  },
  "layouts": {
    "totalPages": 8,
    "totalPanels": 32
  }
}
```

このテストにより、システム全体の動作と各コンポーネントの連携が正常に機能することを確認できます。
