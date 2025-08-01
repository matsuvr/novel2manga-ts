# 🚀 小説処理フロー統合テスト 実行ガイド

## クイックスタート

### 1. 環境設定

`.env.test` ファイルを作成し、API Keyを設定：

```env
# 必須: LLMプロバイダー (最低2つ)
OPENROUTER_API_KEY=sk-or-v1-xxx...
GEMINI_API_KEY=AIzaSyxxx...

# オプション: 追加フォールバック
CLAUDE_API_KEY=sk-ant-api03-xxx...
OPENAI_API_KEY=sk-proj-xxx...

# その他設定
NODE_ENV=test
DATABASE_URL="file:./dev.db"
```

### 2. テスト実行

**推奨: 完全自動実行**
```bash
# Windows
npm run test:full-flow:win

# Linux/Mac
npm run test:full-flow
```

**手動実行**
```bash
# 1. サーバー起動
npm run dev

# 2. テスト実行 (別ターミナル)
npm run test:integration
```

## テスト内容

1. ✅ **小説読み込み**: `宮本武蔵地の巻.txt` (約10万文字)
2. ✅ **アップロード**: `/api/novel` エンドポイント
3. ✅ **解析・分割**: `/api/analyze` エンドポイント
4. ✅ **エピソード分析**: `/api/jobs/{jobId}/episodes` エンドポイント
5. ✅ **レイアウト生成**: `/api/layout/generate` エンドポイント
6. ✅ **LLMフォールバック**: OpenRouter → Gemini → Claude

## 期待される結果

```
🚀 小説処理フロー統合テスト開始
✓ LLMプロバイダー接続成功: openrouter
✓ 小説読み込み成功: 123456文字
✓ 小説アップロード成功: UUID=abc123...
✓ チャンク分割は次のステップで実行されます
✓ テキスト分析完了: 25チャンクを生成・分析
✓ エピソード分析完了: 3個のエピソードを生成
✓ コマ割りYAML生成完了: 8ページ分のレイアウト
✓ 統合テスト完了: 小説→漫画レイアウトまでの全工程が正常に動作
```

## トラブルシューティング

| エラー | 解決方法 |
|--------|----------|
| `API key not found` | `.env.test` にAPI Keyを設定 |
| `ECONNREFUSED` | `npm run dev` でサーバー起動 |
| `ENOENT: no such file` | `docs/宮本武蔵地の巻.txt` が存在するか確認 |
| `Request timeout` | API Key有効性確認、レート制限に注意 |

## 設定項目

- **タイムアウト**: 最大10分 (長文処理のため)
- **LLMプロバイダー**: OpenRouter → Gemini フォールバック
- **テストファイル**: 宮本武蔵地の巻 (約10万文字)
- **チャンク数**: 20-30個程度に分割
- **エピソード数**: 2-5個程度

このテストにより、システム全体の動作確認が完了します。
