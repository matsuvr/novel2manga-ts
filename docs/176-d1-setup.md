# D1 + Drizzle セットアップ手順 (Issue #176)

## 事前条件

- Cloudflare アカウントで D1 データベース作成権限を持つこと
- `wrangler` CLI がローカル環境にインストールされていること
- このリポジトリの依存関係を `npm ci` でインストール済みであること

## 1. D1 インスタンスを作成

```sh
wrangler d1 create novel2manga
```

- 実行結果に表示される `database_id` を控え、`wrangler.toml` の `[[d1_databases]]` セクションを更新する

## 2. 接続情報を環境変数に設定

- ローカル開発: `.env.local` に `DATABASE_ID` を追加
- 本番: Cloudflare ダッシュボードの環境変数に同様の値を設定

## 3. Drizzle でマイグレーションを生成

```sh
npm run db:generate
```

- 生成された SQL は `drizzle/` フォルダに出力される
- 必ずコミットに含める

## 4. D1 へマイグレーションを適用

ローカル（Miniflare）で検証:

```sh
wrangler d1 migrations apply novel2manga --local
```

本番 D1 へ適用:

```sh
wrangler d1 migrations apply novel2manga --remote
```

## 5. 接続確認テスト

```sh
npm run test:unit src/__tests__/db/d1-connection.test.ts
```

- 失敗した場合はログを確認し、修正後に再実行する

## 6. 型定義の更新

```sh
npm run cf-typegen
```

- D1 バインディングの型を `cloudflare-env.d.ts` に生成する

## メモ

- マイグレーション適用前に必ず Git の作業ツリーがクリーンであることを確認する
- 既存データを破壊する可能性があるため、本番適用時は事前にバックアップを取得する
