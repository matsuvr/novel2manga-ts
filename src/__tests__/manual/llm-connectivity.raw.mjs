// LLM connectivity (raw HTTP, manual)
// - Lives under src/__tests__/manual but is NOT a test file (no .test suffix)
// - Run with:
//     npm run manual:llm:raw
//     PROVIDER=openai npm run manual:llm:raw:provider

const PROVIDERS = ['openai', 'gemini', 'cerebras', 'groq', 'openrouter']

// minimal .env loader (no deps)
import fs from 'node:fs'
import path from 'node:path'

function loadDotEnvFile(filePath) {
  try {
    const raw = fs.readFileSync(filePath, 'utf8')
    for (const line of raw.split(/\r?\n/)) {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith('#')) continue
      const eq = trimmed.indexOf('=')
      if (eq === -1) continue
      const key = trimmed.slice(0, eq).trim()
      let val = trimmed.slice(eq + 1).trim()
      if (
        (val.startsWith('"') && val.endsWith('"')) ||
        (val.startsWith("'") && val.endsWith("'"))
      ) {
        val = val.slice(1, -1)
      }
      if (!(key in process.env)) process.env[key] = val
    }
  } catch {}
}
function loadDotEnv() {
  const here = path.dirname(new URL(import.meta.url).pathname)
  const candidates = [
    path.resolve(process.cwd(), '.env'),
    path.resolve(process.cwd(), '.env.local'),
    path.resolve(process.cwd(), '.env.development'),
    path.resolve(here, '../../.env'),
    path.resolve(here, '../../.env.local'),
    path.resolve(here, '../../.env.development'),
  ]
  for (const p of candidates) loadDotEnvFile(p)
}
loadDotEnv()

function env(k) {
  return (process.env[k] || '').trim()
}
function hasKey(keys) {
  return keys.some((k) => env(k).length > 0)
}
function pickProviders(arg) {
  if (arg && PROVIDERS.includes(arg)) return [arg]
  const present = []
  if (hasKey(['OPENAI_API_KEY'])) present.push('openai')
  if (hasKey(['GEMINI_API_KEY', 'GOOGLE_API_KEY'])) present.push('gemini')
  if (hasKey(['CEREBRAS_API_KEY'])) present.push('cerebras')
  if (hasKey(['GROQ_API_KEY'])) present.push('groq')
  if (hasKey(['OPENROUTER_API_KEY'])) present.push('openrouter')
  return present
}

async function testOpenAI() {
  const apiKey = env('OPENAI_API_KEY')
  if (!apiKey) throw new Error('OPENAI_API_KEY is missing')
  const model = env('OPENAI_MODEL') || 'gpt-4o-mini'
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: 'You are an echo bot.' },
        { role: 'user', content: 'ping' },
      ],
      max_tokens: 8,
    }),
  })
  const text = await res.text()
  return {
    provider: 'openai',
    status: res.status,
    ok: res.ok,
    preview: text.slice(0, 200),
    source: 'raw-openai',
  }
}

async function testGemini() {
  const apiKey = env('GEMINI_API_KEY') || env('GOOGLE_API_KEY')
  if (!apiKey) throw new Error('GEMINI_API_KEY/GOOGLE_API_KEY is missing')
  const model = env('GEMINI_MODEL') || 'gemini-2.0-flash-exp'
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: 'ping' }] }],
      generationConfig: { maxOutputTokens: 8 },
    }),
  })
  const text = await res.text()
  return {
    provider: 'gemini',
    status: res.status,
    ok: res.ok,
    preview: text.slice(0, 200),
    source: 'raw-gemini',
  }
}

async function testCerebras() {
  const apiKey = env('CEREBRAS_API_KEY')
  if (!apiKey) throw new Error('CEREBRAS_API_KEY is missing')
  const model = env('CEREBRAS_MODEL') || 'llama3.1-8b'
  const url = 'https://api.cerebras.ai/v1/chat/completions'
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: 'You are an echo bot.' },
        { role: 'user', content: 'ping' },
      ],
      max_tokens: 8,
    }),
  })
  const text = await res.text()
  return {
    provider: 'cerebras',
    status: res.status,
    ok: res.ok,
    preview: text.slice(0, 200),
    source: 'raw-cerebras',
  }
}

async function testGroq() {
  const apiKey = env('GROQ_API_KEY')
  if (!apiKey) throw new Error('GROQ_API_KEY is missing')
  const model = env('GROQ_MODEL') || 'llama-3.1-8b-instant'
  const url = 'https://api.groq.com/openai/v1/chat/completions'
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: 'You are an echo bot.' },
        { role: 'user', content: 'ping' },
      ],
      max_tokens: 8,
    }),
  })
  const text = await res.text()
  return {
    provider: 'groq',
    status: res.status,
    ok: res.ok,
    preview: text.slice(0, 200),
    source: 'raw-groq',
  }
}

async function testOpenRouter() {
  const apiKey = env('OPENROUTER_API_KEY')
  if (!apiKey) throw new Error('OPENROUTER_API_KEY is missing')
  const model = env('OPENROUTER_MODEL') || 'openai/gpt-4o-mini'
  const url = 'https://openrouter.ai/api/v1/chat/completions'
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: 'You are an echo bot.' },
        { role: 'user', content: 'ping' },
      ],
      max_tokens: 8,
    }),
  })
  const text = await res.text()
  return {
    provider: 'openrouter',
    status: res.status,
    ok: res.ok,
    preview: text.slice(0, 200),
    source: 'raw-openrouter',
  }
}

async function main() {
  const arg = (process.argv[2] || '').trim()
  const targets = pickProviders(arg)
  if (targets.length === 0) {
    console.log('[INFO] No API keys detected. Skipping raw connectivity test.')
    console.log(
      'Set env: OPENAI_API_KEY / GEMINI_API_KEY|GOOGLE_API_KEY / CEREBRAS_API_KEY / GROQ_API_KEY / OPENROUTER_API_KEY',
    )
    process.exit(0)
  }

  const out = []
  let hasError = false
  for (const p of targets) {
    try {
      let r
      if (p === 'openai') r = await testOpenAI()
      if (p === 'gemini') r = await testGemini()
      if (p === 'cerebras') r = await testCerebras()
      if (p === 'groq') r = await testGroq()
      if (p === 'openrouter') r = await testOpenRouter()
      out.push(r)
    } catch (e) {
      hasError = true
      out.push({ provider: p, ok: false, error: String(e && e.message ? e.message : e) })
    }
  }

  console.log(JSON.stringify({ results: out }, null, 2))
  process.exit(hasError ? 1 : 0)
}

main().catch((e) => {
  console.error('Fatal:', e)
  process.exit(1)
})
