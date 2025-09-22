import { getLlmStructuredGenerator } from '@/agents/structured-generator'
import {
  buildNarrativityJudgeUser,
  buildNarrativityJudgeUserLite,getAppConfigWithOverrides,
  NARRATIVITY_JUDGE_SYSTEM,
  NARRATIVITY_JUDGE_SYSTEM_LITE,} from '@/config/app.config'
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
      const useLite = cfg.validation.model === 'vertexai_lite'
      let judge: import('@/types/validation').NarrativeJudgeResult
      try {
            judge = await generator.generateObjectWithFallback<import('@/types/validation').NarrativeJudgeResult>({
              name: 'narrativity-judge-lite',
              systemPrompt: useLite ? NARRATIVITY_JUDGE_SYSTEM_LITE : NARRATIVITY_JUDGE_SYSTEM,
              userPrompt: useLite ? buildNarrativityJudgeUserLite(text) : buildNarrativityJudgeUser(text),
              schema: NarrativeJudgeSchema,
              schemaName: 'NarrativeJudge',
              telemetry: {
                jobId: context.jobId,
                stepName: 'narrativity-judge',
              },
            })
      } catch (liteError) {
        // Fallback: try full model prompt if lite was selected
        if (useLite) {
          logger.warn('Lite narrativity judge failed, falling back to full prompt', {
            error: liteError instanceof Error ? liteError.message : String(liteError),
          })
              judge = await generator.generateObjectWithFallback<import('@/types/validation').NarrativeJudgeResult>({
                name: 'narrativity-judge',
                systemPrompt: NARRATIVITY_JUDGE_SYSTEM,
                userPrompt: buildNarrativityJudgeUser(text),
                schema: NarrativeJudgeSchema,
                schemaName: 'NarrativeJudge',
                telemetry: {
                  jobId: context.jobId,
                  stepName: 'narrativity-judge',
                },
              })
        } else {
          throw liteError
        }
      }

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
