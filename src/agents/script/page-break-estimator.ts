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

/**
 * Normalizes LLM response to ensure consistent PageBreakPlan structure.
 *
 * The LLM can return page break data in various formats depending on the provider
 * and prompt interpretation. This function handles all known response patterns
 * and converts them to the standard PageBreakPlan format.
 *
 * @param result - Raw LLM response that may be in various formats
 * @returns Normalized PageBreakPlan with proper structure
 *
 * @example
 * // Handles already correct format: { pages: [...] }
 * // Handles simple array: [{ pageNumber: 1, ... }, { pageNumber: 2, ... }]
 * // Handles nested format: [{ pages: [...] }, { pages: [...] }]
 * // Handles mixed/malformed arrays with filtering
 * // Returns empty plan for unrecognized formats
 */
function normalizePageBreakResult(result: unknown): PageBreakPlan {
  // Case 1: Already in correct PageBreakPlan format { pages: [...] }
  if (typeof result === 'object' && result !== null && 'pages' in result) {
    return result as PageBreakPlan
  }

  // Case 2: Array responses - handle multiple sub-patterns
  if (Array.isArray(result)) {
    // Case 2a: Simple array of page objects [{ pageNumber: 1, ... }, ...]
    // This occurs when LLM returns pages directly as an array
    if (result.length > 0 && isPageObject(result[0])) {
      return { pages: result as PageBreakPlan['pages'] }
    }

    // Case 2b: Array of container objects [{ pages: [...] }, { pages: [...] }]
    // This occurs when LLM wraps pages in multiple container objects
    // We need to flatten and renumber to maintain sequential page numbering
    if (result.length > 0 && isPageContainerObject(result[0])) {
      // Extract and concatenate all pages from all container objects
      const allPages: PageBreakPlan['pages'] = (result as unknown[]).flatMap((item) =>
        isPageContainerObject(item) ? item.pages.filter(isPageObject) : [],
      )
      // Renumber pages sequentially starting from 1 (immutable update)
      // This ensures consistent page numbering even if source had gaps or duplicates
      const renumbered: PageBreakPlan['pages'] = allPages.map((page, idx) => ({
        ...page,
        pageNumber: idx + 1,
      }))
      return { pages: renumbered }
    }

    // Case 2c: Mixed/malformed array - filter valid page objects only
    // This occurs when LLM returns an array with mixed valid/invalid objects
    return { pages: result.filter(isPageObject) }
  }

  // Case 3: Unrecognized format - return empty plan to prevent crashes
  // This provides graceful degradation for unexpected LLM response formats
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
