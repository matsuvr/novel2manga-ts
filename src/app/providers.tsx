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
    <SessionProvider
      // If the server-side `session` is null because of a short timeout,
      // pass `undefined` so the client will perform its own fetch of
      // `/api/auth/session`. Passing `null` would tell the provider there
      // is explicitly no session and prevent an initial fetch.
      session={session ?? undefined}
      // Allow refetch on window focus so that returning from the OAuth
      // callback or switching tabs triggers a revalidation.
      refetchOnWindowFocus={true}
      refetchInterval={0}
      // basePath="/portal/api/auth" // Remove custom basePath to use default
    >
      <AppLayout>{children}</AppLayout>
    </SessionProvider>
  )
}
