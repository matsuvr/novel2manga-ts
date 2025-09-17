// Deprecated legacy theme object (kept for compatibility). No external UI libs.
export type LegacyTheme = {
  palette: {
    primary: { main: string }
    secondary: { main: string }
    error: { main: string }
  }
  typography: { fontFamily: string }
}

const theme: LegacyTheme = {
  palette: {
    primary: { main: '#556cd6' },
    secondary: { main: '#19857b' },
    error: { main: '#ef4444' },
  },
  typography: {
    fontFamily:
      '-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"Helvetica Neue",Arial,sans-serif,"Apple Color Emoji","Segoe UI Emoji","Segoe UI Symbol"',
  },
}

export default theme
