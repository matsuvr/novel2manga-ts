import type { z } from 'zod'
import { getLlmStructuredGenerator } from '@/agent/structured-generator'
import { getScriptConversionConfig } from '@/config'
import { type Script, ScriptSchema } from '@/types/script'

export async function convertEpisodeTextToScript(
  episodeText: string,
  _options?: { jobId?: string; episodeNumber?: number },
): Promise<Script> {
  const generator = getLlmStructuredGenerator()
  const cfg = getScriptConversionConfig()
  const prompt = (cfg.userPromptTemplate || 'Episode: {{episodeText}}').replace(
    '{{episodeText}}',
    episodeText,
  )
  const result = await generator.generateObjectWithFallback({
    name: 'script-conversion',
    systemPrompt: cfg.systemPrompt,
    userPrompt: prompt,
    schema: ScriptSchema as unknown as z.ZodTypeAny,
    schemaName: 'Script',
  })
  return result as Script
}
