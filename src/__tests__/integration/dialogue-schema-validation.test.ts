import { describe, expect, it } from 'vitest'
import { normalizeDialogues, normalizeLLMResponse } from '@/utils/dialogue-normalizer'

describe('Dialogue Schema Validation Integration', () => {
  describe('正常なdialogue形式の処理', () => {
    it('正しいdialogue形式はそのまま処理される', () => {
      const mockResponse = {
        pages: [
          {
            pageNumber: 1,
            panels: [
              {
                panelIndex: 1,
                content: 'パネル内容',
                dialogue: [
                  { speaker: 'キャラA', text: 'こんにちは' },
                  { speaker: 'キャラB', text: 'こんばんは' },
                ],
              },
            ],
          },
        ],
      }

      const result = normalizeLLMResponse(mockResponse)
      expect(result).toEqual(mockResponse)
    })
  })

  describe('異常なdialogue形式の正規化', () => {
    it('lines形式をtext形式に正規化する', () => {
      const mockResponse = {
        pages: [
          {
            pageNumber: 1,
            panels: [
              {
                panelIndex: 1,
                content: 'パネル内容',
                dialogue: [{ speaker: 'キャラA', lines: '古い形式のセリフ' }],
              },
            ],
          },
        ],
      }

      const result = normalizeLLMResponse(mockResponse)

      expect(result.pages[0].panels[0].dialogue[0]).toEqual({
        speaker: 'キャラA',
        text: '古い形式のセリフ',
      })
    })

    it('文字列形式をDialogueオブジェクトに正規化する', () => {
      const mockResponse = {
        pages: [
          {
            pageNumber: 1,
            panels: [
              {
                panelIndex: 1,
                content: 'パネル内容',
                dialogue: ['キャラA：こんにちは', '「さようなら」'],
              },
            ],
          },
        ],
      }

      const result = normalizeLLMResponse(mockResponse)

      expect(result.pages[0].panels[0].dialogue).toEqual([
        { speaker: 'キャラA', text: 'こんにちは' },
        { speaker: '登場人物', text: '「さようなら」' },
      ])
    })

    it('混合形式を正しく正規化する', () => {
      const mockResponse = {
        pages: [
          {
            pageNumber: 1,
            panels: [
              {
                panelIndex: 1,
                content: 'パネル内容',
                dialogue: [
                  { speaker: 'キャラA', text: '正しい形式' },
                  { speaker: 'キャラB', lines: '古い形式' },
                  'キャラC：文字列形式',
                  null,
                  { speaker: 'キャラD', text: '最後のセリフ' },
                ],
              },
            ],
          },
        ],
      }

      const result = normalizeLLMResponse(mockResponse)
      const dialogues = result.pages[0].panels[0].dialogue

      expect(dialogues).toHaveLength(5)
      expect(dialogues[0]).toEqual({ speaker: 'キャラA', text: '正しい形式' })
      expect(dialogues[1]).toEqual({ speaker: 'キャラB', text: '古い形式' })
      expect(dialogues[2]).toEqual({ speaker: 'キャラC', text: '文字列形式' })
      expect(dialogues[3].speaker).toBe('ナレーション')
      expect(dialogues[4]).toEqual({ speaker: 'キャラD', text: '最後のセリフ' })
    })
  })
})
