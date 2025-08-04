# Development Commands

## 基本コマンド
```bash
# 開発サーバー起動
npm run dev

# プロダクションビルド
npm run build

# プロダクション実行
npm start

# Cloudflare Workers プレビュー
npm run preview

# Cloudflare Workers デプロイ
npm run deploy
```

## テストコマンド
```bash
# 単体テスト実行
npm test
# または
npm run test

# UIでテスト実行
npm run test:ui

# カバレッジ付きテスト
npm run test:coverage

# 統合テスト実行
npm run test:integration

# 統合テスト（Watch mode）
npm run test:integration:watch

# フルフローテスト（bash）
npm run test:full-flow

# フルフローテスト（Windows）
npm run test:full-flow:win
```

## コード品質管理
```bash
# フォーマット（自動修正）
npm run format

# フォーマットチェック（修正なし）
npm run format:check

# リント（自動修正）
npm run lint

# リントチェック（修正なし）
npm run lint:check

# 総合チェック（自動修正）
npm run check

# 総合チェック（CI用、修正なし）
npm run check:ci
```

## Cloudflare関連
```bash
# 型定義生成
npm run cf-typegen
```

## Windows環境での注意事項
- 統合テストは `npm run test:full-flow:win` を使用
- パスの区切り文字は `\` が使用される
- PowerShellまたはCommand Promptで実行