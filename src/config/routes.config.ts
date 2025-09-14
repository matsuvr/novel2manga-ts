export const routesConfig = {
  home: '/',
  portal: {
    dashboard: '/portal/dashboard',
    settings: '/portal/settings',
  },
} as const

export type RoutesConfig = typeof routesConfig
