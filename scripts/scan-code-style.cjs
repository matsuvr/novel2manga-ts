#!/usr/bin/env node
const fs = require('node:fs')
const path = require('node:path')

// Patterns to search for
const patterns = [
  { key: 'as_cast', // generic `as Type` casts
    regex: /\bas\s+[A-Z][A-Za-z0-9_<>]*/g,
    desc: '`as Type` cast (possible redundant assertions)'
  },
  { key: 'e_as_error',
    regex: /\(e\s+as\s+Error\)/g,
    desc: '(e as Error) explicit cast in catch'
  },
  { key: 'one_line_try_catch',
    // try { ... } catch (e) { ... } on a single line
    regex: /try\s*\{[^\n]*\}\s*catch\s*\([^)]*\)\s*\{[^\n]*\}/g,
    desc: 'one-line try/catch block (consider expanding)'
  }
]

const repoRoot = path.resolve(__dirname, '..')

function walk(dir, filelist = []) {
  const files = fs.readdirSync(dir)
  files.forEach((file) => {
    const full = path.join(dir, file)
    let stat
    try {
      stat = fs.statSync(full)
    } catch (_) {
      return
    }
    if (stat.isDirectory()) {
      // skip node_modules, .git, dist, build
      if (file === 'node_modules' || file === '.git' || file === 'dist' || file === 'build') return
      walk(full, filelist)
    } else if (stat.isFile()) {
      // consider scanning .ts, .tsx, .js, .jsx only
      if (/\.(ts|tsx|js|jsx)$/.test(file)) filelist.push(full)
    }
  })
  return filelist
}

function scanFile(filePath) {
  const text = fs.readFileSync(filePath, 'utf8')
  const results = []
  for (const p of patterns) {
    p.regex.lastIndex = 0
    let m = p.regex.exec(text)
    while (m !== null) {
      const idx = m.index
      // compute line number
      const upTo = text.slice(0, idx)
      const line = upTo.split('\n').length
      const col = idx - upTo.lastIndexOf('\n')
      results.push({ pattern: p.key, desc: p.desc, match: m[0], line, col })
      m = p.regex.exec(text)
    }
  }
  return results
}

function main() {
  const files = walk(repoRoot)
  const out = {}
  for (const f of files) {
    const rel = path.relative(repoRoot, f)
    const res = scanFile(f)
    if (res.length > 0) out[rel] = res
  }
  const outPath = path.join(repoRoot, 'scripts', 'scan-results.json')
  fs.writeFileSync(outPath, JSON.stringify({ generatedAt: new Date().toISOString(), results: out }, null, 2))
  console.log('Scan complete. Results written to', outPath)
}

main()
