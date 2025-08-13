import { NextResponse } from 'next/server'
import { z } from 'zod'
import { BaseAgent } from '@/agents/base-agent'
import { getTextAnalysisConfig } from '@/config'

const zBody = z.object({
  text: z.string().min(1),
  chunkIndex: z.number().int().nonnegative().default(0),
})

const textAnalysisOutputSchema = z.object({
  summary: z.string().default(''),
  characters: z
    .array(
      z.object({
        name: z.string(),
        description: z.string(),
        firstAppearance: z.number(),
      }),
    )
    .default([]),
  scenes: z
    .array(
      z.object({
        location: z.string(),
        time: z.string().optional(),
        description: z.string(),
        startIndex: z.number(),
        endIndex: z.number(),
      }),
    )
    .default([]),
  dialogues: z
    .array(
      z.object({
        speakerId: z.string(),
        text: z.string(),
        emotion: z.string().optional(),
        index: z.number(),
      }),
    )
    .default([]),
  highlights: z
    .array(
      z.object({
        type: z.enum(['climax', 'turning_point', 'emotional_peak', 'action_sequence']),
        description: z.string(),
        importance: z.number().min(1).max(10),
        startIndex: z.number(),
        endIndex: z.number(),
        text: z.string().optional(),
      }),
    )
    .default([]),
  situations: z
    .array(
      z.object({
        description: z.string(),
        index: z.number(),
      }),
    )
    .default([]),
})

async function runWithModel(modelId: string, prompt: string) {
  const config = getTextAnalysisConfig()
  const agent = new BaseAgent({
    name: `abtest-${modelId}`,
    instructions: config.systemPrompt,
    provider: 'groq',
    model: modelId,
    maxTokens: 8192,
  })

  try {
    const result = await agent.generateObject(
      [{ role: 'user', content: prompt }],
      textAnalysisOutputSchema,
      { maxRetries: 2 },
    )
    return { ok: true as const, model: modelId, object: result }
  } catch (error) {
    return {
      ok: false as const,
      model: modelId,
      error: error instanceof Error ? error.message : String(error),
    }
  }
}

export async function POST(req: Request) {
  try {
    const body = zBody.parse(await req.json())
    const cfg = getTextAnalysisConfig()
    const prompt = cfg.userPromptTemplate
      .replace('{{chunkIndex}}', String(body.chunkIndex))
      .replace('{{chunkText}}', body.text)
      .replace('{{previousChunkText}}', '')
      .replace('{{nextChunkText}}', '')

    const [gpt120b, llama70b] = await Promise.all([
      runWithModel('openai/gpt-oss-120b', prompt),
      runWithModel('llama-3.1-70b-versatile', prompt),
    ])

    return NextResponse.json({ ok: true, results: { gpt120b, llama70b } })
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ ok: false, issues: err.issues }, { status: 400 })
    }
    return NextResponse.json({ ok: false, error: (err as Error).message }, { status: 500 })
  }
}
