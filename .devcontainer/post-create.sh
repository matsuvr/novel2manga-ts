#!/bin/bash

# Novel2Manga DevContainer Post-Create Script

echo "🚀 Setting up Novel2Manga development environment..."

# 作業ディレクトリに移動
cd /workspace

# Node.jsのバージョン確認
echo "📦 Node.js version: $(node --version)"
echo "📦 npm version: $(npm --version)"

# 依存関係のインストール
echo "📦 Installing dependencies..."
npm install

# Playwrightブラウザーのインストール
echo "🎭 Installing Playwright browsers..."
npx playwright install --with-deps

# Codex CLIほかのインストール
echo "🤖 Installing Codex CLI..."
npm install -g @openai/codex @google/gemini-cli @charmland/crush
echo "✅ Codex CLI installed"

mkdir -p ~/.codex && cp /workspace/codex_config.toml ~/.codex/config.toml

# データベースの初期化
echo "🗄️ Initializing database..."
if [ -f "src/db/schema.ts" ]; then
    npm run db:generate
    echo "✅ Database schema generated"
else
    echo "⚠️ Database schema not found, skipping initialization"
fi

# 環境変数ファイルの確認
if [ ! -f ".env" ]; then
    echo "⚠️ .env file not found. Please create one with your API keys:"
    echo "   OPENAI_API_KEY=your-openai-api-key"
    echo "   GOOGLE_APPLICATION_CREDENTIALS=path/to/service-account.json"
    echo "   CLOUDFLARE_API_TOKEN=your-cloudflare-api-token"
    echo "   CLOUDFLARE_ACCOUNT_ID=your-account-id"
fi

# 権限の設定
echo "🔧 Setting up permissions..."
chmod +x scripts/*.ts 2>/dev/null || true
chmod +x scripts/*.js 2>/dev/null || true

# 開発サーバーの準備
echo "🌐 Development server will be available at: http://localhost:3000"
echo "☁️ Wrangler dev server will be available at: http://localhost:8788"

echo "✅ Setup complete! You can now start development with:"
echo "   dev     - Start Next.js development server"
echo "   test    - Run tests"
echo "   lint    - Run linting"
echo "   format  - Format code"
echo ""
