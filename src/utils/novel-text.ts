import { StorageFactory } from '@/utils/storage'

export function unwrapStoredText(raw: string, maxDepth = 5): string {
  let current: unknown = raw
  for (let depth = 0; depth < maxDepth; depth++) {
    // Only attempt to parse when we currently have a string
    if (typeof current !== 'string') break
    try {
      const parsed = JSON.parse(current)
      // If parsed is an object, try to unwrap known fields and continue
      if (parsed && typeof parsed === 'object') {
        const record = parsed as Record<string, unknown>
        if (typeof record.content === 'string') {
          current = record.content
          continue
        }
        if (typeof record.text === 'string') {
          current = record.text
          continue
        }
        // Object doesn't contain known text fields — stop unwrapping
        break
      }
      // Parsed to a primitive (number/null/boolean). Treat as final value.
      current = parsed
      break
    } catch {
      // Not valid JSON — assume current is the final text
      break
    }
  }
  return String(current)
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
