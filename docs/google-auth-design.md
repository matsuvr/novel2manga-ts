# Google認証統合 設計

## 全体構成

- **フレームワーク**: Next.js + OpenNext。
- **認証基盤**: Auth.js v5 を採用し、D1 Adapter を利用してユーザーデータを D1 に保存。
- **ランタイム**: getCloudflareContext() により Cloudflare 環境変数へアクセスし、Edge Runtime を使用しない。
- **エンドポイント**: `/portal/api/auth/[...nextauth]` に NextAuth をマウントし、`basePath` を `/portal/api/auth` に設定。

## データモデル

Auth.js が管理するテーブルは D1 Adapter によって自動生成される。アプリ固有の情報は以下のテーブルで管理する。

### app_users

Auth.js の `users` と分離したプロフィール拡張用テーブル。

### app_jobs

- ジョブの状態管理 (`CREATED` / `QUEUED` / `RUNNING` / `SUCCEEDED` / `FAILED` / `CANCELED`)
- 進捗・エラーメッセージ・実行パラメータ (`params` JSON)
- タイムスタンプ (`created_at`, `updated_at`, `started_at`, `finished_at`)

### app_artifacts

- 生成物のメタ情報 (`kind`, `r2_key`, `mime`, `bytes`, `checksum`)
- `job_id` と紐付けて D1 に保存

このほか `app_job_events`, `app_email_logs`, `app_delete_requests` を順次追加予定。

## 認証フロー

1. `getCloudflareContext()` から `env` を取得し、`up(env.DB)` を実行して D1 テーブルを初期化。
2. Google Provider を設定した NextAuth を `/portal/api/auth` にデプロイ。
3. セッションは JWT 戦略を使用し、保護ルートの判定に `auth()` を利用。

## 非同期ジョブ実行

- `/portal-api/jobs` エンドポイントでジョブを作成し、`env.CONVERT_QUEUE` へメッセージを送信。
- `workers/convert-consumer` が Queue メッセージを購読し、外部 API 呼び出し・R2 への成果物保存・メール通知までを担当。
- ジョブの進捗は D1 の `app_jobs` を更新して管理。

## 成果物配布

- R2 に保存したファイルに対し、プリサインド URL を発行する API を `/portal-api/artifacts/:id/url` として用意。
- URL は短寿命とし、認証済みユーザーのみに返す。

## 退会処理

1. ユーザーが `/portal/settings` から退会要求。
2. `DELETE /portal-api/me` が `user_delete` Queue へメッセージ送信。
3. 専用 Worker がジョブキャンセル、R2 及び D1 のデータ削除、Auth.js テーブルからのレコード削除を実施。

## メール通知

- Resend の HTTP API を利用し、`SUCCEEDED` または `FAILED` への状態遷移時にメール送信。
- 送信結果は `app_email_logs` に記録。

## 設定とバインディング

- `wrangler.toml` に D1 (`DB`)、R2 (`R2`)、Queue (`CONVERT_QUEUE`) をバインド。
- `drizzle.config.ts` で D1 用ドライバを設定し、`drizzle/migrations` にマイグレーションを出力。
