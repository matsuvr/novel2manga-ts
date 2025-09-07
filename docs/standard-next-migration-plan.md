# Cloudflare/OpenNext 廃止と標準 Next.js への移行計画

## 目的

- Cloudflare Workers と OpenNext 依存を完全に撤去し、標準的な Next.js 実行環境に統一する。
- SQLite3 + Drizzle ORM を本番環境でも直接利用する。
- Docker を用いてローカルとデプロイ先の実行環境を揃える。

## 概要

1. Cloudflare / OpenNext 関連設定・コードの削除。
2. Next.js を Node 公式サーバーモードで稼働させる。
3. SQLite3 + Drizzle のセットアップを Docker 化し、同一イメージで本番へデプロイ。
4. Cloudflare 向けドキュメント・スクリプトを整理し、新しい開発フローを README 等に反映。

## タスク一覧

| 優先度 | タスク                          | 内容                                                                                   | 対象ファイル/ディレクトリ                                                                         |
| ------ | ------------------------------- | -------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| 1      | Cloudflare/OpenNext 設定の撤去  | `wrangler.toml`、`open-next.config.ts`、Cloudflare 用 npm スクリプトの削除             | `wrangler.toml`, `open-next.config.ts`, `package.json`                                            |
| 1      | Next.js 設定のリセット          | `initOpenNextCloudflareForDev` 呼び出しを除去し、標準の `next.config.js` にする        | `next.config.js`                                                                                  |
| 1      | Cloudflare 依存パッケージの削除 | `@opennextjs/cloudflare`, `wrangler` 等を `package.json` から除去                      | `package.json`                                                                                    |
| 1      | Docker 環境の構築               | Node 20 + SQLite3 を含む `Dockerfile` とローカル開発用 `docker-compose.yml` を新規追加 | `Dockerfile`, `docker-compose.yml`                                                                |
| 1      | データベース永続化方針の定義    | SQLite3 ファイルのボリュームマウント設定とバックアップ手順を明文化                     | `database/`, `docs`                                                                               |
| 2      | README と関連ドキュメント更新   | Cloudflare 関連記述を削除し、新しい起動・デプロイ手順を記載                            | `README.md`, `docs/`                                                                              |
| 2      | CI/CD パイプラインの調整        | Cloudflare コマンドを廃止し、Docker ベースのビルド&テストに変更                        | `.github/workflows/`                                                                              |
| 2      | 不要コード・参照の掃除          | CF 固有 API 呼び出しや `getCloudflareContext` 等を検出し削除                           | `src/` 全体                                                                                       |
| 3      | テスト環境整備                  | Docker コンテナ内で Vitest/Playwright が動作するよう設定                               | `tests/`, `playwright.config.ts`                                                                  |
| 3      | スキーマ・タスク文書の更新      | 移行内容を設計書とタスク表に反映                                                       | `.kiro/specs/novel-to-manga-converter/design.md`, `.kiro/specs/novel-to-manga-converter/tasks.md` |

## 注意点

- `package-lock.json` は手動編集禁止。依存削除時は `npm install` で再生成する。
- 既存の Drizzle スキーマとマイグレーションを SQLite3 用に確認し、差分があれば修正する。
- テストやビルドは Docker コンテナ内で実行して結果を確認する。
- Cloudflare 固有のファイルはリポジトリから完全に除去する。
