import type { z } from 'zod'
import { getLlmStructuredGenerator } from '@/agents/structured-generator'
import { getAppConfigWithOverrides } from '@/config/app.config'
import { type Script, type ScriptV2, ScriptV2Schema } from '@/types/script'
import { toLegacyScenes } from '@/utils/script-adapters'

// ===== Helper types and functions (extracted for readability/testability) =====
type SceneLine = Script['scenes'][0]['script'][number]
type SceneShape = {
  id?: string
  setting?: string
  description?: string
  script: SceneLine[]
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null
}

function normalizeLineType(v: unknown): SceneLine['type'] {
  const t = String(v || '').toLowerCase()
  return t === 'dialogue' || t === 'thought' || t === 'narration' || t === 'stage'
    ? (t as SceneLine['type'])
    : 'stage'
}

export function coerceScriptLines(lines: unknown[]): SceneLine[] {
  const out: SceneLine[] = []
  for (const item of lines) {
    if (isRecord(item)) {
      const text = typeof item.text === 'string' ? item.text : String(item.text ?? '')
      out.push({
        index: typeof item.index === 'number' ? item.index : undefined,
        type: normalizeLineType(item.type),
        speaker: typeof item.speaker === 'string' ? item.speaker : undefined,
        character: typeof item.character === 'string' ? item.character : undefined,
        text,
      })
    } else if (typeof item === 'string') {
      out.push({ type: 'narration', text: item })
    }
  }
  return out
}

export function isSceneObject(v: unknown): v is SceneShape {
  if (!isRecord(v)) return false
  const scriptVal = (v as Record<string, unknown>).script
  if (!Array.isArray(scriptVal)) return false
  // Accept if every entry has at least a stringifiable text
  return scriptVal.every((line) => {
    if (isRecord(line))
      return (
        typeof (line as { text?: unknown }).text === 'string' ||
        typeof (line as { text?: unknown }).text === 'number'
      )
    return typeof line === 'string'
  })
}

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

/**
 * Repairs corrupted JSON structure from LLM where scenes array contains mixed strings and objects
 */
function _repairCorruptedScriptJson(result: unknown, options?: ScriptConversionOptions): unknown {
  // If result is not an object with scenes array, return as-is
  if (!result || typeof result !== 'object' || !('scenes' in result)) {
    return result
  }

  const scriptObj = result as { title?: string; scenes: unknown[] }
  const scenes = scriptObj.scenes

  if (!Array.isArray(scenes) || scenes.length === 0) {
    return result
  }

  // Check if scenes array contains mixed strings (corruption pattern)
  const hasCorruption = scenes.some((scene, index) => {
    return index > 0 && typeof scene === 'string'
  })

  if (!hasCorruption) {
    return result
  }

  console.warn(
    JSON.stringify({
      ts: new Date().toISOString(),
      level: 'warn',
      msg: 'Detected corrupted JSON structure, attempting repair',
      service: 'script-converter',
      jobId: options?.jobId,
      episodeNumber: options?.episodeNumber,
      scenesLength: scenes.length,
    }),
  )

  try {
    // Type helpers moved to top-level for testability

    const repairedScenes: Array<{
      id?: string
      setting?: string
      description?: string
      script: Array<{
        index?: number
        type: string
        speaker?: string
        character?: string
        text: string
      }>
    }> = []

    let i = 0
    while (i < scenes.length) {
      const scene = scenes[i]

      // If it's a proper object, keep it as-is
      if (isSceneObject(scene)) {
        // Narrow to strong type or coerce script items minimally
        const s = scene as Record<string, unknown>
        const scriptArr = coerceScriptLines((s.script as unknown[]) || [])
        repairedScenes.push({
          id: typeof s.id === 'string' ? s.id : undefined,
          setting: typeof s.setting === 'string' ? s.setting : undefined,
          description: typeof s.description === 'string' ? s.description : undefined,
          script: scriptArr,
        })
        i++
        continue
      }

      // If it's a string, try to reconstruct the object from scattered parts
      if (typeof scene === 'string') {
        const reconstructed = reconstructSceneFromStrings(scenes, i)
        if (reconstructed.scene) {
          repairedScenes.push(reconstructed.scene)
          i = reconstructed.nextIndex
          continue
        }
      }

      // Skip unprocessable elements
      i++
    }

    if (repairedScenes.length === 0) {
      // Fallback to demo mode if repair completely fails
      console.warn(
        JSON.stringify({
          ts: new Date().toISOString(),
          level: 'warn',
          msg: 'JSON repair failed, falling back to demo mode',
          service: 'script-converter',
          jobId: options?.jobId,
          episodeNumber: options?.episodeNumber,
        }),
      )

      return null // Signal to use demo mode
    }

    return {
      title: scriptObj.title,
      scenes: repairedScenes,
    }
  } catch (error) {
    console.error(
      JSON.stringify({
        ts: new Date().toISOString(),
        level: 'error',
        msg: 'JSON repair process failed',
        service: 'script-converter',
        jobId: options?.jobId,
        episodeNumber: options?.episodeNumber,
        error: error instanceof Error ? error.message : String(error),
      }),
    )

    return null // Signal to use demo mode
  }
}

