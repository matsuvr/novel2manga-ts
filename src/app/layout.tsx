import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Novel to Manga Converter',
  description: '小説をマンガ形式に変換するアプリケーション',
}

import { Inter } from 'next/font/google'

const inter = Inter({ subsets: ['latin'], variable: '--font-sans' })

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja">
      <body className={`${inter.variable} font-sans antialiased`}>{children}</body>
    </html>
  )
}
