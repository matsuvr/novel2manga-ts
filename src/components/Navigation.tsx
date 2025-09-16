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
  const [mobileOpen, setMobileOpen] = useState(false)
  const theme = useTheme()
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'))

  const handleMenu = (event: React.MouseEvent<HTMLElement>) => {
    setAnchorEl(event.currentTarget)
  }

  const handleClose = () => {
    setAnchorEl(null)
  }

  const handleDrawerToggle = () => {
    setMobileOpen(!mobileOpen)
  }

  const handleSignIn = () => signIn('google')
  const handleSignOut = () => signOut({ callbackUrl: routesConfig.home })

  const navLinks = (
    <Box sx={{ display: { xs: 'none', sm: 'block' } }}>
      <Button color="inherit" component={Link} href={routesConfig.home}>
        ホーム
      </Button>
      {session && (
        <>
          <Button color="inherit" component={Link} href={routesConfig.portal.dashboard}>
            マイページ
          </Button>
        </>
      )}
    </Box>
  )

  const mobileNavLinks = (
    <Box onClick={handleDrawerToggle} sx={{ textAlign: 'center', width: 240 }}>
      <Typography variant="h6" sx={{ my: 2 }}>
        Novel2Manga
      </Typography>
      <Divider />
      <List>
        <ListItem disablePadding>
          <ListItemButton component={Link} href={routesConfig.home}>
            <ListItemText primary="ホーム" />
          </ListItemButton>
        </ListItem>
        {session && (
            <ListItem disablePadding>
              <ListItemButton component={Link} href={routesConfig.portal.dashboard}>
                <ListItemText primary="マイページ" />
              </ListItemButton>
            </ListItem>
        )}
      </List>
      <Divider />
        {session ? (
            <List>
                <ListItem>
                    <ListItemText primary={session.user?.name || 'User'} secondary={session.user?.email} />
                </ListItem>
                <ListItem disablePadding>
                    <ListItemButton component={Link} href={routesConfig.portal.settings}>
                        <ListItemText primary="設定" />
                    </ListItemButton>
                </ListItem>
                <ListItem disablePadding>
                    <ListItemButton onClick={handleSignOut}>
                        <ListItemText primary="ログアウト" />
                    </ListItemButton>
                </ListItem>
            </List>
        ) : (
            <List>
                <ListItem disablePadding>
                    <ListItemButton onClick={handleSignIn}>
                        <ListItemText primary="ログイン" />
                    </ListItemButton>
                </ListItem>
            </List>
        )}
    </Box>
  )

  return (
    <>
      <AppBar position="static" sx={{ bgcolor: 'background.paper', color: 'text.primary' }} elevation={1}>
        <Container maxWidth="lg">
          <Toolbar>
            <Typography
              variant="h6"
              component={Link}
              href={routesConfig.home}
              sx={{
                flexGrow: 1,
                textDecoration: 'none',
                color: 'inherit',
              }}
            >
              Novel2Manga
            </Typography>

            {!isMobile && navLinks}

            <Box sx={{ flexGrow: 0, ml: 2, display: { xs: 'none', sm: 'block' } }}>
              {status === 'loading' ? (
                <CircularProgress size={24} color="inherit" />
              ) : session ? (
                <>
                  <IconButton onClick={handleMenu} sx={{ p: 0 }}>
                    <Avatar alt={session.user?.name || ''} src={session.user?.image || undefined}>
                      {!session.user?.image && <AccountCircle />}
                    </Avatar>
                  </IconButton>
                  <Menu
                    anchorEl={anchorEl}
                    open={Boolean(anchorEl)}
                    onClose={handleClose}
                    anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
                    transformOrigin={{ vertical: 'top', horizontal: 'right' }}
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
            </Box>
            {isMobile && (
              <IconButton
                color="inherit"
                aria-label="open drawer"
                edge="end"
                onClick={handleDrawerToggle}
              >
                <MenuIcon />
              </IconButton>
            )}
          </Toolbar>
        </Container>
      </AppBar>
      <nav>
        <Drawer
          anchor="right"
          variant="temporary"
          open={mobileOpen}
          onClose={handleDrawerToggle}
          ModalProps={{
            keepMounted: true,
          }}
          sx={{
            display: { xs: 'block', sm: 'none' },
            '& .MuiDrawer-paper': { boxSizing: 'border-box', width: 240 },
          }}
        >
          {mobileNavLinks}
        </Drawer>
      </nav>
    </>
  )
}
