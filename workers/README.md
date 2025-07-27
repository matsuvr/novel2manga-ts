# Novel2Manga Workers API

Cloudflare Workers APIの実装

## セットアップ手順

### 1. Cloudflare APIトークンの設定

1. [Cloudflareダッシュボード](https://dash.cloudflare.com/)にログイン
2. My Profile > API Tokens から新しいトークンを作成
3. "Edit Cloudflare Workers"テンプレートを使用
4. 以下のコマンドで環境変数を設定：

```bash
# Windows
set CLOUDFLARE_API_TOKEN=your-token-here

# Mac/Linux
export CLOUDFLARE_API_TOKEN=your-token-here
```

### 2. D1データベースの作成

```bash
cd workers
wrangler d1 create novel2manga
```

出力されたdatabase_idを`wrangler.toml`の`database_id`に設定

### 3. D1データベースへのスキーマ適用

```bash
wrangler d1 execute novel2manga --local --file=../database/schema.sql
wrangler d1 execute novel2manga --remote --file=../database/schema.sql
```

### 4. R2バケットの作成

```bash
wrangler r2 bucket create novel2manga-storage
```

### 5. ローカル開発

```bash
npm run dev
```

### 6. デプロイ

```bash
npm run deploy
```

## API エンドポイント

- `POST /api/analyze` - テキストを分析してチャンクに分割
- `GET /api/job/:id` - ジョブとチャンクの情報を取得