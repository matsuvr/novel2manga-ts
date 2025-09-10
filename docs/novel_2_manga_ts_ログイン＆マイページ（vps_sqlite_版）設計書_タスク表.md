# 概要
**目的**: Cloudflare 依存を完全に排除し、クラウドVPS上で稼働する **Next.js/Node.js + SQLite3** 構成における、
- Googleログイン（Auth.js v5 / NextAuth）
- マイページ（小説入力履歴・漫画化ジョブ一覧・再開）
- メール通知（成功/失敗・ON/OFF）
- 退会（全データ削除）
- 一時的な `?admin=true` ログインバイパス（**削除容易性**考慮）
を最短で実装できるようにした設計と実装タスク表。AIエージェントがそのまま実装可能な粒度で、コード例を含む。

> **想定ランタイム**: Next.js 14 App Router（Node runtime）/ Express でも同等API可
> **DB**: SQLite3（drizzle）
> **メール**: Nodemailer（SMTP: 任意のプロバイダ・自前Postfixも可）
> **ジョブ**: SQLiteの`jobs`テーブルをキュー化（簡易ワーカー）

---

# 0. Cloudflare残存物 監査＆除去チェックリスト
VPS/SQLite移行に伴い、以下に**残っていたら削除**。直下のシェルで一括検出→対応。

## 0.1 検出コマンド（プロジェクトルートで実行）
```bash
# 文字列検索（ripgrep 推奨。無ければ `grep -RIn`）
rg -n "cloudflare|wrangler|R2|D1|Durable|KV|Workers|Queues|__CF|getMiniflare" || true

# 設定ファイル候補
ls -1 | rg -n "wrangler\.toml|\.dev\.vars|\.cf.*|\.workers\.|.*cloudflare.*" || true

# TypeScript型やパッケージ
rg -n "@cloudflare|workers-types|cloudflare.*sdk|itty-router|hono.*cloudflare" || true

# CI / Docker / Infra
rg -n ".github|Dockerfile|docker-compose|infra|terraform|pulumi" || true
```

## 0.2 よくある残存ファイル/依存（**見つけたら削除**）
- ルート: `wrangler.toml`, `.dev.vars`, `cloudflare.*.md`, `*.worker.*`
- 依存: `wrangler`, `@cloudflare/*`, `@cloudflare/workers-types`, `miniflare`, `itty-router`（Workers用のことが多い）
- コード: `env.BUCKET`, `R2`/`KV`/`D1` という名前の変数、`context.env` や `ExecutionContext`
- ストレージ: R2前提のアップロード/ダウンロードユーティリティ
- キュー: Cloudflare Queues前提のプロデューサ/コンシューマ

> **注意**: `hono` はCloudflare専用ではないため、即削除はしない。Workers向けラッパ利用箇所のみ除去。

## 0.3 置換先の方針（VPS/SQLite版）
- **DB**: D1 → **SQLite3（Prisma）**
- **ストレージ**: R2 → **ローカルディスク**（`./storage/artifacts` など）
- **キュー**: Queues → **SQLiteのキュー表 + ワーカープロセス**（PM2/forever/systemdで常駐）
- **メール**: Resend等 → **Nodemailer + SMTP**（プロバイダは環境変数化）

---

# 1. データモデル（Prisma / SQLite）
`prisma/schema.prisma`（**Auth.js + アプリ用**）
```prisma
````markdown
# 概要
**目的**: Cloudflare 依存を完全に排除し、クラウドVPS上で稼働する **Next.js/Node.js + SQLite3** 構成における、
- Googleログイン（NextAuth / Drizzle adapter）
- マイページ（小説入力履歴・漫画化ジョブ一覧・再開）
- メール通知（成功/失敗・ON/OFF）
- 退会（全データ削除）
- 一時的な `?admin=true` ログインバイパス（**削除容易性**考慮）
を最短で実装できるようにした設計と実装タスク表。AIエージェントがそのまま実装可能な粒度で、コード例を含む。

> **想定ランタイム**: Next.js 14 App Router（Node runtime）/ Express でも同等API可
> **DB**: SQLite3（Drizzle ORM）
> **メール**: Nodemailer（SMTP: 任意のプロバイダ・自前Postfixも可）
> **ジョブ**: Drizzle 管理下の `jobs` テーブルをキュー化（簡易ワーカー）

---

# 0. Cloudflare残存物 監査＆除去チェックリスト
VPS/SQLite移行に伴い、以下に**残っていたら削除**。直下のシェルで一括検出→対応。

## 0.1 検出コマンド（プロジェクトルートで実行）
```bash
# 文字列検索（ripgrep 推奨。無ければ `grep -RIn`）
rg -n "cloudflare|wrangler|R2|D1|Durable|KV|Workers|Queues|__CF|getMiniflare" || true

