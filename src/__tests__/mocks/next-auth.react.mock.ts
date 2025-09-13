import React from 'react'

export const SessionProvider: React.FC<any> = ({ children }) => {
  return React.createElement(React.Fragment, null, children)
}

export function useSession() {
  return { data: null, status: 'unauthenticated' }
}

export function signIn(..._args: any[]) {
  return Promise.resolve({ ok: true })
}

export function signOut(..._args: any[]) {
  return Promise.resolve({ ok: true })
}

export default {
  SessionProvider,
  useSession,
  signIn,
  signOut,
}
