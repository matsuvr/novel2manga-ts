// readFile not used - use storage factory instead
import { eq } from 'drizzle-orm'
import { NextResponse } from 'next/server'
import { getDatabase } from '@/db'
import { novels } from '@/db/schema'

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
    const { getNovelStorage } = await import('@/utils/storage')
    const storage = await getNovelStorage()
    const result = await storage.get(path)
    if (!result) return NextResponse.json({ preview: null })
    // Unwrap nested JSON wrappers if present (same logic as JobService)
    const unwrap = (raw: string, depth = 5): string => {
      let cur: unknown = raw
      for (let i = 0; i < depth; i++) {
        if (typeof cur !== 'string') break
        try {
          const parsed = JSON.parse(cur)
          if (parsed && typeof parsed === 'object') {
            if ('content' in (parsed as Record<string, unknown>) && typeof (parsed as Record<string, unknown>).content === 'string') {
              cur = (parsed as Record<string, unknown>).content
              continue
            }
            if ('text' in (parsed as Record<string, unknown>) && typeof (parsed as Record<string, unknown>).text === 'string') {
              cur = (parsed as Record<string, unknown>).text
              continue
            }
            break
          }
          cur = String(parsed)
        } catch {
          break
        }
      }
      return typeof cur === 'string' ? cur : String(cur)
    }

    const unwrapped = unwrap(result.text)
    const preview = unwrapped.slice(0, 100)
    return NextResponse.json({ preview })
  } catch (_err) {
    // If read fails, return null but don't throw
    return NextResponse.json({ preview: null })
  }
}

