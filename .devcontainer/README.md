# Novel2Manga DevContainer

このプロジェクトの開発環境をDevContainerで提供します。

## 前提条件

- Docker Desktop
- Visual Studio Code
- VS Code Dev Containers 拡張機能

## セットアップ

1. **DevContainerの起動**

   ```bash
   # VS Codeでプロジェクトを開く
   code .

   # DevContainerで開く（Ctrl+Shift+P → "Dev Containers: Reopen in Container"）
   ```

2. **初回セットアップ**
   - コンテナのビルドが完了すると、自動的に `npm install` が実行されます
   - データベースの初期化も自動で行われます
   - Playwrightのブラウザ本体と依存関係も自動でインストールされます（`npx playwright install --with-deps`）

## 利用可能なコマンド

### 開発コマンド

- `dev` - Next.js開発サーバー起動 (http://localhost:3000)
- `build` - プロダクションビルド
- `test` - ユニットテスト実行
- `test:watch` - テストの監視モード
- `test:e2e` - E2Eテスト実行
- `test:coverage` - カバレッジ付きテスト実行

### コード品質

- `lint` - Biomeによるlinting
- `format` - コードフォーマット
- `check` - lint + format チェック

### データベース

- `db:studio` - Drizzle Studio起動
- `db:migrate` - マイグレーション実行
- `db:generate` - マイグレーションファイル生成
- `db:push` - スキーマをDBにプッシュ

### Cloudflare

- `preview` - OpenNextプレビュー
- `deploy` - Cloudflare Workersにデプロイ
- `wr-dev` - Wrangler開発サーバー

### Git

- `gs` - git status
- `ga` - git add
- `gc` - git commit
- `gp` - git push

## ポート

- **3000** - Next.js開発サーバー
- **8788** - Wrangler開発サーバー

## 環境変数

`.env` ファイルをプロジェクトルートに作成してください：

```env
# OpenAI API
OPENAI_API_KEY=your-openai-api-key

# Google AI (Vertex AI)
GOOGLE_APPLICATION_CREDENTIALS=path/to/service-account.json

# Cloudflare
CLOUDFLARE_API_TOKEN=your-cloudflare-api-token
CLOUDFLARE_ACCOUNT_ID=your-account-id

# データベース
DATABASE_URL=file:./database/novel2manga.db
```

重要: APIキー等の機密情報はDockerfileやGitにコミットしないでください。DevContainerでは以下のいずれかの方法で安全に注入してください。

- `.env` / `.env.local` に保存（ローカル専用。絶対にリポジトリへコミットしない）
- `devcontainer.json` の `remoteEnv` を使用してホストから渡す（共有禁止の注意喚起を添える）
- VS Codeの「環境変数の秘密管理」やOSキーリングを利用

例（devcontainer.json）:

```jsonc
{
  // ...
  "remoteEnv": {
    // 例: 開発者ローカルでのみ設定する。リポジトリへは置かないこと。
    // "CEREBRAS_API_KEY": "${localEnv:CEREBRAS_API_KEY}"
  },
}
```

本リポジトリでは、Dockerfile等に秘密情報をハードコードしません。既に機密値が含まれていた場合は直ちに削除し、キーのローテーションを行ってください。

## トラブルシューティング

### コンテナが起動しない場合

```bash
# Docker Desktopが起動していることを確認
docker --version

# コンテナのログを確認
docker logs <container-id>
```

### 依存関係の問題

```bash
# node_modulesを削除して再インストール
rm -rf node_modules package-lock.json
npm install
```

### Playwrightの問題

```bash
# ブラウザーを再インストール
npx playwright install --with-deps
```

## 開発フロー

1. **機能開発**

   ```bash
   # 開発サーバー起動
   dev

   # 別ターミナルでテスト実行
   test:watch
   ```

2. **コード品質チェック**

   ```bash
   # フォーマットとlint
   check

   # テスト実行
   test:coverage
   ```

3. **デプロイ**
   ```bash
   # ビルドとデプロイ
   deploy
   ```

## 注意事項

- ホストマシンのファイルは `/workspace` にマウントされます
- `node_modules` はコンテナ内のボリュームに保存されます
- データベースファイルはホストマシンと共有されます
- 環境変数は `.env` ファイルで管理してください

### セキュリティに関する補足（Codex/Codingエージェントの設定）

- `codex_config.toml` の `sandbox_mode` は原則として最小権限（`workspace-write` など）を使用します。
- `danger-full-access` は強い権限を与えるため推奨しません。やむを得ず使用する場合は、実行前の差分確認・承認フロー（`approval_policy = "on-request"` 等）を厳格に運用してください。
