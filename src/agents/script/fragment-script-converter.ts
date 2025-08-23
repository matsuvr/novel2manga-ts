import { z } from 'zod'
import { getLlmStructuredGenerator } from '@/agent/structured-generator'
import { getAppConfigWithOverrides } from '@/config/app.config'
import { getLogger } from '@/infrastructure/logging/logger'
import type { Script } from '@/types/script'

// Script型の scenes 配列の要素型を推論
type Scene = NonNullable<Script['scenes']>[number]

import type { EpisodeFragment } from '@/utils/episode-fragment-splitter'
import { getFragmentContext, splitEpisodeIntoFragments } from '@/utils/episode-fragment-splitter'

// フラグメント用のスクリプトスキーマ（部分的なスクリプト）
const FragmentScriptSchema = z.object({
  scenes: z.array(
    z.object({
      id: z.string(),
      setting: z.string().optional(),
      description: z.string().optional(),
      script: z.array(
        z.object({
          index: z.number(),
          type: z.enum(['dialogue', 'thought', 'narration', 'stage']),
          text: z.string(),
          speaker: z.string().optional(),
        }),
      ),
    }),
  ),
})

type FragmentScript = z.infer<typeof FragmentScriptSchema>

export interface FragmentConversionInput {
  episodeText: string
  characterList?: string
  sceneList?: string
  dialogueList?: string
  highlightList?: string
  situationList?: string
}

export interface FragmentConversionOptions {
  jobId?: string
  episodeNumber?: number
  isDemo?: boolean
  fragmentSize?: number
  overlapSize?: number
  maxConcurrentFragments?: number
}

/**
 * エピソードテキストをフラグメント単位でスクリプトに変換し、結合する
 */
