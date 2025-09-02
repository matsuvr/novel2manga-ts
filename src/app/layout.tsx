import type { Metadata } from 'next'
import './globals.css'
import Providers from './providers'
import { auth } from '@/auth'

export const metadata: Metadata = {
  title: 'Novel to Manga Converter',
  description: '小説をマンガ形式に変換するアプリケーション',
}

import { Inter } from 'next/font/google'

const inter = Inter({ subsets: ['latin'], variable: '--font-sans' })

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const session = await auth()
  return (
    <html lang="ja">
      <body className={`${inter.variable} font-sans antialiased`}>
        <Providers session={session}>{children}</Providers>
      </body>
    </html>
  )
}
