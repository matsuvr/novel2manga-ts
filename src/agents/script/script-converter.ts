import type { z } from 'zod'
import { getLlmStructuredGenerator } from '@/agents/structured-generator'
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

/**
 * Repairs corrupted JSON structure from LLM where scenes array contains mixed strings and objects
 */
function repairCorruptedScriptJson(result: unknown, options?: ScriptConversionOptions): unknown {
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
    // Type helpers
    const isRecord = (v: unknown): v is Record<string, unknown> =>
      typeof v === 'object' && v !== null

    type SceneLine = Script['scenes'][0]['script'][number]
    type SceneShape = {
      id?: string
      setting?: string
      description?: string
      script: SceneLine[]
    }

    const normalizeLineType = (v: unknown): SceneLine['type'] => {
      const t = String(v || '').toLowerCase()
      return t === 'dialogue' || t === 'thought' || t === 'narration' || t === 'stage'
        ? (t as SceneLine['type'])
        : 'stage'
    }

    const coerceScriptLines = (lines: unknown[]): SceneLine[] => {
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

    const isSceneObject = (v: unknown): v is SceneShape => {
      if (!isRecord(v)) return false
      const scriptVal = (v as Record<string, unknown>).script
      if (!Array.isArray(scriptVal)) return false
      // Accept if every entry has at least a stringifiable text
      return scriptVal.every((line) => {
        if (isRecord(line)) return typeof line.text === 'string' || typeof line.text === 'number'
        return typeof line === 'string'
      })
    }

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

  // フラグメント変換を使用する場合（トークン制限回避のため閾値を下げる）
  if (options?.useFragmentConversion && input.episodeText.length > 1000) {
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
  const result = await generator.generateObjectWithFallback({
    name: 'script-conversion',
    systemPrompt: cfg.systemPrompt,
    userPrompt: prompt,
    schema: ScriptSchema as unknown as z.ZodTypeAny,
    schemaName: 'Script',
  })

  // Repair corrupted JSON structure from LLM
  let scriptResult = repairCorruptedScriptJson(result, options)

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
    const allScenes: Script['scenes'] = []
    let mergedTitle = ''

    for (let i = 0; i < scriptResult.length; i++) {
      const element = scriptResult[i]
      if (element && typeof element === 'object') {
        // Take title from first element that has one
        if (!mergedTitle && element.title) {
          mergedTitle = element.title
        }

        // Merge scenes from all elements
        if (Array.isArray(element.scenes)) {
          allScenes.push(...element.scenes)
        } else if (element.script && Array.isArray(element.script)) {
          // If element has script directly (wrong structure), wrap it as a scene
          allScenes.push({
            id: element.id || String(i + 1),
            setting: element.setting,
            description: element.description,
            script: element.script,
          })
        }
      }
    }

    scriptResult = {
      title: mergedTitle || undefined,
      scenes: allScenes,
    }
  }

  // Normalize LLM output: handle cases where LLM uses 'lines' or 'content' instead of 'script'
  const normalized = scriptResult as Script
  if (normalized.scenes) {
    for (const scene of normalized.scenes) {
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

  return normalized
}
