import { describe, expect, it } from 'vitest'
import {
  normalizeDialogues,
  normalizeLLMResponse,
  normalizePageDialogues,
} from '@/utils/dialogue-normalizer'

describe('dialogue-normalizer', () => {
  describe('normalizeDialogues', () => {
    it('正しいDialogue形式をそのまま返す', () => {
      const input = [
        { speaker: 'キャラA', text: 'こんにちは' },
        { speaker: 'キャラB', text: 'こんばんは' },
      ]

      const result = normalizeDialogues(input)

      expect(result).toEqual([
        { speaker: 'キャラA', text: 'こんにちは' },
        { speaker: 'キャラB', text: 'こんばんは' },
      ])
    })

    it('lines形式をtext形式に変換する（後方互換性）', () => {
      const input = [
        { speaker: 'キャラA', lines: 'こんにちは' },
        { speaker: 'キャラB', lines: 'さようなら' },
      ]

      const result = normalizeDialogues(input)

      expect(result).toEqual([
        { speaker: 'キャラA', text: 'こんにちは' },
        { speaker: 'キャラB', text: 'さようなら' },
      ])
    })

    it('文字列を適切なDialogueオブジェクトに変換する', () => {
      const input = ['キャラA：こんにちは', '「さようなら」', 'ナレーション的な内容']

      const result = normalizeDialogues(input)

      expect(result).toEqual([
        { speaker: 'キャラA', text: 'こんにちは' },
        { speaker: '登場人物', text: '「さようなら」' },
        { speaker: 'ナレーション', text: 'ナレーション的な内容' },
      ])
    })

    it('異常な形式を安全にDialogueオブジェクトに変換する', () => {
      const input = [
        null,
        undefined,
        123,
        { speaker: 'キャラA' }, // textもlinesもない
        { text: 'セリフのみ' }, // speakerがない
      ]

      const result = normalizeDialogues(input)

      expect(result).toHaveLength(5)
      result.forEach((dialogue) => {
        expect(dialogue).toHaveProperty('speaker')
        expect(dialogue).toHaveProperty('text')
        expect(typeof dialogue.speaker).toBe('string')
        expect(typeof dialogue.text).toBe('string')
      })
    })

    it('混合形式を正しく処理する', () => {
      const input = [
        { speaker: 'キャラA', text: '正しい形式' },
        { speaker: 'キャラB', lines: '古い形式' },
        'キャラC：文字列形式',
        null,
        { speaker: 'キャラD', text: '最後のセリフ' },
      ]

      const result = normalizeDialogues(input)

      expect(result).toHaveLength(5)
      expect(result[0]).toEqual({ speaker: 'キャラA', text: '正しい形式' })
      expect(result[1]).toEqual({ speaker: 'キャラB', text: '古い形式' })
      expect(result[2]).toEqual({ speaker: 'キャラC', text: '文字列形式' })
      expect(result[3].speaker).toBe('ナレーション')
      expect(result[4]).toEqual({ speaker: 'キャラD', text: '最後のセリフ' })
    })

    it('既存のtypeを保持し新たな推論を行わない', () => {
      const input = [
        { speaker: 'A', text: '発話', type: 'speech' },
        { speaker: 'B', text: '心の声だよ', type: 'thought' },
        { speaker: 'C', text: '説明', type: 'narration' },
        'D：これは「（心の声）」という語を含むけど推論しない',
        'ナレーション的な自由文',
      ]

      const result = normalizeDialogues(input as unknown[])

      expect(result[0]).toEqual({ speaker: 'A', text: '発話', type: 'speech' })
      expect(result[1]).toEqual({ speaker: 'B', text: '心の声だよ', type: 'thought' })
      expect(result[2]).toEqual({ speaker: 'C', text: '説明', type: 'narration' })
      // 以下2件は type 無し（推論しない）
      expect(result[3]).toEqual({ speaker: 'D', text: 'これは「（心の声）」という語を含むけど推論しない' })
      expect(result[4]).toEqual({ speaker: 'ナレーション', text: 'ナレーション的な自由文' })
    })
  })

  describe('normalizePageDialogues', () => {
    it('ページ内の全パネルのdialogue配列を正規化する', () => {
      const input = {
        pageNumber: 1,
        panels: [
          {
            panelIndex: 1,
            content: 'パネル1',
            dialogue: [{ speaker: 'キャラA', lines: '古い形式' }, 'キャラB：文字列形式'],
          },
          {
            panelIndex: 2,
            content: 'パネル2',
            dialogue: [{ speaker: 'キャラC', text: '正しい形式' }],
          },
        ],
      }

      const result = normalizePageDialogues(input)

  expect(result.panels![0].dialogue).toEqual([
        { speaker: 'キャラA', text: '古い形式' },
        { speaker: 'キャラB', text: '文字列形式' },
      ])
  expect(result.panels![1].dialogue).toEqual([{ speaker: 'キャラC', text: '正しい形式' }])
    })

    it('dialogue配列がないパネルはそのまま返す', () => {
      const input = {
        pageNumber: 1,
        panels: [
          {
            panelIndex: 1,
            content: 'パネル1',
            // dialogueなし
          },
        ],
      }

      const result = normalizePageDialogues(input)

      expect(result).toEqual(input)
    })
  })

  describe('normalizeLLMResponse', () => {
    it('LLM応答全体のdialogue配列を正規化する', () => {
      const input = {
        pages: [
          {
            pageNumber: 1,
            panels: [
              {
                panelIndex: 1,
                content: 'パネル1',
                dialogue: ['キャラA：こんにちは', { speaker: 'キャラB', lines: '古い形式' }],
              },
            ],
          },
          {
            pageNumber: 2,
            panels: [
              {
                panelIndex: 1,
                content: 'パネル2',
                dialogue: [{ speaker: 'キャラC', text: '正しい形式' }],
              },
            ],
          },
        ],
      }

      const result = normalizeLLMResponse(input)
      expect(result.pages).toBeTruthy()
      expect(Array.isArray(result.pages)).toBe(true)
      expect(result.pages?.[0]).toBeTruthy()
      expect(result.pages?.[0].panels?.[0]).toBeTruthy()
      expect(result.pages?.[0].panels?.[0].dialogue).toEqual([
        { speaker: 'キャラA', text: 'こんにちは' },
        { speaker: 'キャラB', text: '古い形式' },
      ])
      expect(result.pages?.[1]).toBeTruthy()
      expect(result.pages?.[1].panels?.[0]).toBeTruthy()
      expect(result.pages?.[1].panels?.[0].dialogue).toEqual([
        { speaker: 'キャラC', text: '正しい形式' },
      ])
    })

    it('pages配列がない場合はそのまま返す', () => {
      const input = { title: 'テストタイトル' }

      const result = normalizeLLMResponse(input)

      expect(result).toEqual(input)
    })
  })
})
