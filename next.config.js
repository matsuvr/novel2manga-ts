/** @type {import('next').NextConfig} */
import path from 'node:path'
import { fileLogger } from './src/utils/logger.mjs'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

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
  // SQLite3 をビルド時に含めるための設定
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
  // Fast Refreshの最適化とパフォーマンス改善
  webpack: (config, { dev, isServer }) => {
    if (dev && !isServer) {
      config.watchOptions = {
        poll: 1000,
        aggregateTimeout: 300,
      }
      // 開発環境でのビルド最適化
      config.optimization = {
        ...config.optimization,
        removeAvailableModules: false,
        removeEmptyChunks: false,
        splitChunks: false,
      }
    }
    // Path alias for '@/*' used throughout the project
    config.resolve.alias = {
      ...(config.resolve.alias ?? {}),
      '@': path.resolve(__dirname, 'src'),
    }
    return config
  },
}

export default nextConfig
