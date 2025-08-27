import type { z } from 'zod'
import { getLlmStructuredGenerator } from '@/agents/structured-generator'
import { getAppConfigWithOverrides } from '@/config/app.config'
import { type PageBreakPlan, PageBreakSchema, type Script } from '@/types/script'

// 型ガード関数: ページオブジェクトかどうかを判定
function isPageObject(obj: unknown): obj is PageBreakPlan['pages'][0] {
  return (
    typeof obj === 'object' &&
    obj !== null &&
    'pageNumber' in obj &&
    typeof (obj as Record<string, unknown>).pageNumber === 'number'
  )
}

// 型ガード関数: ページ配列を含むオブジェクトかどうかを判定
function isPageContainerObject(obj: unknown): obj is { pages: unknown[] } {
  return (
    typeof obj === 'object' &&
    obj !== null &&
    'pages' in obj &&
    Array.isArray((obj as Record<string, unknown>).pages)
  )
}

// 結果を正規化する関数
function normalizePageBreakResult(result: unknown): PageBreakPlan {
  // 既に正しい形式の場合
  if (typeof result === 'object' && result !== null && 'pages' in result) {
    return result as PageBreakPlan
  }

  // 配列の場合
  if (Array.isArray(result)) {
    // Case 1: Simple array of pages
    if (result.length > 0 && isPageObject(result[0])) {
      return { pages: result as PageBreakPlan['pages'] }
    }

    // Case 2: Array of objects containing pages (e.g., [{"pages": [...]}])
    if (result.length > 0 && isPageContainerObject(result[0])) {
      // Concatenate all pages from all objects in the array (flatMap)
      const allPages: PageBreakPlan['pages'] = (result as unknown[]).flatMap((item) =>
        isPageContainerObject(item) ? item.pages.filter(isPageObject) : [],
      )
      // Re-number pages sequentially
      let pageNumber = 1
      for (const page of allPages) {
        page.pageNumber = pageNumber++
      }
      return { pages: allPages }
    }

    // Case 3: Fallback - treat as pages array
    return { pages: result.filter(isPageObject) }
  }

  // その他の場合は空のページ配列を返す
  return { pages: [] }
}

export async function estimatePageBreaks(
  script: Script,
  opts: { jobId?: string; episodeNumber?: number; isDemo?: boolean },
): Promise<PageBreakPlan> {
  // Demo mode: return fixed page break plan for testing
  if (opts?.isDemo || process.env.NODE_ENV === 'test') {
    return {
      pages: [
        {
          pageNumber: 1,
          panelCount: 3,
          panels: [
            {
              panelIndex: 1,
              content: script.scenes?.[0]?.script?.[0]?.text || 'デモコンテンツ',
              dialogue: [
                {
                  speaker: '太郎',
                  text: 'やってみよう！',
                },
              ],
            },
            {
              panelIndex: 2,
              content: script.scenes?.[0]?.script?.[1]?.text || '太郎のセリフ',
              dialogue: [
                {
                  speaker: '太郎',
                  text: script.scenes?.[0]?.script?.[1]?.text || '太郎のセリフ',
                },
              ],
            },
            {
              panelIndex: 3,
              content: script.scenes?.[0]?.script?.[2]?.text || 'アクションシーン',
              dialogue: [],
            },
          ],
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
  const result = await generator.generateObjectWithFallback({
    name: 'page-break-estimation',
    systemPrompt: cfg.systemPrompt,
    userPrompt: prompt,
    schema: PageBreakSchema as unknown as z.ZodTypeAny,
    schemaName: 'PageBreakPlan',
  })

  // Handle case where LLM returns an array instead of object
  return normalizePageBreakResult(result)
}
