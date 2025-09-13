Next.jsのRoute Handlerは**Web標準の Request/Response**を直接使えるので、\*\*テストは「ハンドラを普通に呼んで返ってくるResponseを検証」\*\*するのが標準です。NextRequest/NextResponseはその拡張（クッキー等の糖衣）なので、必要に応じて実体を生成して渡せばOK。公式も「WebのRequest/Responseをサポートし、NextRequest/NextResponseで拡張」と明言しています。([Next.js 日本語ドキュメント][1])

---

# これが“標準”的な書き方

## 1) Route Handlerのユニットテスト（モック不要）

**ポイント**

- `app/**/route.ts` の `GET/POST/...` 関数を**直接呼ぶ**
- 引数は **`new Request(url, init)`** で十分。`NextRequest` が必要なときだけ使う
- 返り値は **`Response`/`NextResponse`**（=Web標準互換）。`status`/`headers`/`json()` で検証

```ts
// __tests__/items.route.test.ts
// @vitest-environment node   // ← Route Handlerはnode環境推奨(jsdom不要)
import { expect, test } from 'vitest'
import { GET, POST } from '@/app/api/items/route'
import { NextRequest } from 'next/server'

// ① Requestだけで足りるケース
test('GET /api/items returns list', async () => {
  const req = new Request('http://test.local/api/items')
  const res = await GET(req)
  expect(res.status).toBe(200)
  const body = await res.json()
  expect(Array.isArray(body.items)).toBe(true)
})

// ② NextRequestが必要なケース（cookies や nextUrl など）
test('POST /api/items uses cookie & query', async () => {
  const headers = new Headers({ cookie: 'session=abc' })
  const req = new NextRequest('http://test.local/api/items?draft=1', {
    method: 'POST',
    headers,
    body: JSON.stringify({ name: 'Book' }),
  })
  const res = await POST(req)
  expect(res.status).toBe(201)
  expect(res.headers.get('set-cookie')).toContain('session=')
})
```

> `NextRequest` でのテスト例は、`new NextRequest(url, init)` をそのまま使えばOKという実例がまとまっています。([Silolab Blog][2])
> Route HandlerはWebのRequest/Responseをそのまま扱える設計（＝モック不要）です。([Next.js 日本語ドキュメント][1])

### JSON／Cookie／リダイレクトの検証サンプル

```ts
// JSON
const data = await res.json()
expect(data).toEqual({ ok: true })

// Cookie（Set-Cookieヘッダーを素直に見る）
expect(res.headers.get('set-cookie')).toMatch(/token=.*HttpOnly/)

// リダイレクト（Locationヘッダー確認）
expect(res.headers.get('location')).toBe('https://example.com/login')
```

> `NextResponse.json/redirect/cookies` のAPI仕様は公式の関数リファレンス参照（Response互換として検証できます）。([Next.js][3])

---

## 2) Middlewareをテストする（Next 15.1+）

Middlewareだけは分岐が複雑になりがち。**Next.js 15.1以降**は実験的に**専用ヘルパ**が提供されています：

- `next/experimental/testing/server` の `isRewrite`, `getRedirectUrl`, `unstable_doesMiddlewareMatch` などで**挙動を直接検証**できます。([Next.js][4])

```ts
// __tests__/middleware.test.ts
import { expect, test } from 'vitest'
import {
  isRewrite,
  getRedirectUrl,
  unstable_doesMiddlewareMatch,
} from 'next/experimental/testing/server'
import { middleware, config } from '@/middleware'
import { NextRequest } from 'next/server'

test('matcherに一致するか', () => {
  expect(unstable_doesMiddlewareMatch({ config, url: '/docs' })).toBe(true)
})

test('特定パスをリライト', async () => {
  const req = new NextRequest('https://app.local/about')
  const res = await middleware(req)
  expect(isRewrite(res)).toBe(true)
  expect(getRedirectUrl(res)).toBe('https://app.local/about-2') // リライト先の取得
})
```

---

## 3) テストランナー設定のコツ

- **Vitest公式ガイド**に沿って導入（UIのテストは`jsdom`、Route Handlerは **`node` 環境**で分けるのが楽）。([Next.js][5])
- 各テストファイルの先頭に `// @vitest-environment node` を付けると環境を切り替えられます。
- Node 18+ なら `fetch/Request/Response/URL` は標準で利用可。

---

## 4) ありがち沼＆回避策

- ❌ **NextResponse/NextRequestを手作りモック**
  → ✅ 実体を `new Request(...)` / `new NextRequest(...)` で生成し、**本物を使って**検証する。([Next.js 日本語ドキュメント][1])