# 設定ファイル候補
ls -1 | rg -n "wrangler\.toml|\.dev\.vars|\.cf.*|\.workers\.|.*cloudflare.*" || true

# TypeScript型やパッケージ
rg -n "@cloudflare|workers-types|cloudflare.*sdk|itty-router|hono.*cloudflare" || true

# CI / Docker / Infra
rg -n ".github|Dockerfile|docker-compose|infra|terraform|pulumi" || true
```

## 0.2 よくある残存ファイル/依存（**見つけたら削除**）
- ルート: `wrangler.toml`, `.dev.vars`, `cloudflare.*.md`, `*.worker.*`
- 依存: `wrangler`, `@cloudflare/*`, `@cloudflare/workers-types`, `miniflare`, `itty-router`（Workers用のことが多い）
- コード: `env.BUCKET`, `R2`/`KV`/`D1` という名前の変数、`context.env` や `ExecutionContext`
- ストレージ: R2前提のアップロード/ダウンロードユーティリティ
- キュー: Cloudflare Queues前提のプロデューサ/コンシューマ

> **注意**: `hono` はCloudflare専用ではないため、即削除はしない。Workers向けラッパ利用箇所のみ除去。

## 0.3 置換先の方針（VPS/SQLite版）
- **DB**: D1 → **SQLite3（Drizzle ORM）**（本リポジトリは Drizzle を既に採用しています。schema は `src/db/schema.ts` にあります。）
- **ストレージ**: R2 → **ローカルディスク**（`./storage/artifacts` など）
- **キュー**: Queues → **Drizzle 管理のテーブル + ワーカープロセス**（PM2/forever/systemdで常駐）
- **メール**: Resend等 → **Nodemailer + SMTP**（プロバイダは環境変数化）

---

# 1. データモデル（Drizzle ORM / SQLite）

このプロジェクトは Drizzle ORM を採用しており、スキーマは `src/db/schema.ts` に定義されています。
主要テーブル（抜粋）: `users`, `account`, `session`, `novels`, `jobs`, `chunks`, `job_step_history`, `episodes`, `layout_status`, `render_status`, `outputs`, `storage_files`, `token_usage`。

実装のポイント:
- スキーマは `drizzle-orm/sqlite-core` の `sqliteTable` で宣言されています。型は `export type X = typeof x.$inferSelect` でエクスポートされています。
- マイグレーションは `drizzle-kit` と `drizzle-orm/better-sqlite3/migrator` を使います。初期化・マイグレーションの安全性を担保するロジックは `src/db/index.ts` に入っています（`__drizzle_migrations` の存在チェックなど）。
- 既存データがある場合は `src/db/index.ts` の警告メッセージに従い、適切に対応してください（自動マイグレーションのスキップ等）。

参考: スキーマ定義の実際の詳細は `src/db/schema.ts` を参照してください（型定義・relations もそこにあります）。

---

# 2. 認証（NextAuth + Drizzle adapter）

このプロジェクトは `@auth/drizzle-adapter` と NextAuth（NextAuth v5）を組み合わせた実装を採用しています。実装ファイルは `src/auth.ts` です。

重要ポイント:
- `DrizzleAdapter` を利用し、リポジトリのデータアクセス層（`getDatabaseServiceFactory()` 経由）から Drizzle の生DBを渡しています。
- `basePath` は `/portal/api/auth` に設定されています（`src/auth.ts` 内）。
- セッションは JWT 戦略（session.strategy = 'jwt'）になっており、`session` callback で JWT の `sub` を `session.user.id` に反映しています。
- 環境変数のチェックがあり（`AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET`, `AUTH_SECRET`）、未設定時は 503 を返す安全策が実装されています。

App Router 側のルートハンドラは `src/auth.ts` が `GET/POST` ハンドラをエクスポートしているため、それを再エクスポートすれば動作します（例: `src/app/api/auth/[...nextauth]/route.ts`）。

---

# 3. 認可ガード & `?admin=true` バイパス

方針は単一点（中央化）で実装し、将来容易に削除できるようにします。

実装方針:
- 共通の `requireUser(req)` を用意し、`src/auth.ts` の `auth()` を呼び出して session?.user を返す。
- 開発便利機能として `ALLOW_ADMIN_BYPASS=true` を `.env` に置き、`?admin=true` を許可するが、本番では必ず無効化（またはコード削除）すること。

注: `src/auth.ts` の `auth()` は未設定環境時はエラー/503 を返すため、デプロイ前に環境変数が揃っていることを確認してください。

---

# 4. API 設計（/api/*）
Base: Next.js App Router の Route Handlers（必要なら Express 等でも同等のエンドポイント実装可）

設計例（実装は Drizzle のクエリ構文を利用）

## 4.1 自分情報/設定 `/api/me`
機能:
- GET: プロフィールと設定を返す
- PATCH: { emailNotifications?: boolean } で設定を更新
- DELETE: 退会要求（DeleteRequest）を登録し 202 を返す（ワーカーが非同期で完全削除）

例（概念）:
```ts
import { getDatabase } from '@/db'
import { users } from '@/db/schema'
import { requireUser } from '@/server/requireUser'

export async function GET(req: Request) {
  const u = await requireUser(req)
  const db = getDatabase()
  // Drizzle のクエリで設定を取得
  // 実装は schema に合わせて user settings テーブル/カラムを参照してください
}
```

## 4.2 一覧 API `/api/novels` & `/api/jobs`
- GET /api/novels?cursor=&limit=
- GET /api/jobs?status=&novelId=&cursor=&limit=

実装ポイント:
- Drizzle の `select().from(...).where(...).orderBy(...).limit(...)` を使ってページネーションとフィルタを実装する。

## 4.3 再開 API `/api/jobs/[jobId]/resume`
動作:
- ユーザー認証を確認し、自分のジョブのみ `status` を `pending`（または schema で定義した再実行ステータス）に戻す。
- 成功時は 202 を返す。

概念例:
```ts
import { getDatabase } from '@/db'
import { jobs } from '@/db/schema'
import { requireUser } from '@/server/requireUser'

export async function POST(req: Request, { params }: { params: { jobId: string } }) {
  const u = await requireUser(req)
  const db = getDatabase()
  // Drizzle で job を取得し userId を比較。問題なければ status を 'pending' 等に更新
}
```

---

# 5. メール通知（Nodemailer + SMTP）
`src/server/mailer.ts` に実装例を置く想定です。

ポイント:
- `nodemailer.createTransport` を環境変数で設定（`SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `MAIL_FROM`）。
- ジョブが `SUCCEEDED`/`FAILED` に遷移したタイミングで `sendJobNotification` を呼び、`storage_files` / `outputs` などに記録する。

---

# 6. ジョブワーカー（Drizzle + SQLite 簡易キュー）
目的: 長時間処理を API から切り離す。VPS で `node worker/index.js` を PM2/systemd で常駐させる想定。

概念実装（リポジトリ構成に合わせて調整）:
```ts
import { getDatabase } from '@/db'
import { jobs, users } from '@/db/schema'
import { sendJobNotification } from '@/server/mailer'

const TICK_MS = Number(process.env.WORKER_TICK_MS ?? 1000)

async function processOne() {
  const db = getDatabase()
  const [job] = await db.select().from(jobs).where(jobs.status.eq('pending')).orderBy(jobs.createdAt).limit(1)
  if (!job) return

  await db.update(jobs).set({ status: 'processing' }).where(jobs.id.eq(job.id))

  try {
    // 漫画化パイプライン: job のパスを読み、./storage/artifacts/${job.id} に成果物を作成
    await db.update(jobs).set({ status: 'completed', updatedAt: new Date().toISOString() }).where(jobs.id.eq(job.id))

    const [user] = await db.select().from(users).where(users.id.eq(job.userId)).limit(1)
    if (user?.email) {
      await sendJobNotification({ to: user.email, jobId: job.id, event: 'SUCCEEDED' })
    }
  } catch (e: any) {
    await db.update(jobs).set({ status: 'failed', lastError: String(e?.message ?? e) }).where(jobs.id.eq(job.id))
    const [user] = await db.select().from(users).where(users.id.eq(job.userId)).limit(1)
    if (user?.email) {
      await sendJobNotification({ to: user.email, jobId: job.id, event: 'FAILED' })
    }
  }
}

setInterval(processOne, TICK_MS)
```

注意: 上は概念例です。実コードでは `src/db/schema.ts` のカラム名（status の値）に合わせて `'pending'|'processing'|'completed'|'failed'` 等を使ってください。

---

# 7. マイページUI（簡易）
`src/app/portal/settings/page.tsx` の例は有用です。Drizzle 側は API を通じて操作するため、フロントは既存の fetch 呼び出しをそのまま利用できます。

（既存のクライアント実装のまま `GET /api/me`, `PATCH /api/me`, `DELETE /api/me` を呼ぶ想定）

---

# 8. 退会フロー（非同期削除）
方針: 即時に 202 を返し、ワーカー側で成果物（`storage_files`/outputs の path）と DB レコードを削除する。

概念実装のポイント:
- DeleteRequest テーブルがある場合はそれをキューに見立てる（schema に合わせて実装）。
- ファイル削除は `storage_files` テーブルからパスを取得して fs.rm で削除。
- DB 削除は user を削除（外部キー cascade に依存）するか、必要に応じてトランザクションで関連レコードを削除。

---

# 9. 環境変数（.env）
このプロジェクトは `src/db/index.ts` 側で DB パスを取得する設定になっています。参考例:
```env
# SQLite DB 実ファイルを指定
DATABASE_PATH=./database/novel2manga.db

# NextAuth / Google
AUTH_GOOGLE_ID=xxx
AUTH_GOOGLE_SECRET=yyy
AUTH_SECRET=your_jwt_secret

# 管理バイパス（開発限定）
ALLOW_ADMIN_BYPASS=true # 本番では false/削除

# SMTP
SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_USER=apikey
SMTP_PASS=secret
MAIL_FROM="novel2manga <no-reply@example.com>"

# ワーカー間隔
WORKER_TICK_MS=1000
```

---

# 10. セキュリティ/運用メモ
- `?admin=true` は**開発限定**。本番では `ALLOW_ADMIN_BYPASS=false` を徹底し、最終的にコードを削除してください。
- SQLite のバックアップ: `database/novel2manga.db` を定期スナップショット（`sqlite3 .backup`）で保存。
- 成果物ディレクトリは jobId ベースにして権限管理を行い、直接公開しない（API 経由で署名付きダウンロードを提供するのが安全）。
- メール送信の成功/失敗は `storage_files`/`outputs` と併せて `email_log`（必要なら新設）に記録することを推奨。

---

# 11. 実装タスク表（Drizzle を前提にした修正版）

| ID | カテゴリ | タスク | 依存 | DoD（完了基準） |
|----|----------|--------|------|------------------|
| CF-1 | 監査 | `rg` で Cloudflare 痕跡を全検索 | なし | 0.1 の検索でヒット 0 または残件リスト化 |
| CF-2 | 除去 | `wrangler.toml`, `.dev.vars`, `@cloudflare/*` 依存削除 | CF-1 | ファイル削除 & `npm i` 後ビルド成功 |
| CF-3 | 除去 | R2/KV/Queues 参照ユーティリティを削除/置換 | CF-1 | 参照 0、代替 I/O 実装に差し替え完了 |
| DB-1 | 準備 | Drizzle マイグレーションを確認・整備（`drizzle/`） | CF-2 | `drizzle-kit migrate` 実行可能、`database/novel2manga.db` が期待スキーマを持つ |
| AUTH-1 | 認証 | NextAuth + `@auth/drizzle-adapter` 配線（`src/auth.ts` 確認） | DB-1 | `/portal/api/auth/signin` → Google 同意画面が開く |
| AUTH-2 | 認可 | `requireUser()` 共通化 + `ALLOW_ADMIN_BYPASS`（開発限定） | AUTH-1 | 未ログインで 401、`?admin=true` で開発環境のみ通過 |
| API-1 | 自分 | `GET/PATCH/DELETE /api/me` を Drizzle で実装 | AUTH-2 | 取得/更新/退会登録が動作、202 返却 |
| API-2 | 一覧 | `GET /api/novels`, `GET /api/jobs` を Drizzle で実装 | AUTH-2 | 自分のデータのみ返る、ページネーション OK |
| API-3 | 再開 | `POST /api/jobs/[id]/resume`（Drizzle） | API-2 | 自分のジョブのみ 202、他人は 403 |
| MAIL-1 | 送信 | Nodemailer 設定 + `sendJobNotification` 実装 | API-2 | テストメール送信成功 & DB にログ可能 |
| JOB-1 | ワーカー | Drizzle を使った簡易キュー（`jobs`処理） | API-3 | `pending→processing→completed/failed` の遷移が動作 |
| JOB-2 | 通知 | ジョブ完了/失敗でメール発報 + ログ記録 | JOB-1, MAIL-1 | メール受信 & DB にログが残る |
| DEL-1 | 退会 | DeleteRequest 処理ワーカー（成果物削除 + DB 削除） | API-1 | ユーザー行削除 & 成果物削除、状態更新 |
| UI-1 | 設定 | `/portal/settings`（通知トグル/退会） | API-1 | PATCH/DELETE 連携 OK |
| UI-2 | 一覧 | `/portal/dashboard`/`/portal/jobs/[id]` | API-2, API-3 | 再開ボタンで 202、一覧・詳細表示 OK |
| TEST-1 | E2E | サインイン→一覧→再開→通知→退会 の E2E | 全体 | 手順書通過 |

---

# 12. 手動テスト手順（抜粋）
1. `.env` を設定し、`npm run dev` を起動。
2. `/portal/api/auth/signin`（または `/portal/api/auth` の対応ルート）から Google でログイン。
3. `/portal/settings` で通知 ON のまま保存。
4. ダミーのジョブを投入（DB 直接挿入か簡易フォーム）。ワーカーが `completed` へ遷移 → メールが届くこと。
5. `/portal/jobs/[id]` → 再開ボタンで `pending`（または schema で定義した再開ステータス）に戻ること。
6. `/portal/settings` → 退会 → 202 が返り、ワーカー実行でユーザーと成果物が削除されること。

---

# 13. ディレクトリ構成（現状に合わせた例）
```
src/
  app/
    api/
      auth/[...nextauth]/route.ts
      me/route.ts
      jobs/route.ts
      jobs/[jobId]/resume/route.ts
    portal/
      dashboard/page.tsx
      jobs/[id]/page.tsx
      settings/page.tsx
  db/
    index.ts        # getDatabase(), migrate 設定
    schema.ts       # Drizzle schema
  auth.ts           # NextAuth + Drizzle adapter のラッパ
  server/
    requireUser.ts
    mailer.ts
  worker/
    index.ts
    delete-user.ts
drizzle/            # drizzle-kit マイグレーション
database/
  novel2manga.db
storage/
  artifacts/
```

---

# 14. 片付け（Cloudflare の完全撤去）
- [ ] 0 章の検索がヒット 0 である
- [ ] `package.json` の scripts から `wrangler`/`miniflare` 参照を削除
- [ ] README の Cloudflare 記述を VPS/SQLite 版に更新
- [ ] CI（GitHub Actions 等）から Cloudflare 部署手順を削除

---

# 15. メモ
- 将来 Redis 等を導入するなら、JOB キューを BullMQ 等に切替可能。
- 画像/成果物の静的配信は**ディレクトリ外公開禁止**の方針を推奨（署名 URL や API ダウンロードで制御）。


````
`src/app/portal/settings/page.tsx`

```tsx
