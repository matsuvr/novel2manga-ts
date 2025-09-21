'use client'
import { Footer } from './Footer'
import { Navigation } from './Navigation'

interface AppLayoutProps {
  children: React.ReactNode
}

export function AppLayout({ children }: AppLayoutProps) {
  return (
    <div className="min-h-dvh bg-neutral-50 flex flex-col">
      <Navigation />
      <main className="flex-1 container mx-auto px-4 py-4">{children}</main>
      <Footer />
    </div>
  )
}
