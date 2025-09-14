# Novel2Manga 認証・マイページ機能 実装計画書

## 概要

既存のnovel2manga-tsプロジェクトに対して、**現在の実装を極力壊さずに**Googleログイン・マイページ機能を追加する計画書。AIエージェントによる実装を前提とした、具体的かつ実行可能なタスク定義。

### 技術スタック（確認済み）

- **Framework**: Next.js 15 (App Router)
- **ORM**: Drizzle ORM（既に実装済み）
- **DB**: SQLite3
- **認証**: NextAuth v5（Auth.js）- 既に`src/auth.ts`に基礎実装あり
- **新規実装**: Effect TSで段階的に移行
- **スタイリング**: Tailwind CSS, MUI

### 現状の確認

- ✅ Drizzle スキーマに認証テーブル（users, accounts, sessions等）定義済み
- ✅ NextAuth + Drizzle Adapter の基礎実装済み（`src/auth.ts`）
- ✅ `/portal/api/auth/[...nextauth]/` のルート構造あり
- ✅ NextAuth basePath は `/portal/api/auth` に設定済み
- ✅ ログイン後はトップページへリダイレクトされ、ナビゲーション右上にマイページ/ログアウトメニューが表示される
- ⚠️ マイページ機能は未実装
- ⚠️ メール通知機能は未実装

---

## 1. 実装方針

### 1.1 基本方針

- **既存コードの保護**: 現在動作している機能を壊さない
- **段階的実装**: 小さなステップで確実に実装
- **Effect TS採用**: 新規機能はEffect TSで実装（既存部分は触らない）
- **型安全性**: Drizzle の型定義を活用

### 1.2 ディレクトリ構造（追加分のみ）

```
src/
  server/              # 新規：サーバーサイドロジック
    auth/
      requireUser.ts   # 認証ガード（Effect版）
    mailer/
      index.ts         # メール送信（Effect版）
  features/            # 新規：Effect TSによる機能実装
    user/
      service.ts       # ユーザー設定サービス
      effects.ts       # Effect定義
    jobs/
      service.ts       # ジョブ管理サービス
      effects.ts
  app/
    api/
      me/              # 新規：ユーザー設定API
      jobs/            # 新規：ジョブ管理API（既存と統合）
    portal/
      dashboard/       # 新規：ダッシュボード
      settings/        # 新規：設定画面
      jobs/           # 新規：ジョブ一覧・詳細
```

---

## 2. データモデル（既存を活用）

### 2.1 既存テーブル（`src/db/schema.ts`）

```typescript
// 既に定義済みのテーブルを活用
- users（拡張が必要）
- accounts
- sessions
- novels
- jobs
- outputs
- storageFiles
```

### 2.2 必要な拡張

```typescript
// users テーブルに設定カラムを追加（マイグレーション作成）
// drizzle/xxxx_add_user_settings.sql
ALTER TABLE user ADD COLUMN email_notifications INTEGER DEFAULT 1;
ALTER TABLE user ADD COLUMN theme TEXT DEFAULT 'light';
ALTER TABLE user ADD COLUMN language TEXT DEFAULT 'ja';
```

---

## 3. 認証実装（既存を拡張）

### 3.1 認証ガード実装（Effect TS版）

**ファイル**: `src/server/auth/requireUser.ts`

```typescript
import { Effect, Context } from 'effect'
import { auth } from '@/auth'
import type { Session } from 'next-auth'

// セッションコンテキスト
export class SessionContext extends Context.Tag('SessionContext')<SessionContext, Session>() {}

// 認証エラー
export class AuthenticationError {
  readonly _tag = 'AuthenticationError'
  constructor(readonly message: string) {}
}

// 認証を要求するEffect
export const requireAuth = Effect.gen(function* () {
  const session = yield* Effect.tryPromise({
    try: () => auth(),
    catch: () => new AuthenticationError('Failed to get session'),
  })

  if (!session?.user?.id) {
    return yield* Effect.fail(new AuthenticationError('Not authenticated'))
  }

  return session
})

// 開発用バイパス（環境変数で制御）
export const requireAuthWithBypass = Effect.gen(function* () {
  if (process.env.ALLOW_ADMIN_BYPASS === 'true') {
    // URLからadmin=trueを検出する場合の処理
    // 注意: 本番環境では必ず無効化すること
  }

  return yield* requireAuth
})
```

