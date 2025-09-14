export const routesConfig = {
  home: '/',
  portal: {
    dashboard: '/portal/dashboard',
  },
} as const

export type RoutesConfig = typeof routesConfig
