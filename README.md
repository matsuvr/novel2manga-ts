# Novel2Manga - 小説から漫画を自動生成するAIサービス

## 概要

Novel2Mangaは、小説テキストを入力としてAIが自動的に漫画を生成する革新的なサービスです。OpenAI GPT、Google Gemini、Anthropic Claudeなどの最新のAIモデルを活用し、小説の分析からコマ割り、キャラクター設定、セリフ生成までを全自動で行います。

## アーキテクチャ

### 技術スタック

- **Frontend**: Next.js 15 (App Router)
- **Backend**: Next.js API Routes
- **Database**: SQLite3 + Drizzle ORM
- **Storage**: ローカルファイルシステム
- **Authentication**: NextAuth.js v5 (JWT)
- **Testing**: Vitest + Playwright
- **Deployment**: 標準的なNext.jsデプロイメント

### システム構成

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Next.js App   │    │   SQLite3 DB    │    │  Local Storage  │
│                 │    │                 │    │                 │
│ • API Routes    │◄──►│ • Novels        │    │ • Analysis JSON │
│ • React Components│   │ • Jobs          │    │ • Render Images │
│ • Authentication │    │ • Episodes      │    │ • Assets        │
└─────────────────┘    └─────────────────┘    └─────────────────┘
```

## 機能

### コア機能

- **小説アップロード**: テキストファイルのアップロードと解析
- **AI分析**: ストーリー構造、キャラクター、シーンの自動分析
- **漫画生成**: パネル割り、コマ作成、セリフ配置
- **エピソード管理**: 複数エピソードの生成と管理
- **リアルタイム処理**: ジョブの進捗状況確認

### ユーザー機能

- **認証・メール通知・退会機能**
  - **認証**: メールアドレスによるサインアップとログインを提供します。
  - **メール通知**: 処理状況などの通知を登録メールアドレス宛に送信します。
  - **退会機能**: ユーザーはいつでも設定画面からアカウントを削除できます。

## 開発環境のセットアップ

### 前提条件

- Node.js 18+
- npm または bun
- SQLite3

### インストール

```bash
# リポジトリのクローン
git clone <repository-url>
cd novel2manga-ts
cp .env.example .env.local
```

```env
# Database
DATABASE_URL="file:./database/novel2manga.db"

# Authentication

# AI Services
OPENAI_API_KEY="your-openai-key"
GOOGLE_AI_API_KEY="your-google-key"
ANTHROPIC_API_KEY="your-anthropic-key"

# Storage
STORAGE_BASE_PATH="./storage"
ANALYSIS_STORAGE_PATH="./storage/analysis"
RENDER_STORAGE_PATH="./storage/renders"
```

### データベースの初期化

```bash
# Drizzleマイグレーションの実行
npm run db:migrate

# 開発サーバーの起動
npm run dev
```

### テストの実行

```bash
# ユニットテスト
npm run test

# 統合テスト
npm run test:integration

# E2Eテスト
npm run test:e2e

# カバレッジレポート
npm run test:coverage
```

## デプロイメント

### 開発環境

```bash
npm run build
npm start
```

### 本番環境

```bash
# ビルド
npm run build

# 本番サーバー起動
npm run start:production
```

### Dockerデプロイメント

```bash
# Dockerイメージのビルド
docker build -t novel2manga .

# コンテナの実行
docker run -p 3000:3000 novel2manga
```

## API仕様

### 主要エンドポイント

- `POST /api/novel` - 小説のアップロード
- `POST /api/analyze` - 分析ジョブの開始
- `GET /api/jobs/[jobId]/status` - ジョブのステータス確認
- `GET /api/results/[jobId]` - 結果の取得

### 認証

すべてのAPIエンドポイントはJWTトークンによる認証が必要です。

## プロジェクト構造

```
novel2manga-ts/
├── src/
│   ├── app/                 # Next.js App Router
│   │   ├── api/            # API Routes
│   │   ├── (auth)/         # 認証関連ページ
│   │   └── (dashboard)/    # ダッシュボード
│   ├── components/         # Reactコンポーネント
│   ├── services/           # ビジネスロジック
│   ├── lib/               # ユーティリティ
│   └── __tests__/         # テストファイル
├── database/               # SQLite3データベース
├── storage/               # ファイルストレージ
├── drizzle/               # データベースマイグレーション
└── docs/                  # ドキュメント
```

## テスト戦略

### テストカテゴリ

- **ユニットテスト**: 個別の関数・コンポーネントのテスト
- **統合テスト**: サービス間の連携テスト
- **E2Eテスト**: ユーザー操作の完全シナリオテスト
- **パフォーマンステスト**: 負荷テストとベンチマーク

### カバレッジ目標

- 全体カバレッジ: 80%以上
- コア機能カバレッジ: 90%以上

## 移行情報

### OpenNext/CloudflareからNext.js + SQLite3への移行

このプロジェクトは2024年9月にOpenNext/Cloudflareアーキテクチャから純粋なNext.js + SQLite3アーキテクチャに移行しました。

#### 主な変更点

- **インフラ**: Cloudflare Pages → Vercel/標準ホスティング
- **データベース**: SQLite3 + Drizzle ORM (local)
- **ストレージ**: ローカルファイルシステム (`storage/outputs`)
- **認証**: NextAuth.js v5 (DB-backed sessions)
- **デプロイ**: 標準Next.jsデプロイ / Bun + Docker options

#### 移行後の利点

- **開発体験の向上**: ローカル開発が容易
- **コスト削減**: Cloudflareの従量課金から固定費へ
- **柔軟性向上**: 任意のホスティングサービスを選択可能
- **パフォーマンス**: ローカルストレージによる高速アクセス

## 貢献ガイドライン

### 開発フロー

1. Issueの作成または既存Issueの確認
2. ブランチの作成 (`feature/`, `fix/`, `docs/`)
3. テスト駆動開発 (TDD)
4. プルリクエストの作成
5. コードレビューの実施

### コーディング標準

- TypeScriptを使用
- ESLint/Prettierによるコードフォーマット
- テストカバレッジの維持
- コミットメッセージの規約遵守

## ライセンス

このプロジェクトはMITライセンスの下で公開されています。

## サポート

- **ドキュメント**: `/docs` ディレクトリを参照
- **Issue**: GitHub Issuesでバグ報告・機能リクエスト
- **Discussions**: 技術的な議論や質問

---

## Usage and Terms

本サービスは無償の実験的プレビューです。サインアップ時に利用規約への同意が必須となります。

### 認証・メール通知・退会機能

- **認証**: メールアドレスによるサインアップとログインを提供します。
- **メール通知**: 処理状況などの通知を登録メールアドレス宛に送信します。
- **退会機能**: ユーザーはいつでも設定画面からアカウントを削除できます。
