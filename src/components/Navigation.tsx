'use client'
import Link from 'next/link'
import { signIn, signOut, useSession } from 'next-auth/react'
import { useState } from 'react'
import { Menu, User } from '@/components/icons'
import { Button } from '@/components/ui/button'
import { routesConfig } from '@/config/routes.config'

export function Navigation() {
  const { data: session, status } = useSession()
  const [mobileOpen, setMobileOpen] = useState(false)

  const handleDrawerToggle = () => {
    setMobileOpen(!mobileOpen)
  }

  const handleSignIn = () => signIn('google')
  const handleSignOut = () => signOut({ callbackUrl: routesConfig.home })

  return (
    <header className="sticky top-0 z-40 border-b bg-white/80 backdrop-blur">
      <div className="container mx-auto flex h-14 items-center justify-between px-4">
        <Link href={routesConfig.home} className="font-semibold tracking-tight">
          Novel2Manga
        </Link>
        <nav className="hidden gap-4 sm:flex">
          <Link
            href={routesConfig.home}
            className="text-sm text-muted-foreground hover:text-foreground"
          >
            ホーム
          </Link>
          {session && (
            <Link
              href={routesConfig.portal.dashboard}
              className="text-sm text-muted-foreground hover:text-foreground"
            >
              マイページ
            </Link>
          )}
        </nav>
        <div className="flex items-center gap-2">
          {status === 'loading' ? (
            <div className="h-4 w-4 animate-spin rounded-full border-2 border-gray-400 border-t-transparent" />
          ) : session ? (
            <>
              <Link
                href={routesConfig.portal.dashboard}
                className="hidden sm:inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
              >
                <User className="h-4 w-4" />
                {session.user?.name ?? 'ユーザー'}
              </Link>
              <Button variant="outline" onClick={handleSignOut}>
                ログアウト
              </Button>
            </>
          ) : (
            <Button variant="outline" onClick={handleSignIn}>
              ログイン
            </Button>
          )}
          <button
            className="sm:hidden inline-flex h-9 w-9 items-center justify-center rounded-md border"
            type="button"
            onClick={handleDrawerToggle}
          >
            <Menu className="h-5 w-5" />
          </button>
        </div>
      </div>
      {mobileOpen && (
        <div className="sm:hidden border-t bg-white">
          <div className="container mx-auto px-4 py-2 flex flex-col gap-2">
            <Link href={routesConfig.home} className="py-2" onClick={handleDrawerToggle}>
              ホーム
            </Link>
            {session && (
              <Link
                href={routesConfig.portal.dashboard}
                className="py-2"
                onClick={handleDrawerToggle}
              >
                マイページ
              </Link>
            )}
            {session ? (
              <Button
                variant="outline"
                onClick={() => {
                  handleDrawerToggle()
                  handleSignOut()
                }}
              >
                ログアウト
              </Button>
            ) : (
              <Button
                variant="default"
                onClick={() => {
                  handleDrawerToggle()
                  handleSignIn()
                }}
              >
                ログイン
              </Button>
            )}
          </div>
        </div>
      )}
    </header>
  )
}
