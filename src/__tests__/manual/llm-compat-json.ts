// CompatAgent を用いた JSON 構造の手動導通チェック
// 実行例:
//   npm run manual:llm:compat
//   PROVIDER=openai npm run manual:llm:compat:provider

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { z } from 'zod'

// .env ローダー（依存なし）
function loadDotEnvFile(filePath: string) {
  try {
    const raw = fs.readFileSync(filePath, 'utf8')
    for (const line of raw.split(/\r?\n/)) {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith('#')) continue
      const eq = trimmed.indexOf('=')
      if (eq === -1) continue
      const key = trimmed.slice(0, eq).trim()
      let val = trimmed.slice(1 + eq).trim()
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
  const __filename = fileURLToPath(import.meta.url)
  const __dirname = path.dirname(__filename)
  const candidates = [
    path.resolve(process.cwd(), '.env'),
    path.resolve(process.cwd(), '.env.local'),
    path.resolve(process.cwd(), '.env.development'),
    path.resolve(__dirname, '../../.env'),
    path.resolve(__dirname, '../../.env.local'),
    path.resolve(__dirname, '../../.env.development'),
  ]
  for (const p of candidates) loadDotEnvFile(p)
}
loadDotEnv()

// アプリのモジュール（相対パスで直接参照）
import { CompatAgent } from '@/agents/compat'
import { appConfig } from '@/config/app.config'
import { getLLMProviderConfig, type LLMProvider } from '@/config/llm.config'

// config/index.ts を経由せず、ここで必要分を構築
type SimplePromptConfig = {
  provider: LLMProvider
  maxTokens: number
  systemPrompt: string
  userPromptTemplate: string
}
function resolveProvider(): LLMProvider {
  const envP = (process.env.PROVIDER || '').trim().toLowerCase()
  const allow: LLMProvider[] = ['openai', 'gemini', 'groq', 'openrouter', 'fake']
  if (allow.includes(envP as LLMProvider)) return envP as LLMProvider
  // キー検出による自動選択（優先度: gemini -> openai -> groq -> openrouter）
  const has = (k: string) => (process.env[k] || '').trim().length > 0
  if (has('GEMINI_API_KEY') || has('GOOGLE_API_KEY')) return 'gemini'
  if (has('OPENAI_API_KEY')) return 'openai'
  if (has('GROQ_API_KEY')) return 'groq'
  if (has('OPENROUTER_API_KEY')) return 'openrouter'
  // cerebras removed from supported providers
  return 'gemini'
}

function getTextAnalysisConfig(): SimplePromptConfig {
  const prompts = appConfig.llm.textAnalysis
  const provider = resolveProvider()
  const providerConfig = getLLMProviderConfig(provider)
  return {
    provider,
    maxTokens: providerConfig.maxTokens,
    systemPrompt: prompts.systemPrompt,
    userPromptTemplate: prompts.userPromptTemplate,
  }
}
// getPageBreakEstimationConfig removed - replaced with importance-based calculation

// 期待JSONスキーマ（app.config.ts の仕様に合わせた緩めの検証）
const TextAnalysisSchema = z
  .object({
    characters: z
      .array(
        z.object({
          name: z.string().optional(),
          description: z.string().optional(),
          firstAppearance: z.number().optional(),
        }),
      )
      .optional(),
    scenes: z
      .array(
        z.object({
          location: z.string().optional(),
          time: z.string().optional(),
          description: z.string().optional(),
          startIndex: z.number().optional(),
          endIndex: z.number().optional(),
        }),
      )
      .optional(),
    dialogues: z
      .array(
        z.object({
          speakerId: z.string().optional(),
          text: z.string().optional(),
          emotion: z.string().optional(),
          index: z.number().optional(),
        }),
      )
      .optional(),
    highlights: z
      .array(
        z.object({
          type: z.string().optional(),
          description: z.string().optional(),
          importance: z.number().optional(),
          startIndex: z.number().optional(),
          endIndex: z.number().optional(),
        }),
      )
      .optional(),
    situations: z
      .array(
        z.object({
          description: z.string().optional(),
          index: z.number().optional(),
        }),
      )
      .optional(),
  })
  .strict()
  .or(z.record(z.any()))

// Script/PageBreak schemas (reuse from app types; lightweight copy here to avoid import issues)
const ScriptLineSchema = z.object({
  index: z.number().int().nonnegative(),
  type: z.string(),
  speaker: z.string().optional(),
  text: z.string(),
})
const ScriptSchema = z.object({ script: z.array(ScriptLineSchema) })
const PageBreakSchema = z.object({
  pages: z.array(
    z.object({
      pageNumber: z.number().int().min(1),
      startIndex: z.number().int().nonnegative(),
      endIndex: z.number().int().nonnegative(),
    }),
  ),
})

// chunk-bundle は既存の厳密スキーマがあるが、ここでは緩めに代表キーだけ
const ChunkBundleSchema = z
  .object({
    summary: z.string().optional(),
    mainCharacters: z
      .array(z.object({ name: z.string().optional(), role: z.string().optional() }))
      .optional(),
    highlights: z
      .array(
        z.object({
          text: z.string().optional(),
          type: z.string().optional(),
          importance: z.number().optional(),
        }),
      )
      .optional(),
    keyDialogues: z
      .array(
        z.object({
          speaker: z.string().optional(),
          text: z.string().optional(),
        }),
      )
      .optional(),
  })
  .strict()
  .or(z.record(z.any()))

type NamedResult = {
  name: string
  ok: boolean
  provider: string
  preview?: string
  jsonOk?: boolean
  error?: string
}

async function runTextAnalysis(): Promise<NamedResult> {
  const cfg = getTextAnalysisConfig()
  const prompt = cfg.userPromptTemplate
    .replace('{{chunkIndex}}', '1')
    .replace('{{chunkText}}', '「太郎は走った。花子は笑った。」という一文だけのチャンクです。')
    .replace('{{previousChunkSummary}}', '')
    .replace('{{nextChunkSummary}}', '')

  try {
    const agent = new CompatAgent({
      name: 'manual-text',
      instructions: cfg.systemPrompt,
      provider: cfg.provider,
      maxTokens: cfg.maxTokens,
    })
    const obj = await agent.generateObject({
      systemPrompt: cfg.systemPrompt,
      userPrompt: prompt,
      schema: TextAnalysisSchema,
      schemaName: 'TextAnalysis',
    })
    return {
      name: 'textAnalysis',
      ok: true,
      provider: cfg.provider,
      preview: JSON.stringify(obj).slice(0, 200),
      jsonOk: true,
    }
  } catch (e) {
    return {
      name: 'textAnalysis',
      ok: false,
      provider: cfg.provider,
      error: (e as Error).message,
    }
  }
}


// runPageBreakEstimation removed - replaced with importance-based calculation

async function main() {
  // プロバイダーの強制指定（任意）
  const provider = (process.env.PROVIDER || '').trim()
  if (provider) process.env.LLM_FORCE_PROVIDER = provider

  const results = [] as NamedResult[]
  results.push(await runTextAnalysis())
  // runPageBreakEstimation removed - replaced with importance-based calculation
  console.log(JSON.stringify({ results }, null, 2))
}

main().catch((e) => {
  console.error('Fatal:', e)
  process.exit(1)
})
