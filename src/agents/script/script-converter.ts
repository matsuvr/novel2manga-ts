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

export interface ScriptConversionOptions {
  jobId?: string
  episodeNumber?: number
  isDemo?: boolean
  useFragmentConversion?: boolean
  fragmentSize?: number
  overlapSize?: number
  maxConcurrentFragments?: number
}

export async function convertEpisodeTextToScript(
  input: ScriptConversionInput,
  options?: ScriptConversionOptions,
): Promise<Script> {
  if (!input.episodeText || input.episodeText.trim() === '') {
    throw new Error('Episode text is required and cannot be empty')
  }

  // フラグメント変換を使用する場合
  if (options?.useFragmentConversion && input.episodeText.length > 4000) {
    const { convertEpisodeTextToScriptWithFragments } = await import('./fragment-script-converter')
    return convertEpisodeTextToScriptWithFragments(input, {
      jobId: options.jobId,
      episodeNumber: options.episodeNumber,
      isDemo: options.isDemo,
      fragmentSize: options.fragmentSize,
      overlapSize: options.overlapSize,
      maxConcurrentFragments: options.maxConcurrentFragments,
    })
  }

  // Demo mode: return fixed script structure for testing
  if (options?.isDemo || process.env.NODE_ENV === 'test') {
    return {
      title: `Demo Episode ${options?.episodeNumber || 1}`,
      scenes: [
        {
          setting: '公園、昼間、晴れ',
          script: [
            {
              type: 'narration',
              text: `${input.episodeText.substring(0, Math.min(50, input.episodeText.length))}...`,
            },
            {
              type: 'dialogue',
              speaker: '太郎',
              text: 'やってみよう！',
            },
            {
              type: 'stage',
              text: '太郎が決意を固める。',
            },
          ],
        },
      ],
    }
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