---

## 4. API実装（Effect TS + Drizzle）

### 4.1 ユーザー設定API

**ファイル**: `src/features/user/service.ts`

```typescript
import { Effect, Context, Layer } from 'effect'
import { db } from '@/db'
import { users } from '@/db/schema'
import { eq } from 'drizzle-orm'

export interface UserService {
  readonly getSettings: (userId: string) => Effect.Effect<UserSettings, DatabaseError>
  readonly updateSettings: (
    userId: string,
    settings: Partial<UserSettings>,
  ) => Effect.Effect<void, DatabaseError>
  readonly deleteAccount: (userId: string) => Effect.Effect<void, DatabaseError>
}

export const UserService = Context.GenericTag<UserService>('UserService')

export const UserServiceLive = Layer.succeed(UserService, {
  getSettings: (userId) =>
    Effect.tryPromise({
      try: async () => {
        const [user] = await db.select().from(users).where(eq(users.id, userId))
        return {
          emailNotifications: user.emailNotifications ?? true,
          theme: user.theme ?? 'light',
          language: user.language ?? 'ja',
        }
      },
      catch: (error) => new DatabaseError(String(error)),
    }),

  updateSettings: (userId, settings) =>
    Effect.tryPromise({
      try: async () => {
        await db.update(users).set(settings).where(eq(users.id, userId))
      },
      catch: (error) => new DatabaseError(String(error)),
    }),

  deleteAccount: (userId) =>
    Effect.tryPromise({
      try: async () => {
        // トランザクションで関連データも削除
        await db.transaction(async (tx) => {
          // 成果物ファイルのパスを取得
          const files = await tx.select().from(storageFiles).where(eq(storageFiles.userId, userId))

          // ユーザー削除（CASCADE設定済み）
          await tx.delete(users).where(eq(users.id, userId))

          // ファイル削除タスクをキューに追加
          // TODO: ファイル削除ワーカーの実装
        })
      },
      catch: (error) => new DatabaseError(String(error)),
    }),
})
```

**ファイル**: `src/app/api/me/route.ts`

```typescript
import { Effect, pipe } from 'effect'
import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/server/auth/requireUser'
import { UserService } from '@/features/user/service'

export async function GET(req: NextRequest) {
  const program = pipe(
    requireAuth,
    Effect.flatMap((session) =>
      UserService.pipe(Effect.flatMap((service) => service.getSettings(session.user.id))),
    ),
  )

  const result = await Effect.runPromiseEither(program)

  return result._tag === 'Right'
    ? NextResponse.json(result.right)
    : NextResponse.json({ error: result.left.message }, { status: 401 })
}

export async function PATCH(req: NextRequest) {
  const body = await req.json()

  const program = pipe(
    requireAuth,
    Effect.flatMap((session) =>
      UserService.pipe(Effect.flatMap((service) => service.updateSettings(session.user.id, body))),
    ),
  )

  const result = await Effect.runPromiseEither(program)

  return result._tag === 'Right'
    ? NextResponse.json({ success: true })
    : NextResponse.json({ error: result.left.message }, { status: 401 })
}

export async function DELETE(req: NextRequest) {
  const program = pipe(
    requireAuth,
    Effect.flatMap((session) =>
      UserService.pipe(Effect.flatMap((service) => service.deleteAccount(session.user.id))),
    ),
  )

  const result = await Effect.runPromiseEither(program)

  return result._tag === 'Right'
    ? new NextResponse(null, { status: 202 }) // 非同期削除
    : NextResponse.json({ error: result.left.message }, { status: 401 })
}
```

### 4.2 ジョブ管理API

