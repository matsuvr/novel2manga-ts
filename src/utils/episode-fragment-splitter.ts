import { getAppConfigWithOverrides } from '@/config/app.config'

export interface EpisodeFragment {
  index: number
  text: string
  startPosition: number
  endPosition: number
  isFirstFragment: boolean
  isLastFragment: boolean
}

export interface FragmentSplitterOptions {
  fragmentSize?: number
  overlapSize?: number
  maxFragmentSize?: number
  minFragmentSize?: number
}

/**
 * エピソードテキストをフラグメントに分割する
 * @param episodeText - 分割するエピソードテキスト
 * @param options - 分割オプション（未指定の場合はapp.configから取得）
 * @returns エピソードフラグメントの配列
 */
export function splitEpisodeIntoFragments(
  episodeText: string,
  options?: FragmentSplitterOptions,
): EpisodeFragment[] {
  if (!episodeText || episodeText.trim().length === 0) {
    return []
  }

  const appConfig = getAppConfigWithOverrides()
  const config = {
    fragmentSize: options?.fragmentSize ?? appConfig.chunking.scriptConversion.fragmentSize,
    overlapSize: options?.overlapSize ?? appConfig.chunking.scriptConversion.overlapSize,
    maxFragmentSize:
      options?.maxFragmentSize ?? appConfig.chunking.scriptConversion.maxFragmentSize,
    minFragmentSize:
      options?.minFragmentSize ?? appConfig.chunking.scriptConversion.minFragmentSize,
  }

  const fragments: EpisodeFragment[] = []
  const textLength = episodeText.length

  // エピソードが最小フラグメントサイズより小さい場合は、そのまま1つのフラグメントとして返す
  if (textLength <= config.minFragmentSize) {
    return [
      {
        index: 0,
        text: episodeText,
        startPosition: 0,
        endPosition: textLength,
        isFirstFragment: true,
        isLastFragment: true,
      },
    ]
  }

  let currentPosition = 0
  let fragmentIndex = 0

  while (currentPosition < textLength) {
    let fragmentEnd = Math.min(currentPosition + config.fragmentSize, textLength)

    // 最後のフラグメントでない場合、適切な区切り位置を探す
    if (fragmentEnd < textLength) {
      // 文の区切りを優先的に探す（句点、改行）
      const sentenceBreaks = [
        episodeText.lastIndexOf('。', fragmentEnd),
        episodeText.lastIndexOf('！', fragmentEnd),
        episodeText.lastIndexOf('？', fragmentEnd),
        episodeText.lastIndexOf('\n', fragmentEnd),
      ].filter((pos) => pos > currentPosition)

      if (sentenceBreaks.length > 0) {
        fragmentEnd = Math.max(...sentenceBreaks) + 1
      } else {
        // 文の区切りが見つからない場合、スペースや句読点で区切る
        const wordBreaks = [
          episodeText.lastIndexOf('、', fragmentEnd),
          episodeText.lastIndexOf(' ', fragmentEnd),
          episodeText.lastIndexOf('　', fragmentEnd), // 全角スペース
        ].filter((pos) => pos > currentPosition)

        if (wordBreaks.length > 0) {
          fragmentEnd = Math.max(...wordBreaks) + 1
        }
      }
    }

    const fragmentText = episodeText.substring(currentPosition, fragmentEnd)

    // 最小フラグメントサイズチェック
    if (fragmentText.length < config.minFragmentSize && fragmentEnd < textLength) {
      // 次のフラグメントに統合
      fragmentEnd = Math.min(currentPosition + config.maxFragmentSize, textLength)
    }

    const finalFragmentText = episodeText.substring(currentPosition, fragmentEnd)

    fragments.push({
      index: fragmentIndex,
      text: finalFragmentText,
      startPosition: currentPosition,
      endPosition: fragmentEnd,
      isFirstFragment: fragmentIndex === 0,
      isLastFragment: fragmentEnd >= textLength,
    })

    // 次のフラグメントの開始位置を計算（オーバーラップを考慮）
    if (fragmentEnd < textLength) {
      currentPosition = Math.max(currentPosition + 1, fragmentEnd - config.overlapSize)
    } else {
      break
    }

    fragmentIndex++

    // 無限ループ防止
    if (fragmentIndex > 1000) {
      throw new Error(
        'Fragment splitting exceeded maximum iterations (1000). Please check input text and configuration.',
      )
    }
  }

  return fragments
}

/**
 * フラグメント間のオーバーラップテキストを取得する
 * @param fragments - エピソードフラグメント配列
 * @param targetIndex - 対象フラグメントのインデックス
 * @returns 前後のフラグメントとのオーバーラップ情報
 */
export function getFragmentContext(
  fragments: EpisodeFragment[],
  targetIndex: number,
): {
  previousFragment: string
  currentFragment: string
  nextFragment: string
} {
  const current = fragments[targetIndex]
  const previous = targetIndex > 0 ? fragments[targetIndex - 1] : null
  const next = targetIndex < fragments.length - 1 ? fragments[targetIndex + 1] : null

  const { getChunkingConfig } = require('@/config')
  const config = getChunkingConfig()
  const contextSize = config.scriptConversion?.contextSize ?? 200

  return {
    previousFragment: previous?.text.slice(-contextSize) || '', // 前のフラグメントの末尾文字
    currentFragment: current?.text || '',
    nextFragment: next?.text.slice(0, contextSize) || '', // 次のフラグメントの先頭文字
  }
}
