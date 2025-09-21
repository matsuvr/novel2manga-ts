import { getLlmStructuredGenerator } from '@/agents/structured-generator'
import { getAppConfigWithOverrides } from '@/config/app.config'
import {
  buildNarrativityJudgeUser,
  NARRATIVITY_JUDGE_SYSTEM,
} from '@/prompts/narrativityJudge.prompt'
import type { ValidationOutcome } from '@/types/validation'
import { NarrativeJudgeSchema } from '@/types/validation'
import type { StepContext, StepExecutionResult } from './base-step'
import { BasePipelineStep } from './base-step'

export class InputValidationStep extends BasePipelineStep {
  readonly stepName = 'input-validation'

  async validate(
    text: string,
    context: StepContext,
  ): Promise<StepExecutionResult<ValidationOutcome>> {
    const { logger } = context
    const cfg = getAppConfigWithOverrides()
    const { minInputChars, narrativeJudgeEnabled } = cfg.validation

    if (text.length < minInputChars) {
      logger.info('Input too short', { jobId: context.jobId, length: text.length })
      return this.createSuccess({ status: 'SHORT', consentRequired: 'EXPAND' })
    }

    if (!narrativeJudgeEnabled) {
      return this.createSuccess({ status: 'OK' })
    }

    try {
      const generator = getLlmStructuredGenerator()
      const judge = (await generator.generateObjectWithFallback({
        name: 'narrativity-judge',
        systemPrompt: NARRATIVITY_JUDGE_SYSTEM,
        userPrompt: buildNarrativityJudgeUser(text),
        schema: NarrativeJudgeSchema,
        schemaName: 'NarrativeJudge',
      })) as unknown as import('@/types/validation').NarrativeJudgeResult

      const isNarrative =
        judge.isNarrative && ['novel', 'short_story', 'play', 'rakugo'].includes(judge.kind)
      if (isNarrative) {
        return this.createSuccess({ status: 'OK', judge })
      }
      return this.createSuccess({
        status: 'NON_NARRATIVE',
        consentRequired: 'EXPLAINER',
        judge,
      })
    } catch (error) {
      this.logStructuredError(context, 'narrativity-judge', error)
      const message = error instanceof Error ? error.message : String(error)
      // Return an error result so callers can detect LLM failures and mark the job failed
      return this.createError(message)
    }
  }
}