- ❌ `cookies()`（`next/headers`）に強く依存
  → ✅ テストしやすさ重視で **`request.cookies` を使う**実装に寄せるか、Cookieは`headers.cookie`で注入して検証。([Next.js 日本語ドキュメント][1])
- ❌ jsdom環境でRoute Handlerを動かす
  → ✅ **node環境**に切り替える（上記コメント or 設定）。
- ❌ API Routes（pagesルーター）向けの古い手法を流用
  → ✅ App Router の `route.ts` は**関数直叩き**が最短。もし旧API Routesをテストするなら `next-test-api-route-handler` のようなツールもあります。([npm][6])

---

## 5) まとめ（指針）

- **基本は「実物のRequestを作って、関数を直接叩く」**
- **返ってきたResponseを標準APIで検証**（`status`/`headers`/`json()`）
- **Middlewareは公式の実験的テストヘルパを活用**（Next 15.1+）([Next.js][4])

[1]: https://nextjsjp.org/docs/app/building-your-application/routing/route-handlers?utm_source=chatgpt.com 'Route Handlers | Next.js 日本語ドキュメント'
[2]: https://blog.silolab.net/article/testing-nextjs-route-handler-with-next-request?utm_source=chatgpt.com 'App Router における Route Handler (route.ts) のテスト'
[3]: https://nextjs.org/docs/app/api-reference/functions/next-response 'Functions: NextResponse | Next.js'
[4]: https://nextjs.org/docs/pages/api-reference/file-conventions/middleware?utm_source=chatgpt.com 'File-system conventions: Middleware | Next.js'
[5]: https://nextjs.org/docs/app/guides/testing/vitest?utm_source=chatgpt.com 'Testing: Vitest | Next.js'
[6]: https://www.npmjs.com/package/next-test-api-route-handler?utm_source=chatgpt.com 'next-test-api-route-handler - npm'

# テストの一例

---

# 1) まずは対象のRoute（例：管理者API）

`app/api/admin/route.ts`

```ts
// app/api/admin/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { jwtVerify, JWTPayload } from 'jose'

function getSecretKey() {
  // テストでも使えるよう、未設定なら 'test-secret' を既定値に
  const secret = process.env.JWT_SECRET ?? 'test-secret'
  return new TextEncoder().encode(secret)
}

async function authenticate(
  req: NextRequest,
): Promise<{ payload: JWTPayload } | { status: 401; message: 'unauthorized' }> {
  const auth = req.headers.get('authorization') ?? ''
  const [scheme, token] = auth.split(' ')
  if (scheme?.toLowerCase() !== 'bearer' || !token) {
    return { status: 401, message: 'unauthorized' }
  }

  try {
    const { payload } = await jwtVerify(token, getSecretKey(), {
      issuer: 'example-app',
      audience: 'example-api',
    })
    return { payload }
  } catch {
    return { status: 401, message: 'unauthorized' }
  }
}

export async function GET(req: NextRequest) {
  const auth = await authenticate(req)
  if ('status' in auth) {
    return NextResponse.json({ error: auth.message }, { status: auth.status })
  }

  // 役割チェック（role: 'admin' を要求）
  const role = auth.payload.role
  if (role !== 'admin') {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  }

  return NextResponse.json({ ok: true, userId: auth.payload.sub }, { status: 200 })
}
```

---

# 2) テスト用JWT発行ユーティリティ

`tests/utils/token.ts`

```ts
// tests/utils/token.ts
import { SignJWT } from 'jose'

const enc = new TextEncoder()

export async function signTestJwt(
  claims: Record<string, unknown>,
  options?: { expSeconds?: number; secret?: string },
) {
  const now = Math.floor(Date.now() / 1000)
  const exp = now + (options?.expSeconds ?? 60)
  const secret = enc.encode(options?.secret ?? 'test-secret')

  return await new SignJWT(claims)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt(now)
    .setIssuer('example-app')
    .setAudience('example-api')
    .setExpirationTime(exp)
    .sign(secret)
}
```

---

# 3) Authorization周りのテスト雛形

`__tests__/admin.route.auth.test.ts`

