import { StorageFactory } from '@/utils/storage'

export function unwrapStoredText(raw: string, maxDepth = 5): string {
  let current: unknown = raw
  for (let depth = 0; depth < maxDepth; depth++) {
    if (typeof current !== 'string') break
    try {
      const parsed = JSON.parse(current)
      if (parsed && typeof parsed === 'object') {
        const record = parsed as Record<string, unknown>
        const content = record.content
        if (typeof content === 'string') {
          current = content
          continue
        }
        const text = record.text
        if (typeof text === 'string') {
          current = text
          continue
        }
        break
      }
      current = String(parsed)
    } catch {
      break
    }
  }
  return typeof current === 'string' ? current : String(current)
}

export interface NovelPreviewOptions {
  length?: number
  maxDepth?: number
}

export async function loadNovelPreview(
  originalTextPath: string,
  options: NovelPreviewOptions = {},
): Promise<string | undefined> {
  if (!originalTextPath) return undefined

  const storage = await StorageFactory.getNovelStorage()
  const result = await storage.get(originalTextPath)
  if (!result || typeof result.text !== 'string') {
    return undefined
  }

  const maxDepth = options.maxDepth ?? 5
  const unwrapped = unwrapStoredText(result.text, maxDepth)
  const normalized = unwrapped.replace(/\s+/g, ' ').trim()
  if (normalized.length === 0) {
    return undefined
  }
  const length = options.length ?? 100
  return normalized.slice(0, length)
}
