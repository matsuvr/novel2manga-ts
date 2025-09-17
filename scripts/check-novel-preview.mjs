#!/usr/bin/env node
import path from 'node:path'
import { fileURLToPath } from 'node:url'

// Ensure project root is module resolution base
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const projectRoot = path.resolve(__dirname, '..')
process.chdir(projectRoot)

async function main() {
  const key = process.argv[2]
  if (!key) {
    console.error('Usage: node scripts/check-novel-preview.mjs <storage-key>')
    process.exit(2)
  }

  try {
    const { getNovelStorage } = await import('../src/utils/storage.js')
    const storage = await getNovelStorage()
    const result = await storage.get(key)
    if (!result) {
      console.log('not found')
      process.exit(0)
    }

    // Attempt to unwrap nested JSON like the app
    const unwrap = (raw, depth = 5) => {
      let cur = raw
      for (let i = 0; i < depth; i++) {
        if (typeof cur !== 'string') break
        try {
          const parsed = JSON.parse(cur)
          if (parsed && typeof parsed === 'object') {
            if ('content' in parsed && typeof parsed.content === 'string') {
              cur = parsed.content
              continue
            }
            if ('text' in parsed && typeof parsed.text === 'string') {
              cur = parsed.text
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
