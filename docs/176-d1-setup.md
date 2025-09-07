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

## 2. Drizzle でマイグレーションを生成

```sh
npm run db:generate
```

- 生成された SQL は `drizzle/` フォルダに出力される
- 必ずコミットに含める

## 3. D1 へマイグレーションを適用

ローカル（Miniflare）で検証:

```sh
wrangler d1 migrations apply novel2manga --local
```

本番 D1 へ適用:

```sh
wrangler d1 migrations apply novel2manga --remote
```

このテストは `better-sqlite3` に依存するため、WSL2 では失敗する可能性があります。WSL2 環境では TypeScript のみで完結する小規模なテストだけを実行し、このテストを含むバイナリ依存テストの一括実行は他の開発者に依頼してください。

このテストは `better-sqlite3` に依存するため、WSL2では失敗する可能性があります。WSL2環境ではTypeScriptのみで完結するテストの実行に留め、このテストを含むバイナリ依存のテストはCI等のネイティブ実行が可能な環境で行ってください。

```sh
npm run test:unit src/__tests__/db/d1-connection.test.ts
```

## 5. 型定義の更新

```sh
npm run cf-typegen
```

- D1 バインディングの型を `cloudflare-env.d.ts` に生成する

## メモ

- マイグレーション適用前に必ず Git の作業ツリーがクリーンであることを確認する
- 既存データを破壊する可能性があるため、本番適用時は事前にバックアップを取得する
