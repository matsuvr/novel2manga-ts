'use client'

import Link from 'next/link'
import { signIn, signOut, useSession } from 'next-auth/react'
import React, { useState } from 'react'
import { routesConfig } from '@/config/routes.config'
import {
  AppBar,
  Toolbar,
  Typography,
  Button,
  IconButton,
  Avatar,
  Menu,
  MenuItem,
  Box,
  Container,
  CircularProgress,
  useTheme,
  useMediaQuery,
  Drawer,
  List,
  ListItem,
  ListItemButton,
  ListItemText,
  Divider,
} from '@mui/material'
import MenuIcon from '@mui/icons-material/Menu'
import AccountCircle from '@mui/icons-material/AccountCircle'

export function Navigation() {
  const { data: session, status } = useSession()
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null)

  const handleMenu = (event: React.MouseEvent<HTMLElement>) => {
    setAnchorEl(event.currentTarget)
  }

  const handleClose = () => {
    setAnchorEl(null)
  }

  const handleSignIn = () => signIn('google')
  const handleSignOut = () => signOut({ callbackUrl: routesConfig.home })

  return (
    <AppBar position="static" color="inherit" elevation={1}>
      <Container maxWidth="lg">
        <Toolbar>
          <Typography variant="h6" component={Link} href={routesConfig.home} sx={{ flexGrow: 1, textDecoration: 'none', color: 'inherit' }}>
            Novel2Manga
          </Typography>
          <Button color="inherit" component={Link} href={routesConfig.home}>
            ホーム
          </Button>
          {session && (
            <Button color="inherit" component={Link} href={routesConfig.portal.dashboard}>
              マイページ
            </Button>
          )}
          {status === 'loading' ? (
            <CircularProgress size={24} color="inherit" />
          ) : session ? (
            <>
              <IconButton onClick={handleMenu} sx={{ p: 0, ml: 2 }}>
                <Avatar alt={session.user?.name || ''} src={session.user?.image || undefined}>
                  {!session.user?.image && <AccountCircle />}
                </Avatar>
              </IconButton>
              <Menu
                anchorEl={anchorEl}
                open={Boolean(anchorEl)}
                onClose={handleClose}
              >
                <MenuItem component={Link} href={routesConfig.portal.dashboard} onClick={handleClose}>マイページ</MenuItem>
                <MenuItem component={Link} href={routesConfig.portal.settings} onClick={handleClose}>設定</MenuItem>
                <Divider />
                <MenuItem onClick={() => { handleClose(); handleSignOut(); }}>ログアウト</MenuItem>
              </Menu>
            </>
          ) : (
            <Button color="inherit" variant="outlined" onClick={handleSignIn}>
              ログイン
            </Button>
          )}
        </Toolbar>
      </Container>
    </AppBar>
  )
}