export async function convertEpisodeTextToScriptWithFragments(
  input: FragmentConversionInput,
  options: FragmentConversionOptions = {},
): Promise<Script> {
  const logger = getLogger().withContext({
    service: 'fragment-script-converter',
    jobId: options.jobId,
    episodeNumber: options.episodeNumber,
  })

  if (!input.episodeText || input.episodeText.trim() === '') {
    throw new Error('Episode text is required and cannot be empty')
  }

  // デモモードの処理
  if (options.isDemo || process.env.NODE_ENV === 'test') {
    return {
      title: `Demo Episode ${options.episodeNumber || 1}`,
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

  logger.info('Starting fragment-based script conversion', {
    episodeTextLength: input.episodeText.length,
    fragmentSize: options.fragmentSize,
    overlapSize: options.overlapSize,
  })

  // エピソードをフラグメントに分割
  const fragments = splitEpisodeIntoFragments(input.episodeText, {
    fragmentSize: options.fragmentSize,
    overlapSize: options.overlapSize,
  })

  logger.info('Episode split into fragments', {
    totalFragments: fragments.length,
    fragmentSizes: fragments.map((f) => f.text.length),
  })

  // フラグメントが1つだけの場合は、従来の方式を使用
  if (fragments.length === 1) {
    logger.info('Single fragment detected, using traditional conversion')
    const { convertEpisodeTextToScript } = await import('./script-converter')
    return convertEpisodeTextToScript(input, {
      jobId: options.jobId,
      episodeNumber: options.episodeNumber,
      isDemo: options.isDemo,
    })
  }

  // 各フラグメントを並行処理でスクリプト変換
  const maxConcurrent = Math.min(options.maxConcurrentFragments || 3, fragments.length)

  const fragmentScripts: FragmentScript[] = []
  const processingQueue = [...fragments]
  const workers = Array.from({ length: maxConcurrent }, () => processFragmentQueue())

  async function processFragmentQueue(): Promise<void> {
    while (processingQueue.length > 0) {
      const fragment = processingQueue.shift()
      if (!fragment) break

      const fragmentScript = await convertSingleFragment(fragment, fragments, input)
      fragmentScripts[fragment.index] = fragmentScript

      logger.info('Fragment converted', {
        fragmentIndex: fragment.index,
        scenesGenerated: fragmentScript?.scenes?.length || 0,
      })
    }
  }

  await Promise.all(workers)

  // フラグメントスクリプトを統合して最終スクリプトを生成
  const finalScript = mergeFragmentScripts(fragmentScripts, options.episodeNumber)

  logger.info('Fragment-based script conversion completed', {
    totalScenes: finalScript.scenes.length,
    totalScriptItems: finalScript.scenes.reduce(
      (sum, scene) => sum + (scene.script?.length || 0),
      0,
    ),
  })

  return finalScript
}

/**
 * 単一フラグメントをスクリプトに変換
 */
async function convertSingleFragment(
  fragment: EpisodeFragment,
  allFragments: EpisodeFragment[],
  _input: FragmentConversionInput,
): Promise<FragmentScript> {
  const generator = getLlmStructuredGenerator()
  const appConfig = getAppConfigWithOverrides()
  const fragmentConfig = appConfig.llm.scriptConversion.fragmentConversion

  // フラグメントの文脈を取得
  const context = getFragmentContext(allFragments, fragment.index)

  // プロンプトを構築
  const prompt = fragmentConfig.userPromptTemplate
    .replace('{{previousFragment}}', context.previousFragment)
    .replace('{{fragmentText}}', context.currentFragment)
    .replace('{{nextFragment}}', context.nextFragment)
    .replace('{{fragmentIndex}}', (fragment.index + 1).toString())
    .replace('{{totalFragments}}', allFragments.length.toString())

  const logger = getLogger().withContext({ service: 'fragment-script-converter' })

  const isMaxTokensError = (msg: string) =>
    msg.includes('max completion tokens reached') || msg.includes('json_validate_failed')

  // Magic numbers for loop pattern detection
  const LOOP_PATTERN_MIN_LENGTH = 200
  const LOOP_PATTERN_LINE_PREFIX_LENGTH = 40
  const LOOP_PATTERN_LINE_REPEAT_THRESHOLD = 5
  const LOOP_PATTERN_CHUNK_SIZES = [50, 80, 120]
  const LOOP_PATTERN_CHUNK_REPEAT_THRESHOLD = 3

  const hasLoopPattern = (text: string): boolean => {
    const normalized = text.replace(/\s+/g, ' ').trim()
    if (normalized.length < LOOP_PATTERN_MIN_LENGTH) return false
    // 1) 同一行/文の過剰反復
    const lines = text
      .split(/\n|。/)
      .map((s) => s.trim())
      .filter(Boolean)
    const freq = new Map<string, number>()
    for (const line of lines) {
      const key = line.slice(0, 40) // 冒頭40文字で近似比較
      freq.set(key, (freq.get(key) || 0) + 1)
    }
    if (Array.from(freq.values()).some((n) => n >= 5)) return true

    // 2) 固定長チャンクの繰り返し（50〜120文字）
    const winSizes = [50, 80, 120]
    for (const size of winSizes) {
      const counts = new Map<string, number>()
      for (let i = 0; i + size <= normalized.length; i += size) {
        const seg = normalized.slice(i, i + size)
        counts.set(seg, (counts.get(seg) || 0) + 1)
      }
      if (Array.from(counts.values()).some((n) => n >= 3)) return true
    }
    return false
  }

  const maxAttempts = 3
  let lastErr: unknown
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const result = await generator.generateObjectWithFallback({
        name: 'fragment-script-conversion',
        systemPrompt: fragmentConfig.systemPrompt,
        userPrompt: prompt,
        schema: FragmentScriptSchema,
        schemaName: 'FragmentScript',
      })

      if (!result || !result.scenes) {
        throw new Error(`Invalid fragment script result for fragment ${fragment.index}`)
      }

      // ループ出力の簡易検出（出力に異常反復がある場合はリトライ）
      const combinedText = result.scenes
        .flatMap((s) => s.script?.map((e) => e.text || '') || [])
        .join('\n')
      if (hasLoopPattern(combinedText)) {
        if (attempt < maxAttempts) {
          logger.warn('Loop-like output detected, retrying fragment conversion', {
            fragmentIndex: fragment.index,
            attempt,
            maxAttempts,
          })
          continue
        }
        throw new Error('Loop output detected in fragment conversion')
      }

      return result as FragmentScript
    } catch (error) {
      lastErr = error
      const message = error instanceof Error ? error.message : String(error)
      const retryable = isMaxTokensError(message) || /Loop output detected/i.test(message)
      if (!retryable || attempt === maxAttempts) {
        logger.error('Fragment script conversion failed', {
          fragmentIndex: fragment.index,
          error: message,
        })
        throw error
      }
      logger.warn('Retrying fragment conversion due to transient LLM failure', {
        fragmentIndex: fragment.index,
        attempt,
        maxAttempts,
        reason: message,
      })
      // Backoff
      await new Promise((r) => setTimeout(r, 500 * attempt))
    }
  }

  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr))
}

