/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
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
