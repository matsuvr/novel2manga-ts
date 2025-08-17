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
import { CompatAgent } from '@/agent/compat'
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
  const allow: LLMProvider[] = ['openai', 'gemini', 'groq', 'openrouter', 'cerebras', 'fake']
  if (allow.includes(envP as LLMProvider)) return envP as LLMProvider
  // キー検出による自動選択（優先度: gemini -> openai -> groq -> openrouter -> cerebras）
  const has = (k: string) => (process.env[k] || '').trim().length > 0
  if (has('GEMINI_API_KEY') || has('GOOGLE_API_KEY')) return 'gemini'
  if (has('OPENAI_API_KEY')) return 'openai'
  if (has('GROQ_API_KEY')) return 'groq'
  if (has('OPENROUTER_API_KEY')) return 'openrouter'
  if (has('CEREBRAS_API_KEY')) return 'cerebras'
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
function getNarrativeAnalysisConfig(): SimplePromptConfig {
  const prompts = appConfig.llm.narrativeArcAnalysis
  const provider = resolveProvider()
  const providerConfig = getLLMProviderConfig(provider)
  return {
    provider,
    maxTokens: providerConfig.maxTokens,
    systemPrompt: prompts.systemPrompt,
    userPromptTemplate: prompts.userPromptTemplate,
  }
}
function getLayoutGenerationConfig(): SimplePromptConfig {
  const prompts = appConfig.llm.layoutGeneration
  const provider = resolveProvider()
  const providerConfig = getLLMProviderConfig(provider)
  return {
    provider,
    maxTokens: providerConfig.maxTokens,
    systemPrompt: prompts.systemPrompt,
    userPromptTemplate: prompts.userPromptTemplate,
  }
}
function getChunkBundleAnalysisConfig(): SimplePromptConfig {
  const prompts = appConfig.llm.chunkBundleAnalysis
  const provider = resolveProvider()
  const providerConfig = getLLMProviderConfig(provider)
  return {
    provider,
    maxTokens: providerConfig.maxTokens,
    systemPrompt: prompts.systemPrompt,
    userPromptTemplate: prompts.userPromptTemplate,
  }
}

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

const NarrativeArcSchema = z
  .object({
    episodes: z
      .array(
        z.object({
          id: z.string().optional(),
          title: z.string().optional(),
          summary: z.string().optional(),
          startChunkIndex: z.number().optional(),
          endChunkIndex: z.number().optional(),
          keyEvents: z.array(z.string()).optional(),
          characters: z.array(z.string()).optional(),
          mood: z.string().optional(),
          significance: z.string().optional(),
          boundaryConfidence: z.string().optional(),
        }),
      )
      .optional(),
    overallArc: z
      .object({
        theme: z.string().optional(),
        progression: z.string().optional(),
        climaxLocation: z.string().optional(),
      })
      .optional(),
  })
  .strict()
  .or(z.record(z.any()))

const LayoutPanelCountSchema = z.object({
  pages: z.array(
    z.object({
      pageNumber: z.number(),
      panelCount: z.number().int().min(1).max(6),
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
    .replace('{{previousChunkText}}', '')
    .replace('{{nextChunkText}}', '')

  try {
    const agent = new CompatAgent({
      name: 'manual-text',
      instructions: cfg.systemPrompt,
      provider: cfg.provider,
      maxTokens: cfg.maxTokens,
    })
    const obj = await agent.generateObject(TextAnalysisSchema, prompt)
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

async function runNarrativeArc(): Promise<NamedResult> {
  const cfg = getNarrativeAnalysisConfig()
  const prompt = cfg.userPromptTemplate
    .replace('{{totalChars}}', '12000')
    .replace('{{targetPages}}', '24')
    .replace('{{minPages}}', '15')
    .replace('{{maxPages}}', '30')
    .replace('{{characterList}}', '- 太郎\n- 花子')
    .replace('{{overallSummary}}', '少年は走り続け、やがて成長する。')
    .replace('{{highlightsInfo}}', '- ラストで告白')
    .replace('{{characterActions}}', '- 太郎は走る\n- 花子は笑う')
    .replace('{{fullText}}', '長文テキスト...')

  try {
    const agent = new CompatAgent({
      name: 'manual-narrative',
      instructions: cfg.systemPrompt,
      provider: cfg.provider,
      maxTokens: cfg.maxTokens,
    })
    const obj = await agent.generateObject(NarrativeArcSchema, prompt)
    return {
      name: 'narrativeArc',
      ok: true,
      provider: cfg.provider,
      preview: JSON.stringify(obj).slice(0, 200),
      jsonOk: true,
    }
  } catch (e) {
    return {
      name: 'narrativeArc',
      ok: false,
      provider: cfg.provider,
      error: (e as Error).message,
    }
  }
}

async function runLayoutGeneration(): Promise<NamedResult> {
  const cfg = getLayoutGenerationConfig()
  const prompt = cfg.userPromptTemplate.replace('{{episodeNumber}}', '1').replace(
    '{{layoutInputJson}}',
    JSON.stringify(
      {
        pages: [
          { pageNumber: 1, importance: 5 },
          { pageNumber: 2, importance: 3 },
        ],
      },
      null,
      2,
    ),
  )

  try {
    const agent = new CompatAgent({
      name: 'manual-layout',
      instructions: cfg.systemPrompt,
      provider: cfg.provider,
      maxTokens: cfg.maxTokens,
    })
    const obj = await agent.generateObject(LayoutPanelCountSchema, prompt)
    return {
      name: 'layoutGeneration',
      ok: true,
      provider: cfg.provider,
      preview: JSON.stringify(obj).slice(0, 200),
      jsonOk: true,
    }
  } catch (e) {
    return {
      name: 'layoutGeneration',
      ok: false,
      provider: cfg.provider,
      error: (e as Error).message,
    }
  }
}

async function runChunkBundle(): Promise<NamedResult> {
  const cfg = getChunkBundleAnalysisConfig()
  const prompt = cfg.userPromptTemplate
    .replace('{{characterList}}', '- 太郎 (登場回数: 3)')
    .replace('{{sceneList}}', '- 学校の屋上')
    .replace('{{dialogueList}}', '- 太郎: 「走れ！」')
    .replace('{{highlightList}}', '- [climax] 告白シーン (重要度: 9)')
    .replace('{{situationList}}', '- 雨が降っている')

  try {
    const agent = new CompatAgent({
      name: 'manual-bundle',
      instructions: cfg.systemPrompt,
      provider: cfg.provider,
      maxTokens: cfg.maxTokens,
    })
    const obj = await agent.generateObject(ChunkBundleSchema, prompt)
    return {
      name: 'chunkBundle',
      ok: true,
      provider: cfg.provider,
      preview: JSON.stringify(obj).slice(0, 200),
      jsonOk: true,
    }
  } catch (e) {
    return {
      name: 'chunkBundle',
      ok: false,
      provider: cfg.provider,
      error: (e as Error).message,
    }
  }
}

async function main() {
  // プロバイダーの強制指定（任意）
  const provider = (process.env.PROVIDER || '').trim()
  if (provider) process.env.LLM_FORCE_PROVIDER = provider

  const results = [] as NamedResult[]
  results.push(await runTextAnalysis())
  results.push(await runNarrativeArc())
  results.push(await runLayoutGeneration())
  results.push(await runChunkBundle())
  console.log(JSON.stringify({ results }, null, 2))
}

main().catch((e) => {
  console.error('Fatal:', e)
  process.exit(1)
})
