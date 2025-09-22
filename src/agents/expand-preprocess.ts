import { Effect } from 'effect'
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
  const rawTextResult = await Effect.runPromise(
    Effect.tryPromise({
      try: async () => {
        // generateObjectWithFallback を利用し、自由形式テキスト JSON を期待
        const result = await generator.generateObjectWithFallback<{ raw: string }>({
          name: 'expand-preprocess',
          systemPrompt,
          userPrompt,
          // 緩いスキーマ: 最低限 raw 文字列のみ (実際のプロンプトは JSON 全体を出す)
          schema: undefined as unknown as import('zod').ZodTypeAny, // 既存 infra 互換のため型アサート
          schemaName: 'ExpandPreprocessRaw',
          telemetry: { jobId: input.jobId, stepName: 'expandPreprocess' },
        })
        // 期待フォーマットは本来 JSON 文字列。result.raw が無い場合はエラー
        if (!result || typeof (result as unknown) !== 'object') {
          throw new Error('Empty expand preprocess result')
        }
        // result は仮の構造なので JSON 文字列本体を持っていると仮定 (最終的に generateTextWithFallback 実装後に置換)
        const serialized = JSON.stringify(result)
        return serialized
      },
      catch: (cause) => new ExpandPreprocessError('LLM call failed', cause),
    }),
  )

  const rawText: string = typeof rawTextResult === 'string' ? rawTextResult : JSON.stringify(rawTextResult)

  let parsed: unknown
  try {
    parsed = JSON.parse(rawText)
  } catch (e) {
    throw new ExpandPreprocessError('Returned text was not valid JSON', e)
  }
  if (!parsed || typeof parsed !== 'object') {
    throw new ExpandPreprocessError('Parsed result is not an object')
  }
  const expandedText = (parsed as { expandedText?: unknown }).expandedText
  const notesValue = (parsed as { notes?: unknown }).notes
  const notes = Array.isArray(notesValue) ? notesValue.filter((n): n is string => typeof n === 'string') : []
  if (typeof expandedText !== 'string' || expandedText.trim().length < 50) {
    throw new ExpandPreprocessError('Expanded text too short or missing')
  }
  logger.info('Expand preprocess completed', {
    expandedLength: expandedText.length,
    notes: notes.length,
    branch: BranchType.EXPAND,
  })
  return { expandedText, notes }
}
