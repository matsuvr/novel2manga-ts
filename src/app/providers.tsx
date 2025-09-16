'use client'

import type { Session } from 'next-auth'
import { SessionProvider } from 'next-auth/react'
import { ThemeProvider } from '@mui/material/styles'
import CssBaseline from '@mui/material/CssBaseline'
import { AppLayout } from '@/components/AppLayout'
import theme from '@/theme'

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
      <ThemeProvider theme={theme}>
        {/* CssBaseline kickstarts an elegant, consistent, and simple baseline to build upon. */}
        <CssBaseline />
        <AppLayout>{children}</AppLayout>
      </ThemeProvider>
    </SessionProvider>
  )
}
