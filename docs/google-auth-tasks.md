# Google認証統合 タスク一覧

| ID  | カテゴリ     | タスク                                                                                                              | 依存     | 完了条件                                            |
| --- | ------------ | ------------------------------------------------------------------------------------------------------------------- | -------- | --------------------------------------------------- |
| T0  | ビルド基盤   | OpenNext の導入と `wrangler.toml` の設定、`npm run preview` の確認                                                  | なし     | ローカルで Hello World が表示される                 |
| T1  | DB           | D1 作成と Drizzle セットアップ (`drizzle.config.ts` / マイグレーション)                                             | T0       | `drizzle migrate` が成功し、`SELECT 1` が実行できる |
| T2  | 認証         | Auth.js + D1 Adapter + Google Provider を `/portal/api/auth` に実装                                                 | T1       | Google ログインでポータルページにアクセス可能       |
| T3  | スキーマ     | `app_jobs` / `app_artifacts` / `app_job_events` / `app_email_logs` / `app_delete_requests` などアプリ用テーブル追加 | T1       | マイグレーション適用後、基本 CRUD が通る            |
| T4  | API(作成)    | `POST /portal-api/jobs` でジョブ作成と Queue 送信                                                                   | T2,T3    | 201 応答と Queue にメッセージが登録される           |
| T5  | Queue基盤    | `novel2manga-convert` Queue の作成とバインド                                                                        | T0       | `send()` 成功ログを確認                             |
| T6  | コンシューマ | `workers/convert-consumer` を実装し、D1 更新・R2 保存・メール送信を実行                                             | T5       | メッセージ処理が一連のフローを完了                  |
| T7  | R2           | バケット作成、バインディング、プリサインド URL 発行 API の実装                                                      | T6       | URL から成果物を取得でき、期限切れ時に無効化される  |
| T8  | メール       | Resend との連携実装とテンプレート整備                                                                               | T6       | ジョブ成功/失敗時にメールを受信                     |
| T9  | UI           | `/portal/dashboard`, `/portal/jobs/[id]`, `/portal/settings` の実装                                                 | T4,T6,T7 | 主要ユーザーフローが UI で確認できる                |
| T10 | 退会         | `DELETE /portal-api/me` と `user_delete` Queue の実装                                                               | T3,T5    | D1/R2/Auth.js データ削除後、再ログイン不可          |
| T11 | 認可         | ユーザーIDの一致確認によるアクセス制御                                                                              | T2       | 他ユーザーID指定時に 403 を返す                     |
| T12 | テスト       | 単体・統合・E2E テストの整備                                                                                        | T2〜T11  | CI で全テストが緑になる                             |
| T13 | 運用         | Queue 滞留やメール失敗率などのメトリクス収集                                                                        | T6       | ダッシュボードで指標を確認可能                      |
| T14 | 文書         | 利用規約・プライバシーポリシー・Runbook の整備                                                                      | T10      | 文書公開と合意取得                                  |
