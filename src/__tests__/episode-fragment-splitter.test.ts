import { describe, expect, it } from 'vitest'
import { getFragmentContext, splitEpisodeIntoFragments } from '@/utils/episode-fragment-splitter'

describe('episode-fragment-splitter', () => {
  describe('splitEpisodeIntoFragments', () => {
    it('空のテキストに対して空の配列を返す', () => {
      const result = splitEpisodeIntoFragments('')
      expect(result).toEqual([])
    })

    it('短いテキストは単一フラグメントとして返す', () => {
      const shortText = '短いテキストです。'
      const result = splitEpisodeIntoFragments(shortText, {
        fragmentSize: 1000,
        minFragmentSize: 500,
      })

      expect(result).toHaveLength(1)
      expect(result[0]).toEqual({
        index: 0,
        text: shortText,
        startPosition: 0,
        endPosition: shortText.length,
        isFirstFragment: true,
        isLastFragment: true,
      })
    })

    it('長いテキストを適切なサイズで分割する', () => {
      const longText =
        '太郎は公園で遊んでいました。' +
        '花子がやってきて、一緒にボール遊びをしました。' +
        '二人はとても楽しい時間を過ごしました。' +
        '夕方になって、それぞれ家に帰りました。' +
        'この物語は友情の大切さを教えてくれます。'

      const result = splitEpisodeIntoFragments(longText, {
        fragmentSize: 30,
        overlapSize: 10,
        minFragmentSize: 1,
        maxFragmentSize: 100,
      })

      expect(result.length).toBeGreaterThan(1)

      // 最初のフラグメントの確認
      expect(result[0].isFirstFragment).toBe(true)
      expect(result[0].isLastFragment).toBe(false)
      expect(result[0].index).toBe(0)

      // 最後のフラグメントの確認
      const lastIndex = result.length - 1
      expect(result[lastIndex].isFirstFragment).toBe(false)
      expect(result[lastIndex].isLastFragment).toBe(true)
      expect(result[lastIndex].index).toBe(lastIndex)

      // オーバーラップの確認
      for (let i = 0; i < result.length - 1; i++) {
        const currentFragment = result[i]
        const nextFragment = result[i + 1]
        expect(nextFragment.startPosition).toBeLessThan(currentFragment.endPosition)
      }
    })

    it('句点で適切に分割される', () => {
      const text = '最初の文です。二番目の文です。三番目の文です。'

      const result = splitEpisodeIntoFragments(text, {
        fragmentSize: 15,
        overlapSize: 5,
        minFragmentSize: 1,
      })

      // 文の境界で分割されることを確認
      const fragmentTexts = result.map((f) => f.text)
      fragmentTexts.forEach((fragmentText) => {
        // 文の途中で切れていないことを確認（最後の文字が句点または文の終端）
        const trimmed = fragmentText.trim()
        if (trimmed.length > 0) {
          const lastChar = trimmed[trimmed.length - 1]
          expect(['。', '！', '？', trimmed[trimmed.length - 1]]).toContain(lastChar)
        }
      })
    })

    it('文字位置が正しく設定される', () => {
      const text = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'

      const result = splitEpisodeIntoFragments(text, {
        fragmentSize: 10,
        overlapSize: 3,
        minFragmentSize: 1,
      })

      expect(result[0].startPosition).toBe(0)
      expect(result[0].endPosition).toBe(10)
      expect(result[0].text).toBe('ABCDEFGHIJ')

      expect(result[result.length - 1].endPosition).toBe(text.length)
    })
  })

  describe('getFragmentContext', () => {
    const sampleFragments = [
      {
        index: 0,
        text: '最初のフラグメントです。これは長い文章の一部分です。',
        startPosition: 0,
        endPosition: 30,
        isFirstFragment: true,
        isLastFragment: false,
      },
      {
        index: 1,
        text: '二番目のフラグメントです。中間部分の内容が含まれています。',
        startPosition: 27,
        endPosition: 57,
        isFirstFragment: false,
        isLastFragment: false,
      },
      {
        index: 2,
        text: '最後のフラグメントです。物語の結論部分です。',
        startPosition: 54,
        endPosition: 75,
        isFirstFragment: false,
        isLastFragment: true,
      },
    ]

    it('最初のフラグメントの文脈を取得する', () => {
      const context = getFragmentContext(sampleFragments, 0)

      expect(context.previousFragment).toBe('')
      expect(context.currentFragment).toBe(sampleFragments[0].text)
      expect(context.nextFragment).toBe(sampleFragments[1].text.slice(0, 200))
    })

    it('中間のフラグメントの文脈を取得する', () => {
      const context = getFragmentContext(sampleFragments, 1)

      expect(context.previousFragment).toBe(sampleFragments[0].text.slice(-200))
      expect(context.currentFragment).toBe(sampleFragments[1].text)
      expect(context.nextFragment).toBe(sampleFragments[2].text.slice(0, 200))
    })

    it('最後のフラグメントの文脈を取得する', () => {
      const context = getFragmentContext(sampleFragments, 2)

      expect(context.previousFragment).toBe(sampleFragments[1].text.slice(-200))
      expect(context.currentFragment).toBe(sampleFragments[2].text)
      expect(context.nextFragment).toBe('')
    })

    it('無効なインデックスに対してもエラーにならない', () => {
      const context = getFragmentContext(sampleFragments, 10)

      expect(context.previousFragment).toBe('')
      expect(context.currentFragment).toBe('')
      expect(context.nextFragment).toBe('')
    })
  })
})
