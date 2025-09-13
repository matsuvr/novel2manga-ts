// Minimal next-auth mock for unit tests
export const getSession = async () => null

export const unstable_getServerSession = async () => null

export const signIn = async (..._args: any[]) => ({ ok: true })
export const signOut = async (..._args: any[]) => ({ ok: true })

export const providers = {}

export default function NextAuth() {
  // noop for tests that import default
}
