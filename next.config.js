/** @type {import('next').NextConfig} */

import { createRequire } from 'node:module'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

// Backwards-compatible: require the TS logger utils to avoid ESM loader issues in Next build
let fileLogger
try {
  // In ESM contexts, `require` is not available; use createRequire to load the legacy module
  const requireFromCwd = createRequire(import.meta.url)
  // Attempt to load the compiled JS/TS output or the source module if available
  const loggerModule = requireFromCwd('./src/infrastructure/logging/logger')
  fileLogger = loggerModule?.fileLogger
} catch (err) {
  // fallback to a noop-ish placeholder but keep the error visible for debugging
  // eslint-disable-next-line no-console
  console.debug('next.config.js: failed to load logger module, falling back to noop fileLogger', err)
  fileLogger = { getLogFilePath: () => '' }
}

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
  serverExternalPackages: ['better-sqlite3', '@napi-rs/canvas'],
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
    // NOTE: Removed custom optimization overrides to avoid interfering with CSS/PostCSS pipeline.
    if (dev && !isServer) {
      config.watchOptions = {
        poll: 1000,
        aggregateTimeout: 300,
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
