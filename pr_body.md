### 概要

- キュー雛形 `src/services/queue.ts` を追加（Cloudflare Queues が無い場合はインプロセスで即時実行）
- 通知サービス雛形 `src/services/notifications.ts` を追加（後でSendGrid/SESへ差し替え）
- 再開/投入APIをキュー経由に変更し、任意で `userEmail` を受けて通知へ接続
- 製品要件のルール追加とPRテンプレのチェック追記

### 変更ファイル

- `.cursor/rules/01-product.md`, `.cursor/rules/00-project.md`
- `src/services/queue.ts`, `src/services/notifications.ts`
- `src/app/api/jobs/[jobId]/route.ts`, `src/app/api/jobs/[jobId]/resume/route.ts`
- `src/types/cloudflare.d.ts`, `docs/tasks-2025-08-11.md`

### 実装メモ

- Cloudflare Queues 利用時は `globalThis.JOBS_QUEUE` をバインドして自動切替
- メールは同意済みアドレスをAPIへ渡した時のみ送信（現状はログ出力）

### チェックリスト

- [x] Lint/Typecheck/Tests ローカル確認（編集範囲のみ）
- [x] API内で長時間処理せず、非同期実行に移行
- [x] 既存の `canResumeJob` 互換維持