**ファイル**: `src/app/api/jobs/route.ts`

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/db'
import { jobs, novels } from '@/db/schema'
import { eq, and, desc } from 'drizzle-orm'
import { auth } from '@/auth'

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(req.url)
  const limit = Number(searchParams.get('limit') ?? 10)
  const offset = Number(searchParams.get('offset') ?? 0)
  const status = searchParams.get('status')

  const conditions = [eq(jobs.userId, session.user.id)]
  if (status) conditions.push(eq(jobs.status, status))

  const results = await db
    .select({
      job: jobs,
      novel: novels,
    })
    .from(jobs)
    .leftJoin(novels, eq(jobs.novelId, novels.id))
    .where(and(...conditions))
    .orderBy(desc(jobs.createdAt))
    .limit(limit)
    .offset(offset)

  return NextResponse.json(results)
}
```

**ファイル**: `src/app/api/jobs/[jobId]/resume/route.ts`

```typescript
export async function POST(req: NextRequest, { params }: { params: { jobId: string } }) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const [job] = await db
    .select()
    .from(jobs)
    .where(and(eq(jobs.id, params.jobId), eq(jobs.userId, session.user.id)))

  if (!job) {
    return NextResponse.json({ error: 'Job not found' }, { status: 404 })
  }

  if (job.status !== 'failed' && job.status !== 'paused') {
    return NextResponse.json({ error: 'Job cannot be resumed' }, { status: 400 })
  }

  await db
    .update(jobs)
    .set({
      status: 'pending',
      retryCount: job.retryCount + 1,
      updatedAt: new Date().toISOString(),
    })
    .where(eq(jobs.id, params.jobId))

  return new NextResponse(null, { status: 202 })
}
```

---

## 5. メール通知実装

**ファイル**: `src/services/email/service.ts`

```typescript
import { Effect } from 'effect'
import nodemailer from 'nodemailer'

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: Number(process.env.SMTP_PORT ?? 587),
  secure: false,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
})

export interface EmailOptions {
  to: string
  subject: string
  html: string
}

export const sendEmail = (options: EmailOptions) =>
  Effect.tryPromise({
    try: () =>
      transporter.sendMail({
        from: process.env.MAIL_FROM ?? 'novel2manga@example.com',
        ...options,
      }),
    catch: (error) => new Error(`Failed to send email: ${error}`),
  })

export const sendJobNotification = (
  email: string,
  jobId: string,
  status: 'completed' | 'failed',
) => {
  const subject = status === 'completed' ? '漫画化が完了しました' : '漫画化でエラーが発生しました'

  const url =
    status === 'completed'
      ? `${process.env.NEXT_PUBLIC_URL}/portal/jobs/${jobId}`
      : `${process.env.NEXT_PUBLIC_URL}/portal/dashboard`
  const action = status === 'completed' ? '結果を見る' : 'マイページを開く'

  const html = `
    <h2>${subject}</h2>
    <p>ジョブID: ${jobId}</p>
    <p><a href="${url}">${action}</a></p>
  `

  return sendEmail({ to: email, subject, html })
}
```

---

## 6. UI実装（既存UIと統合）

### 6.1 設定画面

**ファイル**: `src/app/portal/settings/page.tsx`

```typescript
'use client'

import { useState, useEffect } from 'react'
import { Button, Switch, FormControlLabel, Container, Paper, Typography, Alert } from '@mui/material'
import { useSession } from 'next-auth/react'

export default function SettingsPage() {
  const { data: session } = useSession()
  const [settings, setSettings] = useState({
    emailNotifications: true,
    theme: 'light',
    language: 'ja'
  })
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')

  useEffect(() => {
    fetch('/api/me')
      .then(res => res.json())
      .then(data => setSettings(data))
  }, [])

  const handleSave = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/me', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings)
      })
      if (res.ok) {
        setMessage('設定を保存しました')
      }
    } catch (error) {
      setMessage('エラーが発生しました')
    } finally {
      setLoading(false)
    }
  }

  const handleDelete = async () => {
    if (!confirm('本当にアカウントを削除しますか？この操作は取り消せません。')) {
      return
    }

    try {
      const res = await fetch('/api/me', { method: 'DELETE' })
      if (res.status === 202) {
        window.location.href = '/'
      }
    } catch (error) {
      setMessage('削除に失敗しました')
    }
  }

  if (!session) {
    return <div>ログインが必要です</div>
  }

  return (
    <Container maxWidth="md" sx={{ mt: 4 }}>
      <Paper sx={{ p: 4 }}>
        <Typography variant="h4" gutterBottom>設定</Typography>

        {message && <Alert severity="info" sx={{ mb: 2 }}>{message}</Alert>}

        <FormControlLabel
          control={
            <Switch
              checked={settings.emailNotifications}
              onChange={(e) => setSettings({...settings, emailNotifications: e.target.checked})}
            />
          }
          label="メール通知を受け取る"
        />

        <div style={{ marginTop: 24, display: 'flex', gap: 16 }}>
          <Button
            variant="contained"
            onClick={handleSave}
            disabled={loading}
          >
            保存
          </Button>

          <Button
            variant="outlined"
            color="error"
            onClick={handleDelete}
          >
            アカウントを削除
          </Button>
        </div>
      </Paper>
    </Container>
  )
}
```

### 6.2 ダッシュボード

**ファイル**: `src/app/portal/dashboard/page.tsx`

```typescript
'use client'

