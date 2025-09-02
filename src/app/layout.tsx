import type { Metadata } from 'next'
import './globals.css'
import { auth } from '@/auth'
import Providers from './providers'

export const metadata: Metadata = {
  title: 'Novel to Manga Converter',
  description: '小説をマンガ形式に変換するアプリケーション',
}

// Google Fonts はネットワーク到達性に依存し、開発環境で著しく遅延する場合がある。
// DISABLE_REMOTE_FONTS=1 の場合はシステムフォントにフォールバック。
let interVariable = ''
try {
  if (process.env.DISABLE_REMOTE_FONTS !== '1') {
    const { Inter } = await import('next/font/google')
    const inter = Inter({ subsets: ['latin'], variable: '--font-sans', display: 'swap' })
    interVariable = inter.variable
  }
} catch {
  // 取得に失敗した場合はフォールバック（フォントはシステムフォント）。
  interVariable = ''
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // 開発時の初期表示遅延を避けるため、auth取得にタイムアウトを設ける
  // より短いタイムアウト（500ms）でフォールバックを早期化
  let session = null as Awaited<ReturnType<typeof auth>> | null
  try {
    session = (await Promise.race([
      auth(),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), 500)),
    ])) as Awaited<ReturnType<typeof auth>> | null
  } catch {
    session = null
  }
  return (
    <html lang="ja">
      <body className={`${interVariable} font-sans antialiased`}>
        <Providers session={session}>{children}</Providers>
      </body>
    </html>
  )
}
