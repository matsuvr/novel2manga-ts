// app/portal/api/auth/[...nextauth]/route.ts
import NextAuth from 'next-auth'
import { getAuthOptions } from '@/auth'

// In App Router, export the handler reference directly so Next.js supplies
// the correct (req, { params: { nextauth } }) context that NextAuth expects.
const handler = NextAuth(getAuthOptions())
export { handler as GET, handler as POST }