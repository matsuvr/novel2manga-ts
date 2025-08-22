import type { z } from 'zod'
import { getLlmStructuredGenerator } from '@/agent/structured-generator'
import { getAppConfigWithOverrides } from '@/config/app.config'
import { type Script, ScriptSchema } from '@/types/script'

export interface ScriptConversionInput {
  episodeText: string
  characterList?: string
  sceneList?: string
  dialogueList?: string
  highlightList?: string
  situationList?: string
}

export async function convertEpisodeTextToScript(
  input: ScriptConversionInput,
  _options?: { jobId?: string; episodeNumber?: number },
): Promise<Script> {
  if (!input.episodeText || input.episodeText.trim() === '') {
    throw new Error('Episode text is required and cannot be empty')
  }

  const generator = getLlmStructuredGenerator()
  // Read prompts directly from app config to avoid test mocks on '@/config'
  const appCfg = getAppConfigWithOverrides()
  const sc = appCfg.llm.scriptConversion || { systemPrompt: '', userPromptTemplate: '' }
  const cfg = {
    systemPrompt: sc.systemPrompt,
    userPromptTemplate: sc.userPromptTemplate,
  }
  const prompt = (cfg.userPromptTemplate || 'Episode: {{episodeText}}')
    .replace('{{episodeText}}', input.episodeText)
    .replace('{{characterList}}', input.characterList || 'なし')
    .replace('{{sceneList}}', input.sceneList || 'なし')
    .replace('{{dialogueList}}', input.dialogueList || 'なし')
    .replace('{{highlightList}}', input.highlightList || 'なし')
    .replace('{{situationList}}', input.situationList || 'なし')
  const result = await generator.generateObjectWithFallback({
    name: 'script-conversion',
    systemPrompt: cfg.systemPrompt,
    userPrompt: prompt,
    schema: ScriptSchema as unknown as z.ZodTypeAny,
    schemaName: 'Script',
  })
  return result as Script
}
