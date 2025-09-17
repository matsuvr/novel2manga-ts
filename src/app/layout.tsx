import type { Metadata } from 'next'
import './globals.css'
import type { Session } from 'next-auth'
import { authConfig } from '@/config/auth.config'
import { getMissingAuthEnv } from '@/utils/auth-env'
import Providers from './providers'

export const metadata: Metadata = {
  title: 'Novel to Manga Converter',
  description: '小説をマンガ形式に変換するアプリケーション',
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // Initialize database connection early

  const missing = getMissingAuthEnv()
  if (missing.length > 0) {
    const message = `Authentication is not configured. Missing environment variables: ${missing.join(', ')}`
    console.error(message)
    return (
      <html lang="ja">
        <body className="antialiased">
          <div>{message}</div>
        </body>
      </html>
    )
  }

  // Dynamically import the auth helper at runtime so the root layout module
  // doesn't pull in NextAuth/DB initialization during the dev server's
  // compilation. This reduces first-request compile latency. We still race
  // against a timeout to avoid blocking rendering.
  const { auth: authFn } = await import('@/auth')
  const authPromise = (authFn as unknown as () => Promise<Session | null>)()

  const timeoutMarker = { timeout: true } as const
  const timeoutPromise = new Promise<typeof timeoutMarker>((resolve) =>
    setTimeout(() => resolve(timeoutMarker), authConfig.timeoutMs),
  )

  const raceRaw = await Promise.race([
    authPromise.then((s: Session | null) => ({ session: s })),
    timeoutPromise,
  ])

  const raceResult = raceRaw as unknown

  // Helper to detect fatal auth errors that must not be hidden.
  const isFatalAuthError = (err: unknown): boolean => {
    if (!(err instanceof Error)) return false
    const msg = err.message || ''
    return (
      msg.includes('Authentication is not configured') ||
      msg.includes('Missing authentication environment variables') ||
      msg.includes('migrate') ||
      msg.includes('Database not initialized')
    )
  }

  // If we hit the timeout, return null for session but attach a handler to the
  // ongoing authPromise to surface any fatal errors (and avoid unhandled rejections).
  let session: Session | null = null
  if (typeof (raceResult as { timeout?: boolean }).timeout === 'boolean') {
    // Background handling: log completion or failure. If failure is fatal, escalate.
    authPromise
      .then((s: Session | null) => {
        console.debug('[auth] completed after timeout')
        return s
      })
      .catch((err: unknown) => {
        console.error('[auth] failed after timeout', err)
        if (isFatalAuthError(err)) {
          console.error('[auth] fatal initialization error detected after timeout  exiting')
          // Explicitly terminate so the fatal error is not silently ignored.
          // This follows repository policy: do not hide initialization failures.
          if (typeof process !== 'undefined' && typeof process.exit === 'function') {
            process.exit(1)
          }
        }
      })
    session = null
  } else {
    // At this point it's the resolved session object
    session = (raceResult as { session: Session | null }).session
  }

  return (
    <html lang="ja">
      <body className="min-h-dvh bg-background text-foreground antialiased">
        <Providers session={session ?? undefined}>{children}</Providers>
      </body>
    </html>
  )
}
