'use client'
import { Navigation } from './Navigation'

interface AppLayoutProps {
  children: React.ReactNode
}

export function AppLayout({ children }: AppLayoutProps) {
  return (
    <div className="min-h-dvh bg-neutral-50">
      <Navigation />
      <main className="container mx-auto px-4 py-4">{children}</main>
    </div>
  )
}
