import { describe, expect, it } from 'vitest'
import { sanitizeLlmJsonResponse } from '@/agents/llm/utils'

describe('sanitizeLlmJsonResponse', () => {
  it('should remove empty strings from arrays', () => {
    const input = {
      pages: [
        { pageNumber: 1, content: 'Page 1' },
        '',
        { pageNumber: 2, content: 'Page 2' },
        '',
        { pageNumber: 3, content: 'Page 3' },
      ],
    }

    const expected = {
      pages: [
        { pageNumber: 1, content: 'Page 1' },
        { pageNumber: 2, content: 'Page 2' },
        { pageNumber: 3, content: 'Page 3' },
      ],
    }

    const result = sanitizeLlmJsonResponse(input)
    expect(result).toEqual(expected)
  })

  it('should handle nested arrays with empty strings', () => {
    const input = {
      data: {
        items: ['valid', '', null, undefined, 'another'],
      },
    }

    const expected = {
      data: {
        items: ['valid', 'another'],
      },
    }

    const result = sanitizeLlmJsonResponse(input)
    expect(result).toEqual(expected)
  })

  it('should preserve valid data unchanged', () => {
    const input = {
      pages: [
        { pageNumber: 1, content: 'Page 1' },
        { pageNumber: 2, content: 'Page 2' },
      ],
      title: 'Valid Title',
    }

    const result = sanitizeLlmJsonResponse(input)
    expect(result).toEqual(input)
  })

  it('should handle arrays with only empty values', () => {
    const input = {
      emptyArray: ['', null, undefined],
      validArray: ['valid'],
    }

    const expected = {
      emptyArray: [],
      validArray: ['valid'],
    }

    const result = sanitizeLlmJsonResponse(input)
    expect(result).toEqual(expected)
  })
})
