import type { Metadata } from 'next'
import './globals.css'
import Providers from './providers'
import { auth } from '@/auth'

const AUTH_TIMEOUT_MS = 500

export const metadata: Metadata = {
  title: 'Novel to Manga Converter',
  description: '小説をマンガ形式に変換するアプリケーション',
}

import { Inter } from 'next/font/google'

const inter = Inter({ subsets: ['latin'], variable: '--font-sans' })

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const authPromise = auth().catch((err) => {
    console.error('auth failed', err)
    return null
  })
  const timeoutPromise = new Promise<null>((resolve) =>
    setTimeout(() => resolve(null), AUTH_TIMEOUT_MS),
  )
  const session = (await Promise.race([authPromise, timeoutPromise])) as Awaited<
    ReturnType<typeof auth>
  > | null

  return (
    <html lang="ja">
      <body className={`${inter.variable} font-sans antialiased`}>
        <Providers session={session}>{children}</Providers>
      </body>
    </html>
  )
}
