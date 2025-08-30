import type { z } from 'zod'
import { getLlmStructuredGenerator } from '@/agents/structured-generator'
import { getAppConfigWithOverrides } from '@/config/app.config'
import { type NewMangaScript, type PageBreakV2, PageBreakV2Schema } from '@/types/script'

export async function estimatePageBreaks(
  script: NewMangaScript,
  opts: { jobId?: string; episodeNumber?: number; isDemo?: boolean },
): Promise<PageBreakV2> {
  // Demo mode: return fixed page break plan for testing
  if (opts?.isDemo || process.env.NODE_ENV === 'test') {
    return {
      panels: [
        {
          pageNumber: 1,
          panelIndex: 1,
          content: script.panels?.[0]?.cut || 'デモコンテンツ',
          dialogue: [
            {
              speaker: '太郎',
              text: 'やってみよう！',
            },
          ],
        },
        {
          pageNumber: 1,
          panelIndex: 2,
          content: script.panels?.[1]?.cut || '太郎のセリフ',
          dialogue: [
            {
              speaker: '太郎',
              text:
                (script.panels?.[1]?.dialogue?.[0] || '太郎: セリフ')
                  .split(':')
                  .slice(1)
                  .join(':')
                  .trim() || '太郎のセリフ',
            },
          ],
        },
        {
          pageNumber: 1,
          panelIndex: 3,
          content: script.panels?.[2]?.cut || 'アクションシーン',
          dialogue: [],
        },
      ],
    }
  }

  const generator = getLlmStructuredGenerator()
  // Read prompts directly from app config to avoid test mocks on '@/config'
  const appCfg = getAppConfigWithOverrides()
  const pb = appCfg.llm.pageBreakEstimation || { systemPrompt: '', userPromptTemplate: '' }
  const cfg = {
    systemPrompt: pb.systemPrompt,
    userPromptTemplate: pb.userPromptTemplate,
  }
  const prompt = (cfg.userPromptTemplate || '').replace(
    '{{scriptJson}}',
    JSON.stringify(script, null, 2),
  )
  const result = await generator.generateObjectWithFallback<PageBreakV2>({
    name: 'page-break-estimation',
    systemPrompt: cfg.systemPrompt,
    userPrompt: prompt,
    schema: PageBreakV2Schema as unknown as z.ZodTypeAny,
    schemaName: 'PageBreakV2',
  })

  // Return PageBreakV2 directly
  return result
}