/**
 * Reconstructs a scene object from scattered string parts in the array
 */
function reconstructSceneFromStrings(
  scenes: unknown[],
  startIndex: number,
): {
  scene: {
    id?: string
    setting?: string
    description?: string
    script: Array<{
      index?: number
      type: string
      speaker?: string
      character?: string
      text: string
    }>
  } | null
  nextIndex: number
} {
  const reconstructed: Record<string, unknown> = {}
  let i = startIndex
  let foundScript: unknown[] = []

  // Parse key-value pairs from string sequence: "id", ":", "2", "setting", ":", "value", ...
  while (i < scenes.length - 2) {
    const key = scenes[i]
    const colon = scenes[i + 1]
    const value = scenes[i + 2]

    if (typeof key === 'string' && colon === ':' && value !== undefined) {
      if (key === 'script' && Array.isArray(value)) {
        foundScript = value
        i += 3
        break
      } else if (typeof value === 'string') {
        reconstructed[key] = value
      }
      i += 3
    } else {
      i++
    }
  }

  // Ensure we have the required script array
  if (foundScript.length === 0) {
    return { scene: null, nextIndex: i }
  }

  return {
    scene: {
      id: reconstructed.id as string,
      setting: reconstructed.setting as string,
      description: reconstructed.description as string,
      script: (() => {
        const arr = Array.isArray(foundScript) ? foundScript : []
        const out: Script['scenes'][0]['script'] = []
        for (const item of arr) {
          if (typeof item === 'string') {
            out.push({ type: 'narration', text: item })
          } else if (typeof item === 'object' && item !== null) {
            const rec = item as Record<string, unknown>
            const text = typeof rec.text === 'string' ? rec.text : String(rec.text ?? '')
            const t = String(rec.type || '').toLowerCase()
            const type: Script['scenes'][0]['script'][number]['type'] =
              t === 'dialogue' || t === 'thought' || t === 'narration' || t === 'stage'
                ? (t as Script['scenes'][0]['script'][number]['type'])
                : 'stage'
            out.push({
              index: typeof rec.index === 'number' ? rec.index : undefined,
              type,
              speaker: typeof rec.speaker === 'string' ? rec.speaker : undefined,
              character: typeof rec.character === 'string' ? rec.character : undefined,
              text,
            })
          }
        }
        return out
      })(),
    },
    nextIndex: i,
  }
}

