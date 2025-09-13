'use client'

import type { Session } from 'next-auth'
import { SessionProvider } from 'next-auth/react'
import { AppLayout } from '@/components/AppLayout'

interface ProvidersProps {
  children: React.ReactNode
  session?: Session | null
}

export default function Providers({ children, session }: ProvidersProps) {
  return (
    <SessionProvider session={session} refetchOnWindowFocus={false} refetchInterval={0}>
      <AppLayout>{children}</AppLayout>
    </SessionProvider>
  )
}
