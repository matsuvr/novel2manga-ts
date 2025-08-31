import NextAuth from 'next-auth'
import Google from 'next-auth/providers/google'
import { DrizzleAdapter } from '@auth/drizzle-adapter'
import { getDatabase, schema } from '@/db'

const db = getDatabase()

const { AUTH_GOOGLE_ID, AUTH_GOOGLE_SECRET, AUTH_SECRET } = process.env
if (!AUTH_GOOGLE_ID || !AUTH_GOOGLE_SECRET || !AUTH_SECRET) {
  throw new Error('Missing authentication environment variables')
}

export const {
  handlers: { GET, POST },
  auth,
  signIn,
  signOut,
} = NextAuth({
  adapter: DrizzleAdapter(db, { schema }),
  session: { strategy: 'database' },
  providers: [Google({ clientId: AUTH_GOOGLE_ID, clientSecret: AUTH_GOOGLE_SECRET })],
  secret: AUTH_SECRET,
})
