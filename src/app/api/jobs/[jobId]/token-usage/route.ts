import { NextResponse } from 'next/server'
import { db } from '@/services/database'

export const runtime = 'nodejs'

export async function GET(
  _request: Request,
  ctx: { params: { jobId: string } | Promise<{ jobId: string }> },
) {
  try {
    const { jobId } = await ctx.params
    if (!jobId || jobId === 'undefined') {
      return NextResponse.json({ error: 'jobId is required' }, { status: 400 })
    }
    const rows = await db.tokenUsage().listByJob(jobId)
    return NextResponse.json({ tokenUsage: rows })
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
