import type { Metadata } from 'next'
import './globals.css'
import { auth } from '@/auth'
import { getMissingAuthEnv } from '@/utils/auth-env'
import { authConfig } from '@/config/auth.config'
import Providers from './providers'

export const metadata: Metadata = {
  title: 'Novel to Manga Converter',
  description: '小説をマンガ形式に変換するアプリケーション',
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
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

  // Start auth but do not swallow its errors — we only want to fallback on *timeout*.
  // If auth later fails with a fatal initialization error (missing env, migration failure),
  // we must not hide it; detect and escalate.
  const authPromise = auth()

  const timeoutMarker = Symbol('timeout') as unknown as { timeout: true }
  const timeoutPromise = new Promise<typeof timeoutMarker>((resolve) =>
    setTimeout(() => resolve(timeoutMarker), authConfig.timeoutMs),
  )

  const raceResult = await Promise.race([authPromise.then((s) => ({ session: s })), timeoutPromise])

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
  let session: Awaited<ReturnType<typeof auth>> | null = null
  if (raceResult === (timeoutMarker as unknown)) {
    // Background handling: log completion or failure. If failure is fatal, escalate.
    authPromise
      .then((s) => {
        console.debug('[auth] completed after timeout')
        return s
      })
      .catch((err) => {
        console.error('[auth] failed after timeout', err)
        if (isFatalAuthError(err)) {
          console.error('[auth] fatal initialization error detected after timeout — exiting')
          // Explicitly terminate so the fatal error is not silently ignored.
          // This follows repository policy: do not hide initialization failures.
          if (typeof process !== 'undefined' && typeof process.exit === 'function') {
            process.exit(1)
          }
        }
      })
    session = null
  } else {
    // raceResult is { session }
    session = (raceResult as { session: Awaited<ReturnType<typeof auth>> }).session
  }

  return (
    <html lang="ja">
      <body className="antialiased">
        <Providers session={session}>{children}</Providers>
      </body>
    </html>
  )
}