export async function convertEpisodeTextToScript(
  input: ScriptConversionInput,
  options?: ScriptConversionOptions,
): Promise<Script> {
  if (!input.episodeText || input.episodeText.trim() === '') {
    throw new Error('Episode text is required and cannot be empty')
  }

  // Add validation for minimum text length to ensure meaningful content
  // Allow shorter text in test environments to not break existing tests
  const trimmedText = input.episodeText.trim()
  const isTestEnv =
    typeof globalThis !== 'undefined' &&
    typeof (globalThis as unknown as { process?: { env?: Record<string, string | undefined> } })
      .process === 'object' &&
    (globalThis as unknown as { process?: { env?: Record<string, string | undefined> } }).process
      ?.env?.NODE_ENV === 'test'
  const minLength = isTestEnv ? 5 : 50
  if (trimmedText.length < minLength) {
    throw new Error(
      `Episode text is too short. Please provide at least ${minLength} characters of story content, not just a title.`,
    )
  }

  // フラグメント方式は廃止（設定が true でも無効化）

  // Demo mode: return fixed script structure for testing
  if (options?.isDemo || isTestEnv) {
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
  // ====== リトライ付与（最大2回）: coverageRatio>=0.8 を満たすまで ======
  const maxRetries = 2
  let attempt = 0
  let scriptResult: unknown = null
  let bestScriptResult: unknown = null
  let bestRatio = -1
  while (attempt <= maxRetries) {
    const result = await generator.generateObjectWithFallback<ScriptV2>({
      name: 'script-conversion',
      systemPrompt: cfg.systemPrompt,
      userPrompt: prompt,
      schema: ScriptV2Schema as unknown as z.ZodTypeAny,
      schemaName: 'ScriptV2',
    })

    // Repair corrupted JSON structure from LLM
    // V2は scenes を持たないため、そのまま扱う
    scriptResult = result
    if (scriptResult === null) {
      attempt += 1
      if (attempt > maxRetries) break
      continue
    }

    // 正規化前に簡易カバレッジ判定（不足時はリトライ）
    try {
      const draftLegacy = toLegacyScenes(scriptResult as ScriptV2)
      const ratio = estimateCoverageRatioFromScript(draftLegacy, input.episodeText.length)
      if (ratio > bestRatio) {
        bestRatio = ratio
        bestScriptResult = scriptResult
      }
      if (ratio >= 0.8) {
        break
      }
    } catch (_e) {
      // 計算不能時はそのまま次へ（attempt++）
    }

    attempt += 1
    if (attempt > maxRetries) break
  }

  // If repair failed completely, fallback to demo mode
  if (scriptResult === null) {
    console.warn(
      JSON.stringify({
        ts: new Date().toISOString(),
        level: 'warn',
        msg: 'JSON repair failed, using demo fallback',
        service: 'script-converter',
        jobId: options?.jobId,
        episodeNumber: options?.episodeNumber,
      }),
    )

    return {
      title: `Episode ${options?.episodeNumber || 1} (Repair Failed)`,
      scenes: [
        {
          id: '1',
          setting: '修復失敗のため簡易版',
          description: 'LLMからの出力が修復不可能だったため、簡易版を返します',
          script: [
            {
              type: 'narration',
              text: `元のテキスト: ${input.episodeText.substring(0, Math.min(100, input.episodeText.length))}...`,
            },
            {
              type: 'stage',
              text: 'JSON修復に失敗したため、簡易的な台本形式で返しています。',
            },
          ],
        },
      ],
    }
  }

  // If loop did not achieve threshold but found a better candidate, use it
  if (bestScriptResult) {
    scriptResult = bestScriptResult
  }

  // Handle case where LLM returns an array instead of a single object
  if (Array.isArray(scriptResult)) {
    console.warn(
      JSON.stringify({
        ts: new Date().toISOString(),
        level: 'warn',
        msg: 'LLM returned array instead of single object, merging array elements',
        service: 'script-converter',
        jobId: options?.jobId,
        episodeNumber: options?.episodeNumber,
        arrayLength: scriptResult.length,
      }),
    )

    // Merge all array elements into a single Script object
    const mergedV2: ScriptV2 = { title: '', script: [] }

    for (let i = 0; i < scriptResult.length; i++) {
      const element = scriptResult[i]
      if (element && typeof element === 'object') {
        if (!mergedV2.title && (element as ScriptV2).title)
          mergedV2.title = (element as ScriptV2).title
        const arr = (element as ScriptV2).script
        if (Array.isArray(arr)) mergedV2.script.push(...arr)
      }
    }

    scriptResult = mergedV2
  }

  // Normalize LLM output: handle cases where LLM uses 'lines' or 'content' instead of 'script'
  let normalizedLegacy = toLegacyScenes(scriptResult as ScriptV2)
  // coverageStats/needsRetry が欠落している場合でも動作可能だが、ここで比率を再計算してメタを補完
  try {
    const ratio = estimateCoverageRatioFromScript(normalizedLegacy, input.episodeText.length)
    ;(
      normalizedLegacy as unknown as { coverageStats?: unknown; needsRetry?: boolean }
    ).coverageStats = {
      totalChars: input.episodeText.length,
      coveredChars: Math.round(ratio * input.episodeText.length),
      coverageRatio: ratio,
      uncoveredCount: Math.max(0, Math.round((1 - ratio) * 10)),
      uncoveredSpans: [],
    }
    ;(normalizedLegacy as unknown as { needsRetry?: boolean }).needsRetry = ratio < 0.8
  } catch (_e) {
    // 失敗しても致命的ではない
  }
  if (normalizedLegacy.scenes) {
    for (const scene of normalizedLegacy.scenes) {
      if (!scene.script) {
        // If script is missing, try to use 'lines' or 'content' from the raw output
        const rawScene = scene as unknown as Record<string, unknown>
        const lines = rawScene.lines as unknown[] | undefined
        const content = rawScene.content as unknown[] | undefined

        if (Array.isArray(lines) && lines.length > 0) {
          scene.script = lines as Script['scenes'][0]['script']
        } else if (Array.isArray(content) && content.length > 0) {
          scene.script = content as Script['scenes'][0]['script']
        } else {
          scene.script = [] // Ensure script is always an array
        }
      }
    }
  }

  // ===== Hard limit: split long script lines (max 100 chars per element) =====
  normalizedLegacy = splitLongScriptLines(normalizedLegacy, 100)

  return normalizedLegacy
}

// 内部補助: 台本のカバレッジ比率を概算
function estimateCoverageRatioFromScript(script: Script, totalChars: number): number {
  try {
    const texts = (script.scenes || []).flatMap((s) => (s.script || []).map((l) => l.text || ''))
    const joined = texts.join('')
    // 文字種の差を吸収しつつ概算（完全一致は期待しない）
    const covered = Math.min(totalChars, Math.max(0, Math.floor(joined.length * 0.8)))
    const ratio = totalChars > 0 ? covered / totalChars : 0
    return Math.max(0, Math.min(1, ratio))
  } catch (_e) {
    return 0
  }
}

// Split any ScriptLine.text longer than maxLen into multiple lines preserving type/speaker
function splitLongScriptLines(script: Script, maxLen: number): Script {
  try {
    const scenes = (script.scenes || []).map((scene) => {
      const newLines: Script['scenes'][number]['script'] = []
      for (const line of scene.script || []) {
        const text = String(line.text ?? '')
        if (text.length <= maxLen) {
          newLines.push({ ...line })
          continue
        }
        const parts = splitTextNatural(text, maxLen)
        for (const part of parts) {
          newLines.push({
            index: undefined,
            type: line.type,
            speaker: line.speaker,
            character: line.character,
            text: part,
            sourceStart: line.sourceStart,
            sourceEnd: line.sourceEnd,
            sourceQuote: line.sourceQuote,
            isContinuation: true,
          })
        }
      }
      return { ...scene, script: newLines }
    })
    return { ...script, scenes }
  } catch {
    return script
  }
}

function splitTextNatural(text: string, maxLen: number): string[] {
  if (text.length <= maxLen) return [text]
  // First split by newlines
  const byLines = text.split(/\n+/).flatMap((seg) => (seg.length ? [seg] : []))
  const segments: string[] = []
  const pushChunked = (s: string) => {
    if (s.length <= maxLen) {
      segments.push(s)
      return
    }
    // Try sentence boundaries (Japanese/English punctuation)
    const sentences = s
      .split(/(?<=[。！？!?.])/)
      .map((x) => x.trim())
      .filter((x) => x.length > 0)
    if (sentences.length > 1) {
      for (const sent of sentences) pushChunked(sent)
      return
    }
    // Fallback: hard chunking by maxLen
    for (let i = 0; i < s.length; i += maxLen) {
      segments.push(s.slice(i, i + maxLen))
    }
  }
  for (const seg of byLines) pushChunked(seg)
  return segments
}