import { useState, useEffect } from 'react'
import {
  Container, Grid, Card, CardContent, Typography,
  Button, Chip, LinearProgress
} from '@mui/material'
import Link from 'next/link'
import { useSession } from 'next-auth/react'

interface JobWithNovel {
  job: any // Job型
  novel: any // Novel型
}

export default function DashboardPage() {
  const { data: session } = useSession()
  const [jobs, setJobs] = useState<JobWithNovel[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (session) {
      fetch('/api/jobs?limit=10')
        .then(res => res.json())
        .then(data => {
          setJobs(data)
          setLoading(false)
        })
    }
  }, [session])

  const handleResume = async (jobId: string) => {
    const res = await fetch(`/api/jobs/${jobId}/resume`, { method: 'POST' })
    if (res.status === 202) {
      // ジョブリストを更新
      window.location.reload()
    }
  }

  if (!session) {
    return <div>ログインが必要です</div>
  }

  if (loading) {
    return <LinearProgress />
  }

  return (
    <Container maxWidth="lg" sx={{ mt: 4 }}>
      <Typography variant="h4" gutterBottom>
        ダッシュボード
      </Typography>

      <Grid container spacing={3}>
        {jobs.map(({ job, novel }) => (
          <Grid item xs={12} md={6} key={job.id}>
            <Card>
              <CardContent>
                <Typography variant="h6">
                  {novel?.title || 'タイトルなし'}
                </Typography>

                <Chip
                  label={job.status}
                  color={
                    job.status === 'completed' ? 'success' :
                    job.status === 'failed' ? 'error' :
                    job.status === 'processing' ? 'primary' : 'default'
                  }
                  size="small"
                  sx={{ mb: 1 }}
                />

                {job.status === 'processing' && (
                  <LinearProgress
                    variant="determinate"
                    value={(job.processedChunks / job.totalChunks) * 100}
                    sx={{ my: 1 }}
                  />
                )}

                <Typography variant="body2" color="text.secondary">
                  作成日: {new Date(job.createdAt).toLocaleString('ja-JP')}
                </Typography>

                <div style={{ marginTop: 16, display: 'flex', gap: 8 }}>
                  <Link href={`/portal/jobs/${job.id}`} passHref>
                    <Button size="small">詳細</Button>
                  </Link>

                  {(job.status === 'failed' || job.status === 'paused') && (
                    <Button
                      size="small"
                      color="primary"
                      onClick={() => handleResume(job.id)}
                    >
                      再開
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          </Grid>
        ))}
      </Grid>
    </Container>
  )
}
```

---

## 7. ワーカー実装（簡易版）

**ファイル**: `scripts/worker.ts`

```typescript
import { db } from '@/db'
import { jobs, users } from '@/db/schema'
import { eq } from 'drizzle-orm'
import { notificationService } from '@/services/notification/service'

const TICK_MS = Number(process.env.WORKER_TICK_MS ?? 5000)

async function processOne() {
  // pending ジョブを1つ取得
  const [job] = await db.select().from(jobs).where(eq(jobs.status, 'pending')).limit(1)

  if (!job) return

  // processing に更新
  await db
    .update(jobs)
    .set({ status: 'processing', startedAt: new Date().toISOString() })
    .where(eq(jobs.id, job.id))

  try {
    // 既存の処理パイプラインを呼び出す
    // TODO: 既存のジョブ処理ロジックと統合

    // 完了
    await db
      .update(jobs)
      .set({
        status: 'completed',
        completedAt: new Date().toISOString(),
      })
      .where(eq(jobs.id, job.id))

    // メール通知
    await notificationService.sendJobCompletionNotification(job.id, 'completed')
  } catch (error) {
    // エラー処理
    await db
      .update(jobs)
      .set({
        status: 'failed',
        lastError: String(error),
      })
      .where(eq(jobs.id, job.id))

    // エラー通知
    await notificationService.sendJobCompletionNotification(job.id, 'failed', String(error))
  }
}

// メインループ
setInterval(processOne, TICK_MS)
console.log(`Worker started (tick: ${TICK_MS}ms)`)
```

---

## 8. 実装タスク表（AIエージェント向け）

| ID     | カテゴリ | タスク                                       | 依存          | 実装ファイル                               | 完了条件                        |
| ------ | -------- | -------------------------------------------- | ------------- | ------------------------------------------ | ------------------------------- |
| DB-1   | DB       | ユーザー設定カラムの追加マイグレーション作成 | なし          | `drizzle/add_user_settings.sql`            | `npm run db:migrate` が成功     |
| AUTH-1 | 認証     | Effect版認証ガード実装                       | なし          | `src/server/auth/requireUser.ts`           | テストが通る                    |
| AUTH-2 | 認証     | 開発用admin=trueバイパス実装                 | AUTH-1        | `src/server/auth/requireUser.ts`           | `?admin=true`でログインスキップ |
| API-1  | API      | ユーザー設定サービス実装（Effect）           | DB-1          | `src/features/user/service.ts`             | 単体テスト通過                  |
| API-2  | API      | GET/PATCH/DELETE /api/me 実装                | API-1, AUTH-1 | `src/app/api/me/route.ts`                  | Postmanで動作確認               |
| API-3  | API      | GET /api/jobs 実装                           | AUTH-1        | `src/app/api/jobs/route.ts`                | 自分のジョブのみ返却            |
| API-4  | API      | POST /api/jobs/[id]/resume 実装              | AUTH-1        | `src/app/api/jobs/[jobId]/resume/route.ts` | 202返却、status更新             |
| MAIL-1 | メール   | Nodemailer設定・送信関数実装                 | なし          | `src/services/email/service.ts`            | テストメール送信成功            |
| UI-1   | UI       | 設定画面実装                                 | API-2         | `src/app/portal/settings/page.tsx`         | 設定変更・保存が動作            |
| UI-2   | UI       | ダッシュボード実装                           | API-3         | `src/app/portal/dashboard/page.tsx`        | ジョブ一覧表示                  |
| UI-3   | UI       | ナビゲーション追加                           | UI-1, UI-2    | `src/app/portal/layout.tsx`                | メニューから画面遷移            |
| WORK-1 | ワーカー | ジョブ処理ワーカー実装                       | MAIL-1        | `scripts/worker.ts`                        | pending→completed遷移           |
| WORK-2 | ワーカー | PM2設定作成                                  | WORK-1        | `ecosystem.config.js`                      | `pm2 start`で起動               |
| TEST-1 | テスト   | 認証フローE2Eテスト                          | 全API         | `tests/auth.e2e.test.ts`                   | ログイン→設定変更→ログアウト    |
| ENV-1  | 環境     | 環境変数追加                                 | なし          | `.env.example`                             | 必要な環境変数を追記            |

---

## 9. 環境変数（追加分）

`.env.example` に追加：

```env
# メール送信設定
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-app-password
MAIL_FROM="Novel2Manga <noreply@novel2manga.com>"

# ワーカー設定
WORKER_TICK_MS=5000

# 開発用設定（本番では削除）
ALLOW_ADMIN_BYPASS=false

# 公開URL
NEXT_PUBLIC_URL=http://localhost:3000
```

---

## 10. 段階的実装手順

### Phase 1: 基礎実装（1-2日）

1. DB-1: マイグレーション作成・実行
2. AUTH-1, AUTH-2: 認証ガード実装
3. API-1, API-2: ユーザー設定API実装
4. ENV-1: 環境変数設定

### Phase 2: ジョブ管理（1日）

1. API-3, API-4: ジョブ管理API実装
2. UI-2: ダッシュボード実装
3. UI-3: ナビゲーション統合

### Phase 3: UI完成（1日）

1. UI-1: 設定画面実装
2. 既存UIとの統合テスト

### Phase 4: 通知・ワーカー（1日）

1. MAIL-1: メール送信実装
2. WORK-1, WORK-2: ワーカー実装・設定

### Phase 5: テスト・デプロイ（1日）

1. TEST-1: E2Eテスト実装
2. 本番環境設定
3. デプロイ

---

## 11. AIエージェント向け実装指示

### 実装時の注意事項

1. **既存コードを壊さない**: 新規ファイルの追加を優先し、既存ファイルの変更は最小限に
2. **型安全性**: Drizzleの型定義を活用し、anyを使わない
3. **Effect TS採用**: 新規機能はEffect TSで実装（学習コストを考慮し、簡単な部分から）
4. **エラーハンドリング**: Effect のエラー型を活用した安全なエラー処理
5. **テスト**: 各機能実装後、必ずテストを書く

### コード生成時のテンプレート

#### Effect サービステンプレート

```typescript
import { Effect, Context, Layer } from 'effect'

// エラー型定義
export class ServiceError {
  readonly _tag = 'ServiceError'
  constructor(readonly message: string) {}
}

// サービスインターフェース
export interface MyService {
  readonly method: (param: string) => Effect.Effect<Result, ServiceError>
}

// コンテキストタグ
export const MyService = Context.GenericTag<MyService>('MyService')

// 実装
export const MyServiceLive = Layer.succeed(MyService, {
  method: (param) =>
    Effect.tryPromise({
      try: async () => {
        // 実装
        return result
      },
      catch: (error) => new ServiceError(String(error)),
    }),
})
```

#### API ルートテンプレート

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'

export async function GET(req: NextRequest) {
  const session = await auth()

  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    // 処理実装
    return NextResponse.json(result)
  } catch (error) {
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}
```

---

## 12. テスト戦略

### 単体テスト（Vitest）

- Effect サービスのテスト
- API ルートハンドラのテスト
- 認証ガードのテスト

### 統合テスト

- DB操作を含むテスト
- メール送信のモックテスト

### E2Eテスト（Playwright）

- ログインフロー
- 設定変更フロー
- ジョブ管理フロー

---

## 13. セキュリティ考慮事項

1. **admin=trueバイパス**: 本番環境では必ず無効化
2. **CSRF対策**: NextAuthのCSRF保護を活用
3. **SQLインジェクション**: Drizzle ORMで防御
4. **認可チェック**: 全APIで所有者確認を実装
5. **レート制限**: 必要に応じて実装

---

## 14. パフォーマンス最適化

1. **DB クエリ**: N+1問題を避ける（Drizzleのwith句活用）
2. **キャッシュ**: 設定情報は適切にキャッシュ
3. **非同期処理**: ワーカーで重い処理を分離
4. **ページネーション**: 大量データは必ずページング

---

## 15. まとめ

本計画書は、既存のnovel2manga-tsプロジェクトに対して、最小限の変更で認証・マイページ機能を追加するための具体的な実装計画です。AIエージェントは、タスク表の順番に従って実装を進めることで、確実に機能を完成させることができます。

### 成功の鍵

- 既存実装を活かす（Drizzle、NextAuth）
- 新規部分はEffect TSで品質向上
- 段階的実装で動作確認しながら進める
- テストを書いて品質保証

### 次のステップ

1. `.env`ファイルの設定
2. DB-1タスクから順次実装開始
3. 各フェーズ完了時に動作確認

## 16. 実装履歴

- 2024-12-21: `requireUser` 認証ヘルパーと `/api/mypage/dashboard` エンドポイントを追加。ユーザーの小説数・ジョブ状況・最新出力を取得。
- 2025-09-14: 認証コールバックとポータルルートを設定ファイルに集約し、NEXTAUTH_URL 未設定環境でも動作するサインインリダイレクトを実装。
