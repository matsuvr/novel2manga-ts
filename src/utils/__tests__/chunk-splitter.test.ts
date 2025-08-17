import { describe, expect, it } from 'vitest'
import { splitTextIntoChunks } from '../chunk-splitter'

describe('splitTextIntoChunks', () => {
  it('throws error for non-positive chunkSize', () => {
    expect(() => splitTextIntoChunks('text', 0, 0)).toThrow(
      'チャンクサイズは0より大きい必要があります',
    )
  })

  it('throws error for negative overlapSize', () => {
    expect(() => splitTextIntoChunks('text', 5, -1)).toThrow(
      'オーバーラップサイズは0以上である必要があります',
    )
  })

  it('throws error when overlapSize is not less than chunkSize', () => {
    expect(() => splitTextIntoChunks('text', 5, 5)).toThrow(
      'オーバーラップサイズはチャンクサイズより小さい必要があります',
    )
  })

  it("handles text length that isn't a multiple of chunkSize", () => {
    const text = 'abcdefghij'
    const chunks = splitTextIntoChunks(text, 4, 0)

    expect(chunks).toHaveLength(3)
    expect(chunks[0]).toEqual({
      index: 0,
      startPosition: 0,
      endPosition: 4,
      text: 'abcd',
    })
    expect(chunks[1]).toEqual({
      index: 1,
      startPosition: 4,
      endPosition: 8,
      text: 'efgh',
    })
    expect(chunks[2]).toEqual({
      index: 2,
      startPosition: 8,
      endPosition: 10,
      text: 'ij',
    })
  })

  it('calculates overlap boundaries correctly', () => {
    const text = 'abcdefghijk'
    const chunks = splitTextIntoChunks(text, 5, 2)

    expect(chunks).toHaveLength(4)
    expect(chunks[0]).toEqual({
      index: 0,
      startPosition: 0,
      endPosition: 5,
      text: 'abcde',
    })
    expect(chunks[1]).toEqual({
      index: 1,
      startPosition: 3,
      endPosition: 8,
      text: 'defgh',
    })
    expect(chunks[2]).toEqual({
      index: 2,
      startPosition: 6,
      endPosition: 11,
      text: 'ghijk',
    })
    expect(chunks[3]).toEqual({
      index: 3,
      startPosition: 9,
      endPosition: 11,
      text: 'jk',
    })

    for (let i = 0; i < chunks.length - 1; i++) {
      expect(chunks[i].endPosition - chunks[i + 1].startPosition).toBe(2)
    }
  })
})
