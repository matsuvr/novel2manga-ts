import { Effect } from 'effect'
import { z } from 'zod'
import { DefaultLlmStructuredGenerator } from '@/agents/structured-generator'
import { getAppConfigWithOverrides } from '@/config/app.config'
import { getLogger } from '@/infrastructure/logging/logger'
import { BranchType } from '@/types/branch'

export interface ExpandPreprocessInput {
  rawInput: string
  shortReason: string
  targetScenarioChars?: number
  jobId?: string
}

export interface ExpandPreprocessResult {
  expandedText: string
  notes: string[]
}

// LLM 出力期待値スキーマ
// expandedText: 一定以上の長さの拡張結果
// notes: 追加のメモ (任意) – 空配列可
export const ExpandPreprocessResultSchema = z
  .object({
    expandedText: z.string().min(50, 'expandedText must be >= 50 chars'),
    notes: z.array(z.string()).min(0),
  })
  .strict()
export type ExpandPreprocessResultSchemaType = z.infer<typeof ExpandPreprocessResultSchema>

export class ExpandPreprocessError extends Error {
  constructor(message: string, readonly cause?: unknown) {
    super(message)
    this.name = 'ExpandPreprocessError'
  }
}

// 簡易バリデーション: 既に十分長い入力を誤って通さない
function ensureShort(raw: string, threshold: number) {
  if (raw.trim().length >= threshold) {
    throw new ExpandPreprocessError(
      `Input length (${raw.trim().length}) exceeds expansion threshold (${threshold}).`,
    )
  }
}

export async function runExpandPreprocess(
  input: ExpandPreprocessInput,
): Promise<ExpandPreprocessResult> {
  const config = getAppConfigWithOverrides()
  if (!config.expansion.enabled) {
    throw new ExpandPreprocessError('Expansion feature disabled (config.expansion.enabled=false)')
  }
  type ExpandPromptBlock = { systemPrompt: string; userPromptTemplate: string }
  const promptCfg = (config.llm as Record<string, unknown>).expandPreprocess as
    | ExpandPromptBlock
    | undefined
  if (!promptCfg?.systemPrompt || !promptCfg?.userPromptTemplate) {
    throw new ExpandPreprocessError('expandPreprocess prompts missing in app.config.ts')
  }

  interface ExpansionConfigShape {
    enabled: boolean
    targetScenarioChars: number
    shortInputTriggerRatio?: number
    minShortInputChars?: number
  }
  const expCfg: ExpansionConfigShape = config.expansion as ExpansionConfigShape
  const target = input.targetScenarioChars ?? expCfg.targetScenarioChars
  const ratio = typeof expCfg.shortInputTriggerRatio === 'number' ? expCfg.shortInputTriggerRatio : 0.6
  const floor = typeof expCfg.minShortInputChars === 'number' ? expCfg.minShortInputChars : 400
  // 閾値: floor と target*ratio の大きい方を採用し、「十分長い」と判断できる境界を安定化
  const dynamicThreshold = Math.max(floor, Math.floor(target * ratio))
  ensureShort(input.rawInput, dynamicThreshold)

  const replacements: Record<string, string> = {
    rawInput: input.rawInput.trim(),
    shortReason: input.shortReason.trim(),
    targetScenarioChars: String(target),
  }

  const apply = (tpl: string) =>
    Object.entries(replacements).reduce(
      (acc, [k, v]) => acc.replaceAll(`{{${k}}}`, v),
      tpl,
    )

  const systemPrompt = apply(promptCfg.systemPrompt)
  const userPrompt = apply(promptCfg.userPromptTemplate)

  const logger = getLogger().withContext({ agent: 'expand-preprocess', jobId: input.jobId })
  logger.info('Starting expand preprocess', { length: input.rawInput.length, target, dynamicThreshold, ratio, floor })

  const generator = new DefaultLlmStructuredGenerator(['vertexai']) // reuse provider chain; override if needed

  // structured-generator で汎用 JSON 取り扱いが無い前提: 生テキスト取得 API があれば置換。ここでは簡易に object fallback を再利用しつつ手動パース想定。
  // Fallback: structuredオブジェクト生成APIがあれば利用し、string を抽出
  const validated = await Effect.runPromise(
    Effect.tryPromise({
      try: async () => {
        const result = await generator.generateObjectWithFallback<ExpandPreprocessResultSchemaType>({
          name: 'expand-preprocess',
          systemPrompt,
          userPrompt,
          schema: ExpandPreprocessResultSchema,
          schemaName: 'ExpandPreprocessResult',
          telemetry: { jobId: input.jobId, stepName: 'expandPreprocess' },
        })
        return result
      },
      catch: (cause) => new ExpandPreprocessError('LLM call failed', cause),
    }),
  )

  logger.info('Expand preprocess completed', {
    expandedLength: validated.expandedText.length,
    notes: validated.notes.length,
    branch: BranchType.EXPAND,
  })
  return { expandedText: validated.expandedText, notes: validated.notes }
}