```ts
// @vitest-environment node
import { describe, expect, test } from 'vitest'
import { GET } from '@/app/api/admin/route'
import { NextRequest } from 'next/server'
import { signTestJwt } from '../tests/utils/token'

// 補助: Authorizationヘッダー付きNextRequest生成
function makeReq(url: string, token?: string) {
  const headers = new Headers()
  if (token) headers.set('authorization', `Bearer ${token}`)
  return new NextRequest(url, { headers })
}

describe('GET /api/admin (Authorization)', () => {
  test('Authorizationヘッダーなし → 401', async () => {
    const req = makeReq('https://test.local/api/admin')
    const res = await GET(req)
    expect(res.status).toBe(401)
    const json = await res.json()
    expect(json).toEqual({ error: 'unauthorized' })
  })

  test('Bearer以外のスキーム → 401', async () => {
    const headers = new Headers({ authorization: 'Basic xxx' })
    const req = new NextRequest('https://test.local/api/admin', { headers })
    const res = await GET(req)
    expect(res.status).toBe(401)
  })

  test('署名が不正 → 401', async () => {
    const bad = await signTestJwt({ sub: 'u1', role: 'admin' }, { secret: 'wrong' })
    const req = makeReq('https://test.local/api/admin', bad)
    const res = await GET(req)
    expect(res.status).toBe(401)
  })

  test('期限切れ → 401', async () => {
    const expired = await signTestJwt({ sub: 'u1', role: 'admin' }, { expSeconds: -10 })
    const req = makeReq('https://test.local/api/admin', expired)
    const res = await GET(req)
    expect(res.status).toBe(401)
  })

  test('roleがadminでない → 403', async () => {
    const token = await signTestJwt({ sub: 'u1', role: 'user' })
    const req = makeReq('https://test.local/api/admin', token)
    const res = await GET(req)
    expect(res.status).toBe(403)
    const body = await res.json()
    expect(body.error).toBe('forbidden')
  })

  test('有効なadminトークン → 200 + 期待JSON', async () => {
    const token = await signTestJwt({ sub: 'admin-123', role: 'admin' })
    const req = makeReq('https://test.local/api/admin', token)
    const res = await GET(req)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toEqual({ ok: true, userId: 'admin-123' })
  })
})
```

---

## （任意）スコープ／パーミッションの検証例

ロールではなく**スコープ**で制御している場合は、ハンドラ側を以下のように変更し、テストでは `claims: { scope: 'items:read items:write' }` のように付与して確認します。

```ts
// 例：scopeベースのチェック
const scope = (auth.payload.scope as string | undefined) ?? ''
const scopes = new Set(scope.split(/\s+/).filter(Boolean))
if (!scopes.has('admin:access')) {
  return NextResponse.json({ error: 'forbidden' }, { status: 403 })
}
```

---

# 4) （任意）Middlewareでの認可チェック例とテスト

ミドルウェアで未認証ユーザーを `/login` に飛ばす基本形。
※実験APIが使える環境なら `isRedirect`/`getRedirectUrl` 等でも検証できますが、**標準のステータス＋Locationヘッダー検証**が一番壊れにくいです。

`middleware.ts`

```ts
// middleware.ts
import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'

export function middleware(req: NextRequest) {
  const auth = req.headers.get('authorization') ?? ''
  const [scheme, token] = auth.split(' ')
  if (scheme?.toLowerCase() !== 'bearer' || !token) {
    const login = new URL('/login', req.url)
    return NextResponse.redirect(login) // 307 デフォルト
  }
  return NextResponse.next()
}

export const config = {
  matcher: ['/admin/:path*'],
}
```

`__tests__/middleware.auth.test.ts`

```ts
// @vitest-environment node
import { test, expect } from 'vitest'
import { middleware } from '@/middleware'
import { NextRequest } from 'next/server'

test('未認証なら /login にリダイレクト', async () => {
  const req = new NextRequest('https://app.local/admin')
  const res = await middleware(req)
  expect(res.status).toBe(307) // NextResponse.redirect の既定
  expect(res.headers.get('location')).toBe('https://app.local/login')
})
```

---

# 5) セットアップメモ

- 依存追加

  ```bash
  npm i -D vitest @types/node
  npm i jose
  ```

- 各テストファイル: `// @vitest-environment node`
- Node 18+ を推奨（`Request/Response/fetch` が標準実装）
- 秘密鍵は本番では `process.env.JWT_SECRET` を使用（テストでは既定の `'test-secret'` を利用する実装にしておくと楽）

---

# 6) よくある落とし穴回避

- **NextResponseをモックしない**：実体の `Response` を返すので、そのまま `status/json()/headers` を検証。
- **jsdomでRouteを動かさない**：**node環境**に切り替える。
- **認可ロジックは関数に分離しすぎない**：まずはハンドラ直叩きで「ヘッダー→検証→レスポンス」の流れをE2Eっぽく確認し、必要に応じ切り出す。
