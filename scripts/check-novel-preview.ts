#!/usr/bin/env tsx
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const projectRoot = path.resolve(__dirname, '..')
process.chdir(projectRoot)

async function main() {
  const key = process.argv[2]
  if (!key) {
    console.error('Usage: tsx scripts/check-novel-preview.ts <storage-key>')
    process.exit(2)
  }

  try {
    const { getNovelStorage } = await import('../src/utils/storage')
    const storage = await getNovelStorage()
    const result = await storage.get(key)
    if (!result) {
      console.log('not found')
      process.exit(0)
    }

    const unwrap = (raw: string, depth = 5) => {
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
    console.log(unwrapped.slice(0, 100))
  } catch (e) {
    console.error('error:', e)
    process.exit(1)
  }
}

main()
