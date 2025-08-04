# Novel2Manga Project Overview

## プロジェクトの目的
小説をマンガ形式に自動変換するWebアプリケーション。具体的には：
- 小説テキストを自動でマンガのコマ割りレイアウトに変換
- AI（Mastra）を使用してテキスト解析と5要素抽出（登場人物、シーン、対話、ハイライト、状況）
- エピソード分割とマンガレイアウト（YAML形式）の生成
- Canvas APIを使用した絵コンテ画像の生成
- 編集者を補佐するツールとして機能（マンガの絵そのものは生成しない）

## 技術スタック
- **フロントエンド**: Next.js 15 (App Router) + TypeScript + Tailwind CSS
- **バックエンド**: Next.js API Routes + Mastra Agents
- **AI Framework**: Mastra (TypeScript agent framework)
- **LLM Providers**: OpenAI, Gemini, Groq, Claude, OpenRouter (フォールバック対応)
- **データベース**: Cloudflare D1 (SQLite ベース) / 開発時はローカルSQLite
- **ストレージ**: Cloudflare R2 (本番) / ローカルファイルシステム (開発)
- **キャッシュ**: Cloudflare KV
- **デプロイ**: Cloudflare Workers (OpenNext adapter)
- **テスト**: Vitest + Playwright + React Testing Library
- **Code Quality**: Biome (lint & format)

## 主な機能
1. **テキスト入力と解析**: 小説テキストの読み込みとチャンク分割
2. **5要素抽出**: AI による登場人物、シーン、対話、ハイライト、状況の抽出
3. **エピソード構成**: 連載マンガとしてのエピソード分割
4. **レイアウト生成**: YAMLでのマンガレイアウト記述（コマ割りと吹き出し配置）
5. **絵コンテ描画**: Canvas APIによる枠線・テキスト・吹き出しのみの描画
6. **エクスポート**: PDF、CBZ、画像ZIP形式での出力

## アーキテクチャパターン
- **Spec-Driven Development**: Kiro-style仕様駆動開発
- **Mastraエージェント**: AI処理の抽象化
- **Storage/Database抽象化**: 環境別実装の切り替え
- **3層アーキテクチャ**: Frontend → Business Logic → Data Layer