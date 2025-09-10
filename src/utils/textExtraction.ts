/**
 * Utility functions for text extraction and token estimation
 */

/**
 * Extract text content from various message formats used in LLM interactions
 */
export function extractTextFromMessage(contentsOrRequest: string | unknown[] | Record<string, unknown>): string {
  let text = ''

  if (typeof contentsOrRequest === 'string') {
    text = contentsOrRequest
  } else if (Array.isArray(contentsOrRequest)) {
    // Extract text from message parts
    text = contentsOrRequest
      .map((content) => {
        if (typeof content === 'object' && content !== null && 'parts' in content) {
          const parts = (content as Record<string, unknown>).parts as unknown[]
          return extractTextFromParts(parts)
        }
        return ''
      })
      .join('')
  } else if (typeof contentsOrRequest === 'object' && contentsOrRequest !== null && 'contents' in contentsOrRequest) {
    // Handle request format with contents field
    const contents = (contentsOrRequest as Record<string, unknown>).contents as unknown[]
    text = contents
      .map((content) => {
        if (typeof content === 'object' && content !== null && 'parts' in content) {
          const parts = (content as Record<string, unknown>).parts as unknown[]
          return extractTextFromParts(parts)
        }
        return ''
      })
      .join('')
  } else {
    text = String(contentsOrRequest)
  }

  return text
}

/**
 * Extract text from message parts array
 */
function extractTextFromParts(parts: unknown[]): string {
  if (!parts || !Array.isArray(parts)) return ''

  return parts
    .map((part) => {
      if (typeof part === 'object' && part !== null && 'text' in part) {
        return (part as Record<string, unknown>).text as string || ''
      }
      return ''
    })
    .join('')
}

/**
 * Estimate token count for text content
 * Uses simple heuristics: 1 char = 1 token for non-English, 4 chars = 1 token for English
 */
export function estimateTokenCount(text: string): number {
  if (!text) return 0

  // Count English characters (letters and spaces)
  const englishChars = (text.match(/[a-zA-Z\s]/g) || []).length
  // Count other characters (Japanese, Chinese, Korean, symbols, etc.)
  const otherChars = text.length - englishChars

  // English: approximately 4 characters per token
  // Other languages (CJK, etc.): approximately 1 character per token
  return Math.ceil(englishChars / 4) + otherChars
}

/**
 * Check if input represents empty or invalid content
 */
export function isEmptyContent(contentsOrRequest: string | unknown[] | Record<string, unknown> | null | undefined): boolean {
  return !contentsOrRequest ||
         contentsOrRequest === null ||
         contentsOrRequest === undefined ||
         (typeof contentsOrRequest === 'string' && contentsOrRequest.trim() === '') ||
         (Array.isArray(contentsOrRequest) && contentsOrRequest.length === 0) ||
         (typeof contentsOrRequest === 'object' && contentsOrRequest !== null && Object.keys(contentsOrRequest).length === 0)
}
