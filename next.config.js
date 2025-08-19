/** @type {import('next').NextConfig} */
import { fileLogger } from './src/utils/logger.mjs'

// 開発環境でのログ機能を初期化
if (process.env.NODE_ENV === 'development') {
  console.log('🚀 Initializing file logging for development server...')
  try {
    console.log(`📝 Log file: ${fileLogger.getLogFilePath()}`)
    console.log('✅ File logging initialized successfully')
  } catch (error) {
    console.error('❌ Failed to initialize file logging:', error)
  }
}

const nextConfig = {
  reactStrictMode: true,
  // better-sqlite3 をビルド時に含める必要があるための設定（OpenNext/CFへ影響しないローカル専用）
  // NOTE: 本番ビルドは OpenNext によってラップされるため挙動は変わりません
  serverExternalPackages: ['better-sqlite3'],
  // Next.js のビルド時 ESLint 実行を無効化（CI では独自に `npm run lint:check` を走らせる）
  eslint: {
    ignoreDuringBuilds: true,
  },
  // 環境変数をサーバーサイドで確実に利用できるように設定
  env: {
    VERTICAL_TEXT_API_URL: process.env.VERTICAL_TEXT_API_URL,
    VERTICAL_TEXT_API_KEY: process.env.VERTICAL_TEXT_API_KEY,
    VERTICAL_TEXT_API_TOKEN: process.env.VERTICAL_TEXT_API_TOKEN,
  },
  // Fast Refreshの最適化
  webpack: (config, { dev, isServer }) => {
    if (dev && !isServer) {
      config.watchOptions = {
        poll: 1000,
        aggregateTimeout: 300,
      }
    }
    return config
  },
}

export default nextConfig
