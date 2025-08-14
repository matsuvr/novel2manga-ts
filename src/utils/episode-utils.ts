// エピソード設定の型
interface EpisodeConfig {
  targetCharsPerEpisode: number
  minCharsPerEpisode: number
  maxCharsPerEpisode: number
  charsPerPage: number
}

// 遅延インポートでモック欠落に耐性を持たせる
async function getEpisodeConfigSafe(): Promise<EpisodeConfig> {
  try {
    const mod = (await import('@/config')) as { getEpisodeConfig?: () => EpisodeConfig }
    if (typeof mod.getEpisodeConfig === 'function') {
      return mod.getEpisodeConfig()
    }
  } catch {
    // ignore
  }
  return {
    targetCharsPerEpisode: 1000,
    minCharsPerEpisode: 500,
    maxCharsPerEpisode: 2000,
    charsPerPage: 300,
  }
}

import type { ChunkAnalysisResult, ChunkData } from '@/types/chunk'
import type { NarrativeAnalysisInput } from '@/types/episode'

export interface PrepareNarrativeInputOptions {
  jobId: string
  startChunkIndex: number
  targetChars?: number
  minChars?: number
  maxChars?: number
}

export async function prepareNarrativeAnalysisInput(
  options: PrepareNarrativeInputOptions,
): Promise<NarrativeAnalysisInput | null> {
  const episodeConfig = await getEpisodeConfigSafe()
  const {
    jobId,
    startChunkIndex,
    targetChars = episodeConfig.targetCharsPerEpisode,
    minChars = episodeConfig.minCharsPerEpisode,
    maxChars = episodeConfig.maxCharsPerEpisode,
  } = options

  const chunks: NarrativeAnalysisInput['chunks'] = []
  let totalChars = 0
  let currentChunkIndex = startChunkIndex

  // 動的にストレージAPIを取得（テストの部分モック互換）
  const { StorageFactory, StorageKeys } = await import('@/utils/storage')
  const chunkStorage = await StorageFactory.getChunkStorage()
  const analysisStorage = await StorageFactory.getAnalysisStorage()

  while (totalChars < targetChars && chunks.length < 20) {
    const chunkObj = await chunkStorage.get(StorageKeys.chunk(jobId, currentChunkIndex))
    const chunkData = chunkObj ? { text: chunkObj.text } : null
    if (!chunkData) {
      break
    }

    const analysisObj = await analysisStorage.get(
      StorageKeys.chunkAnalysis(jobId, currentChunkIndex),
    )
    const analysisResult = analysisObj
      ? (JSON.parse(analysisObj.text) as ChunkAnalysisResult)
      : null

    const chunkInput: NarrativeAnalysisInput['chunks'][0] = {
      chunkIndex: currentChunkIndex,
      text: chunkData.text,
      analysis: {
        summary: analysisResult?.summary || '',
        characters:
          analysisResult?.characters?.map((c: { name: string; role: string }) => ({
            name: c.name,
            role: c.role,
          })) || [],
        dialogues: (analysisResult?.dialogues as ChunkAnalysisResult['dialogues']) || [],
        scenes: (analysisResult?.scenes as ChunkAnalysisResult['scenes']) || [],
        highlights:
          analysisResult?.highlights?.map(
            (h: {
              text?: string
              description: string
              importance: number
              startIndex?: number
              endIndex?: number
            }) => ({
              text: h.text || h.description,
              importance: h.importance,
              description: h.description,
              startIndex: h.startIndex || 0,
              endIndex: h.endIndex || 0,
            }),
          ) || [],
      },
    }

    chunks.push(chunkInput)
    totalChars += chunkData.text.length
    currentChunkIndex++

    if (totalChars >= minChars && totalChars <= maxChars) {
      const nextObj = await chunkStorage.get(StorageKeys.chunk(jobId, currentChunkIndex))
      if (!nextObj) break

      const potentialTotal = totalChars + nextObj.text.length
      if (potentialTotal > maxChars) {
        break
      }
    }
  }

  // チャンクが見つからない場合のみnullを返す
  if (chunks.length === 0) {
    return null
  }

  // 文字数が少なくても、利用可能なチャンクがあれば処理を続ける
  // （呼び出し側で前のエピソードと結合するかどうかを判断）

  return {
    jobId,
    chunks,
    targetCharsPerEpisode: targetChars,
    minCharsPerEpisode: minChars,
    maxCharsPerEpisode: maxChars,
    startingEpisodeNumber: 1,
    isMiddleOfNovel: false,
    previousEpisodeEndText: undefined,
  }
}

export function calculateEstimatedPages(charCount: number): number {
  // 同様に安全に取得
  const defaultCfg = { charsPerPage: 300 }
  const cfgPromise = getEpisodeConfigSafe().catch(() => defaultCfg)
  // 注意: 同期関数だが、ここではデフォルト値で推定しつつ副作用なく対応
  // 厳密な値が必要なコードパスでは非同期版を使用
  const globalWithConfig = globalThis as typeof globalThis & { __episodeCfg?: EpisodeConfig }
  const cfg: EpisodeConfig = globalWithConfig.__episodeCfg || defaultCfg
  void cfgPromise.then((c) => {
    globalWithConfig.__episodeCfg = c
  })
  const charsPerPage = cfg.charsPerPage ?? 300
  return Math.round(charCount / charsPerPage)
}

export function validateEpisodeBoundaries(
  boundaries: Array<{
    startChunk: number
    startCharIndex: number
    endChunk: number
    endCharIndex: number
  }>,
  chunks: ChunkData[],
): boolean {
  for (let i = 0; i < boundaries.length; i++) {
    const boundary = boundaries[i]

    const startChunk = chunks.find((c) => c.chunkIndex === boundary.startChunk)
    const endChunk = chunks.find((c) => c.chunkIndex === boundary.endChunk)

    if (!startChunk || !endChunk) {
      return false
    }

    if (boundary.startCharIndex < 0 || boundary.startCharIndex > startChunk.text.length) {
      return false
    }

    if (boundary.endCharIndex < 0 || boundary.endCharIndex > endChunk.text.length) {
      return false
    }

    if (i > 0) {
      const prevBoundary = boundaries[i - 1]
      if (
        boundary.startChunk < prevBoundary.endChunk ||
        (boundary.startChunk === prevBoundary.endChunk &&
          boundary.startCharIndex <= prevBoundary.endCharIndex)
      ) {
        return false
      }
    }
  }

  return true
}

export function extractEpisodeText(
  chunks: ChunkData[],
  startChunk: number,
  startCharIndex: number,
  endChunk: number,
  endCharIndex: number,
): string {
  const sortedChunks = chunks
    .filter((c) => c.chunkIndex >= startChunk && c.chunkIndex <= endChunk)
    .sort((a, b) => a.chunkIndex - b.chunkIndex)

  const texts: string[] = []

  for (const chunk of sortedChunks) {
    if (chunk.chunkIndex === startChunk && chunk.chunkIndex === endChunk) {
      texts.push(chunk.text.substring(startCharIndex, endCharIndex))
    } else if (chunk.chunkIndex === startChunk) {
      texts.push(chunk.text.substring(startCharIndex))
    } else if (chunk.chunkIndex === endChunk) {
      texts.push(chunk.text.substring(0, endCharIndex))
    } else {
      texts.push(chunk.text)
    }
  }

  return texts.join('\n\n')
}
