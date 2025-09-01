import NextAuth, { type NextAuthConfig } from 'next-auth'
import Credentials from 'next-auth/providers/credentials'
import { getDatabaseService } from '@/services/db-factory'

// For development/demo purposes only - replace with proper user management in production
const getDemoUsers = () => {
  if (process.env.NODE_ENV === 'production') {
    return [] // No hardcoded users in production
  }

  // Development/demo users - NOT for production use
  return [
    {
      id: process.env.DEMO_USER1_ID || 'user1',
      email: process.env.DEMO_USER1_EMAIL || 'user1@example.com',
      password: process.env.DEMO_USER1_PASSWORD || 'password',
    },
    {
      id: process.env.DEMO_USER2_ID || 'user2',
      email: process.env.DEMO_USER2_EMAIL || 'user2@example.com',
      password: process.env.DEMO_USER2_PASSWORD || 'password',
    },
  ]
}

export const authOptions: NextAuthConfig = {
  providers: [
    Credentials({
      name: 'Credentials',
      credentials: {
        email: { label: 'Email', type: 'text' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) {
          return null
        }

        // For production, integrate with database user authentication
        if (process.env.NODE_ENV === 'production') {
          // TODO: Implement proper database user authentication with hashed passwords
          // const db = getDatabaseService()
          // const user = await db.getUserByEmail(credentials.email)
          // const isPasswordValid = await bcrypt.compare(credentials.password, user.hashedPassword)
          // if (isPasswordValid) return { id: user.id, email: user.email }
          console.error('Production authentication not yet implemented')
          return null
        }

        // Development/demo mode - NOT secure for production
        const demoUsers = getDemoUsers()
        const user = demoUsers.find(
          (u) => u.email === credentials.email && u.password === credentials.password,
        )

        if (user) {
          // Ensure user exists in database
          const db = getDatabaseService()
          try {
            await db.createUserIfNotExists(user.id, user.email)
          } catch (error) {
            console.error('Failed to create user in database:', error)
          }
          return { id: user.id, email: user.email }
        }

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
      if (session.user && token.sub) {
        session.user.id = token.sub as string
      }
      return session
    },
  },
  secret: process.env.NEXTAUTH_SECRET,
}

export const { handlers, auth } = NextAuth(authOptions)
