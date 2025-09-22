import { z } from 'zod'
import { DefaultLlmStructuredGenerator } from '@/agents/structured-generator'
import { getAppConfigWithOverrides } from '@/config/app.config'
import { getLogger } from '@/infrastructure/logging/logger'
import { BranchType } from '@/types/branch'

export interface NarrativityClassification {
  branch: BranchType
  reason: string
  metrics: {
    length: number
  }
  source: 'llm' | 'fallback'
}

// LLM 出力スキーマ
const NarrativityClassificationSchema = z.object({
  branch: z.enum(['EXPAND', 'EXPLAINER', 'NORMAL']),
  reason: z.string().min(1).max(800),
})

/**
 * LLM ベースの物語性 / 目的別ブランチ判定。
 * ヒューリスティックは禁止: 長さや記号密度で直接分岐せず、説明は LLM へ指示し判断させる。
 * 失敗時のみフォールバック (同一ロジック内での簡易長さ判定) を使用。
 */
export interface ClassifyNarrativityOptions {
  jobId?: string
}

export async function classifyNarrativity(
  raw: string,
  options: ClassifyNarrativityOptions = {},
): Promise<NarrativityClassification> {
  const logger = getLogger().withContext({ service: 'narrativity-classifier' })
  const cfg = getAppConfigWithOverrides()
  const text = raw.trim()
  const length = text.length

  // LLM への指示: EXPAND / EXPLAINER / NORMAL のいずれかを厳密 JSON で返す。
  const expansionTarget = cfg.expansion.targetScenarioChars
  const prompts = cfg.llm?.narrativityClassification
  if (!prompts?.systemPrompt || !prompts?.userPromptTemplate) {
    throw new Error('Missing narrativityClassification prompts in appConfig.llm')
  }
  const systemPrompt = prompts.systemPrompt
  const userPrompt = prompts.userPromptTemplate
    .replace('{{length}}', String(length))
    .replace('{{expansionTarget}}', String(expansionTarget))
    .replace('{{text}}', text)

  try {
    const generator = new DefaultLlmStructuredGenerator() // 既存プロバイダ順序を利用
    const result = await generator.generateObjectWithFallback({
      name: 'narrativity-classification',
      systemPrompt,
      userPrompt,
      schema: NarrativityClassificationSchema,
      schemaName: 'NarrativityClassification',
      telemetry: { stepName: 'narrativityClassification', jobId: options.jobId },
    })

    const branch = BranchType[result.branch as keyof typeof BranchType]
    if (!branch) {
      throw new Error(`Invalid branch from LLM: ${result.branch}`)
    }
    return {
      branch,
      reason: result.reason,
      metrics: { length },
      source: 'llm',
    }
  } catch (e) {
    // フォールバック: 最低限の安全策 (短すぎる場合のみ EXPAND、それ以外 NORMAL)
    const target = cfg.expansion.targetScenarioChars
    const ratio = cfg.expansion.shortInputTriggerRatio ?? 0.6
    const floor = cfg.expansion.minShortInputChars ?? 400
    const dynamicThreshold = Math.max(floor, Math.floor(target * ratio))
    const branch = length < dynamicThreshold ? BranchType.EXPAND : BranchType.NORMAL
    logger.warn('LLM narrativity classification failed, using fallback', {
      error: e instanceof Error ? e.message : String(e),
      length,
      dynamicThreshold,
      fallbackBranch: branch,
    })
    return {
      branch,
      reason: 'fallback due to LLM classification error',
      metrics: { length },
      source: 'fallback',
    }
  }
}
