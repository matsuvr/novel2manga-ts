import NextAuth, { type NextAuthConfig } from 'next-auth'
import Credentials from 'next-auth/providers/credentials'

const users = [
  { id: 'user1', email: 'user1@example.com', password: 'password' },
  { id: 'user2', email: 'user2@example.com', password: 'password' },
]

export const authOptions: NextAuthConfig = {
  providers: [
    Credentials({
      name: 'Credentials',
      credentials: {
        email: { label: 'Email', type: 'text' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials) {
        const user = users.find(
          (u) => u.email === credentials?.email && u.password === credentials.password,
        )
        if (user) return { id: user.id, email: user.email }
        return null
      },
    }),
  ],
  session: { strategy: 'jwt' },
  callbacks: {
    async jwt({ token, user }) {
      if (user) token.sub = user.id
      return token
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.sub as string
      }
      return session
    },
  },
  secret: process.env.NEXTAUTH_SECRET || 'test-secret',
}

export const { handlers, auth } = NextAuth(authOptions)
