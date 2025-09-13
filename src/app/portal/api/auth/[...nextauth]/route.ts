// app/portal/api/auth/[...nextauth]/route.ts
import NextAuth from 'next-auth'
import { getAuthOptions } from '@/auth'

export const GET = async (req: Request) => {
    const handler = NextAuth(getAuthOptions())
    // Treat the NextAuth handler as an edge-compatible function for this route.
    const asEdge = handler as unknown as (r: Request) => Promise<Response>
    return asEdge(req)
}

export const POST = async (req: Request) => {
    const handler = NextAuth(getAuthOptions())
    const asEdge = handler as unknown as (r: Request) => Promise<Response>
    return asEdge(req)
}