/**
 * フラグメントスクリプトを統合して最終スクリプトを生成
 */
function mergeFragmentScripts(fragmentScripts: FragmentScript[], episodeNumber?: number): Script {
  const logger = getLogger().withContext({ service: 'fragment-script-merger' })

  const allScenes: Scene[] = []
  let scriptIndexCounter = 1

  for (let i = 0; i < fragmentScripts.length; i++) {
    const fragmentScript = fragmentScripts[i]
    if (!fragmentScript || !fragmentScript.scenes) {
      logger.warn('Empty fragment script encountered', { fragmentIndex: i })
      continue
    }

    for (const scene of fragmentScript.scenes) {
      // シーンIDを重複しないように調整
      const adjustedScene: Scene = {
        ...scene,
        id: `episode_${episodeNumber || 1}_fragment_${i}_${scene.id}`,
        script: scene.script.map((item) => ({
          ...item,
          index: scriptIndexCounter++,
        })),
      }

      allScenes.push(adjustedScene)
    }
  }

  // 隣接するシーンで同じ設定の場合は統合
  const mergedScenes = mergeAdjacentSimilarScenes(allScenes)

  return {
    title: `Episode ${episodeNumber || 1}`,
    scenes: mergedScenes,
  }
}

/**
 * 隣接する類似シーンを統合
 */
function mergeAdjacentSimilarScenes(scenes: Scene[]): Scene[] {
  if (scenes.length <= 1) return scenes

  const merged: Scene[] = []
  let currentScene = { ...scenes[0] }

  for (let i = 1; i < scenes.length; i++) {
    const nextScene = scenes[i]

    // 設定が同じ場合は統合
    if (currentScene.setting === nextScene.setting && shouldMergeScenes(currentScene, nextScene)) {
      // スクリプト要素を結合
      currentScene.script = [...(currentScene.script || []), ...(nextScene.script || [])]

      // 説明を結合（必要に応じて）
      if (nextScene.description && nextScene.description !== currentScene.description) {
        currentScene.description = currentScene.description
          ? `${currentScene.description} ${nextScene.description}`
          : nextScene.description
      }
    } else {
      merged.push(currentScene)
      currentScene = { ...nextScene }
    }
  }

  merged.push(currentScene)
  return merged
}

/**
 * 2つのシーンを統合すべきかどうかを判定
 */
function shouldMergeScenes(scene1: Scene, scene2: Scene): boolean {
  // 同じ設定で、どちらかが非常に短い場合は統合
  const scene1Length = (scene1.script || []).reduce(
    (sum: number, item: { text: string }) => sum + item.text.length,
    0,
  )
  const scene2Length = (scene2.script || []).reduce(
    (sum: number, item: { text: string }) => sum + item.text.length,
    0,
  )

  // テスト環境ではデフォルト値を使用
  const minSceneLength = 200

  return scene1Length < minSceneLength || scene2Length < minSceneLength
}
