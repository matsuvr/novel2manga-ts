// readFile not used - use storage factory instead
import { eq } from 'drizzle-orm'
import { NextResponse } from 'next/server'
import { getDatabase } from '@/db'
import { novels } from '@/db/schema'
import { getLogger } from '@/infrastructure/logging/logger'
import { loadNovelPreview } from '@/utils/novel-text'

export async function GET(_req: Request, { params }: { params: { novelId: string } }) {
  // `params` can be an async proxy in some Next.js runtimes — await the params object
  const { novelId } = await params as { novelId: string }
  if (!novelId || typeof novelId !== 'string') {
    return NextResponse.json({ error: 'invalid_novel_id' }, { status: 400 })
  }
  const db = getDatabase()
  const rows = await db
    .select({ originalTextPath: novels.originalTextPath })
    .from(novels)
    .where(eq(novels.id, novelId))

  if (!rows || rows.length === 0) {
    return NextResponse.json({ error: 'novel_not_found' }, { status: 404 })
  }

  const path = rows[0].originalTextPath
  if (!path) return NextResponse.json({ preview: null })

  try {
    const preview = await loadNovelPreview(path, { length: 100 })
    return NextResponse.json({ preview: preview ?? null })
  } catch (error) {
    getLogger()
      .withContext({ route: 'api/novels/[novelId]/preview', method: 'GET', novelId })
      .error('Failed to load novel preview', {
        path,
        error: error instanceof Error ? error.message : String(error),
      })
    return NextResponse.json({ preview: null })
  }
}

