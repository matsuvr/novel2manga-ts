/** @type {import('next').NextConfig} */

import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// Pure config: no logger import / side effects.

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
