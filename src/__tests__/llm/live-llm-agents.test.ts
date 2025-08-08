import { Agent } from '@mastra/core'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { z } from 'zod'

// NOTE: These tests call real LLMs via OpenRouter. They are skipped automatically
// if OPENROUTER_API_KEY is not present to keep CI safe.

const shouldRun = Boolean(process.env.OPENROUTER_API_KEY)

// Keep executions fast and deterministic as much as possible
const TEST_TIMEOUT_MS = 30_000

// Small helper to create a tiny Agent from an LLM factory result
async function createAgentFromLLM(getter: () => Promise<{
  provider: ReturnType<any>
  providerName: string
  model: string
  systemPrompt?: string
}>): Promise<Agent> {
  const llm = await getter()
  // Build a minimal Agent that uses the same provider/model path as production
  return new Agent({
    name: `live-llm-${llm.providerName}`,
    instructions: () => llm.systemPrompt || 'You are a helpful assistant.',
    model: async () => llm.provider(llm.model),
  })
}

// Lazily import to honor any test-time mocks and avoid module init cost when skipped
const importChunkAgent = () => import('@/agents/chunk-analyzer').then((m) => m.chunkAnalyzerAgent)
const importLLMFactories = () => import('@/utils/llm-factory')

;(shouldRun ? describe : describe.skip)('Live LLM smoke tests (OpenRouter/Cerebras)', () => {
  beforeAll(() => {
    // Prefer OpenRouter in tests
    process.env.APP_LLM_DEFAULT_PROVIDER = 'openrouter'
    // Hint: You can accelerate bundle steps in other flows with this flag
    // but we keep agents fully live here.
    // process.env.N2M_MOCK_LLM = '1'
  })

  afterAll(() => {
    delete process.env.APP_LLM_DEFAULT_PROVIDER
  })

  it(
    'chunk analyzer agent can return a minimal summary (real LLM)',
    async () => {
      const agent = await importChunkAgent()

      // Ask for a tiny JSON output to reduce tokens/time
      const schema = z.object({ summary: z.string().min(1).max(80) })
      const text = '太郎は朝、学校へ向かった。途中で花を拾い、友人に見せて微笑んだ。'
      const prompt = `次の文章を1文で簡潔に要約し、JSONで返してください。\n文章: ${text}\n出力は厳密に {"summary":"..."} のみ。` as const

      const res = await agent.generate([{ role: 'user', content: prompt }], { output: schema })

      expect(res.object).toBeDefined()
      expect(typeof res.object.summary).toBe('string')
      expect(res.object.summary.length).toBeGreaterThan(0)
    },
    TEST_TIMEOUT_MS,
  )

  it(
    'narrative analysis path provider works via a tiny agent (real LLM)',
    async () => {
      const { getNarrativeAnalysisLLM } = await importLLMFactories()
      const tinyAgent = await createAgentFromLLM(getNarrativeAnalysisLLM)

      const schema = z.object({ ok: z.literal(true) })
      const prompt =
        '次の指示にのみ従い、厳密に {"ok": true} という最小JSONだけを返してください。他の出力は禁止。'

      const res = await tinyAgent.generate([{ role: 'user', content: prompt }], { output: schema })
      expect(res.object).toEqual({ ok: true })
    },
    TEST_TIMEOUT_MS,
  )
})

;(shouldRun ? describe.skip : describe)('Live LLM smoke tests (skipped: missing OPENROUTER_API_KEY)', () => {
  it('skips when OPENROUTER_API_KEY is not configured', () => {
    expect(process.env.OPENROUTER_API_KEY).toBeUndefined()
  })
})
