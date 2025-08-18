import { describe, expect, it } from 'vitest'
import { splitTextIntoSlidingChunks } from '@/utils/text-splitter'

describe('splitTextIntoSlidingChunks', () => {
  it('splits text into fixed-size chunks with overlap', () => {
    const text = 'abcdefghijklmnopqrstuvwxyz' // 26 chars
    const chunks = splitTextIntoSlidingChunks(text, 10, 2)
    // size=10, overlap=2 => stride=8 => starts at 0,8,16,24
    expect(chunks[0]).toBe('abcdefghij')
    expect(chunks[1]).toBe('ijklmnopqr')
    expect(chunks[2]).toBe('qrstuvwxyz')
    expect(chunks[3]).toBe('yz')
    expect(chunks.length).toBe(4)
  })

  it('caps overlap to maxOverlapRatio and respects bounds', () => {
    const text = '1234567890abcdefghij'
    const chunks = splitTextIntoSlidingChunks(text, 8, 10, {
      minChunkSize: 4,
      maxChunkSize: 8,
      maxOverlapRatio: 0.25,
    })
    // size=8, maxOverlap=2 => stride=6 => starts at 0,6,12,18
    expect(chunks[0]).toBe('12345678')
    expect(chunks[1]).toBe('7890abcd')
    expect(chunks[2]).toBe('cdefghij')
    expect(chunks[3]).toBe('ij')
  })
})
