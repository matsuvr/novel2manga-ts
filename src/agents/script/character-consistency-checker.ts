import { z } from 'zod'
import { DefaultLlmStructuredGenerator } from '@/agents/structured-generator'
import { getAppConfigWithOverrides } from '@/config/app.config'
import { getProviderForUseCase } from '@/config/llm.config'
import type { NewMangaScript } from '@/types/script'

// Schema for consistency check result
const CharacterConsistencyResultSchema = z.object({
  isConsistent: z.boolean(),
  issues: z.array(
    z.object({
      type: z.enum([
        'name_inconsistency',
        'personality_inconsistency',
        'relationship_inconsistency',
        'premature_appearance',
        'action_contradiction',
      ]),
      characterId: z.string(),
      description: z.string(),
      suggestion: z.string(),
    }),
  ),
  score: z.number(),
})

export type CharacterConsistencyResult = z.infer<typeof CharacterConsistencyResultSchema>

/**
 * Check character consistency in generated script
 */
export async function checkCharacterConsistency(
  characterMemory: string,
  scriptJson: string,
  chunkIndex: number,
  options?: { jobId?: string },
): Promise<CharacterConsistencyResult | null> {
  try {
    const appCfg = getAppConfigWithOverrides()

    // Get character consistency check prompts from config
    const ccConfig = appCfg.llm.characterConsistency
    if (!ccConfig) {
      console.warn('Character consistency configuration not found in app.config.ts')
      return null
    }

    const systemPrompt = ccConfig.systemPrompt
    const userPromptTemplate = ccConfig.userPromptTemplate

    const userPrompt = userPromptTemplate
      .replace('{{chunkIndex}}', chunkIndex.toString())
      .replace('{{characterMemory}}', characterMemory)
      .replace('{{scriptJson}}', scriptJson)

    // Get LLM provider for character consistency check from config
    const provider = getProviderForUseCase('characterConsistency')
    const generator = new DefaultLlmStructuredGenerator([provider])

    const result = await generator.generateObjectWithFallback<CharacterConsistencyResult>({
      name: 'character-consistency-check',
      systemPrompt,
      userPrompt,
      schema: CharacterConsistencyResultSchema as unknown as z.ZodTypeAny,
      schemaName: 'CharacterConsistencyResult',
      telemetry: {
        jobId: options?.jobId,
        chunkIndex,
        stepName: 'character-consistency',
      },
    })

    if (result && typeof result === 'object') {
      const validatedResult = CharacterConsistencyResultSchema.safeParse(result)
      if (validatedResult.success) {
        return validatedResult.data
      }
    }

    return null
  } catch (error) {
    console.error('Character consistency check failed:', error)
    return null
  }
}

/**
 * Applies consistency suggestions to a manga script.
 * // TODO: This is a placeholder implementation. It currently does not modify the script.
 * @param script The manga script to modify.
 * @param consistencyResult The consistency check result containing suggestions.
 * @returns The modified manga script.
 */
export function applyConsistencySuggestions(
  script: NewMangaScript,
  _consistencyResult: CharacterConsistencyResult,
): NewMangaScript {
  // Currently, this function does not apply any changes.
  // It returns the original script.
  // A full implementation would require parsing the suggestions and applying them to the script object.
  console.warn('applyConsistencySuggestions is a placeholder and does not apply any fixes.')
  return script
}
