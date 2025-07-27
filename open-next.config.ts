import { defineCloudflareConfig } from "@opennextjs/cloudflare";

export default defineCloudflareConfig({
  // キャッシュ設定
  cache: {
    // APIルートのキャッシュ設定
    api: {
      // デフォルト: 60秒
      ttl: 60,
      // 特定のルートのキャッシュ設定
      routes: {
        "/api/generate": {
          // 生成APIは負荷が高いため、5分間キャッシュ
          ttl: 300,
        },
        "/api/health": {
          // ヘルスチェックはキャッシュしない
          ttl: 0,
        },
      },
    },
    // 静的アセットのキャッシュ設定
    static: {
      // デフォルト: 1年間
      ttl: 31536000,
      // 画像ファイルのキャッシュ設定
      patterns: {
        "/**/*.{jpg,jpeg,png,webp,avif,gif,svg}": {
          ttl: 86400, // 1日
        },
        "/**/*.{js,css}": {
          ttl: 604800, // 1週間
        },
      },
    },
  },
  
  // Cloudflare特有の設定
  cloudflare: {
    // KVを使用したキャッシュ（推奨）
    kvCache: true,
    
    // エッジロケーションでのISR（Incremental Static Regeneration）
    edgeISR: true,
    
    // 画像最適化
    imageOptimization: {
      // Cloudflare Imagesを使用
      useCloudflareImages: true,
      // 対応フォーマット
      formats: ["webp", "avif"],
      // 品質設定
      quality: 85,
    },
  },
  
  // サーバーサイドレンダリング設定
  serverComponents: {
    // React Server Componentsのストリーミング有効化
    streaming: true,
  },
  
  // ミドルウェア設定
  middleware: {
    // エッジでの実行
    edge: true,
  },
  
  // 環境変数の検証（必要に応じて）
  env: {
    // 必須の環境変数
    required: [
      "OPENAI_API_KEY",
    ],
    // オプションの環境変数
    optional: [
      "MASTRA_DB_URL",
      "NEXT_PUBLIC_APP_URL",
    ],
  },
});