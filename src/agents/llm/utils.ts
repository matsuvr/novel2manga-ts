import { getLogger } from '@/infrastructure/logging/logger'
/*
  JSON抽出ユーティリティ: LLM出力から最初の完全なJSON(オブジェクト/配列)を安全に取り出す。
  - フェンス ```json ... ``` / ``` ... ``` を除去（CRLFや言語タグ/空白のゆらぎにも対応）
  - 先頭から { または [ を検出し、対応する終端までバランスを取りながらスキャン
  - 文字列/エスケープを考慮
*/

export function extractFirstJsonChunk(text: string): string {
  // 正規化: CRLF -> LF、BOM除去
  const normalized = text.replace(/\uFEFF/g, '').replace(/\r\n?|\n/g, '\n')
  const trimmed = normalized.trim()

  // まずは手続き的に最初のコードフェンスを展開して中身を試す
  const unwrapped = unwrapFirstCodeFence(trimmed)
  if (unwrapped) {
    const candidate = tryExtractBalanced(unwrapped)
    if (candidate) return candidate
  }

  // 互換: 旧来の単純なフェンス正規表現でも試す（"``` json" や CR を許容）
  // 終了フェンスがない場合も考慮した改良版
  const fenceMatch = trimmed.match(/```[ \t]*(?:jsonc?|json)?[ \t]*\n([\s\S]*?)(?:\n?```|$)/i)
  if (fenceMatch?.[1]) {
    const inner = fenceMatch[1].trim()
    const chunk = tryExtractBalanced(inner)
    if (chunk) return chunk
  }

  // そのままJSONか試す
  try {
    JSON.parse(trimmed)
    return trimmed
  } catch (jsonError) {
    // Invalid JSON, continue to try extracting balanced JSON
    getLogger()
      .withContext({ service: 'llm-utils', operation: 'extractFirstJsonChunk' })
      .debug('Initial JSON parse failed, trying balanced extraction', {
        error: jsonError instanceof Error ? jsonError.message : String(jsonError),
        contentPreview: text.slice(0, 100),
      })
  }

  const chunk = tryExtractBalanced(trimmed)
  if (chunk) return chunk

  // 最終的にJSONが見つからない場合の詳細エラー
  getLogger()
    .withContext({ service: 'llm-utils', operation: 'extractFirstJsonChunk' })
    .error('Failed to extract valid JSON from LLM response', {
      contentPreview: text.slice(0, 300),
      contentLength: text.length,
      hasCodeFence: text.includes('```'),
      jsonStartPos: findFirstJsonStart(text),
      trimmedPreview: trimmed.slice(0, 200),
    })
  throw new Error('LLM response does not contain a valid JSON object/array')
}

/**
 * Sanitizes LLM JSON responses by removing empty strings from arrays.
 * This handles cases where LLMs generate malformed arrays with empty string elements.
 */
function sanitizeLlmJsonResponse(obj: unknown): unknown {
  if (Array.isArray(obj)) {
    return obj
      .filter((item) => item !== '' && item !== null && item !== undefined)
      .map(sanitizeLlmJsonResponse)
  }

  if (obj && typeof obj === 'object') {
    const result: Record<string, unknown> = {}
    for (const [key, value] of Object.entries(obj)) {
      result[key] = sanitizeLlmJsonResponse(value)
    }
    return result
  }

  return obj
}

export { sanitizeLlmJsonResponse }

// 最初に現れるコードフェンス ``` ... ``` を見つけて中身を返す。
// 開始フェンス行: ```[lang?][spaces]\n
// 終了フェンス: 次に現れる ```
function unwrapFirstCodeFence(text: string): string | null {
  const open = text.indexOf('```')
  if (open === -1) return null
  // JSON開始がフェンスより前にある場合はスキップ（フェンスではない）
  const jsonStart = findFirstJsonStart(text)
  if (jsonStart !== -1 && jsonStart < open) return null

  // 開始行の改行を探す（言語タグや空白をスキップ）
  const firstNewline = text.indexOf('\n', open)
  if (firstNewline === -1) return null

  // 終了フェンスを探す
  const close = text.indexOf('```', firstNewline + 1)
  if (close === -1) {
    // 終了フェンスが無い場合でも、開始フェンス以降の本文を返す
    const tail = text.slice(firstNewline + 1)
    // 長いレスポンスの場合、有効なJSONが含まれているか確認
    const trimmedTail = tail.trim()
    if (trimmedTail.length > 0) {
      return trimmedTail
    }
    return null
  }

  const inner = text.slice(firstNewline + 1, close)
  return inner.trim()
}

function tryExtractBalanced(text: string): string | null {
  const startIdx = findFirstJsonStart(text)
  if (startIdx < 0) return null

  const startChar = text[startIdx]
  const endChar = startChar === '{' ? '}' : ']'
  let depth = 0
  let inStr = false
  let strQuote: '"' | "'" | null = null
  let escaped = false

  for (let i = startIdx; i < text.length; i++) {
    const ch = text[i]
    if (inStr) {
      if (escaped) {
        escaped = false
      } else if (ch === '\\') {
        escaped = true
      } else if (ch === strQuote) {
        inStr = false
        strQuote = null
      }
      continue
    }
    if (ch === '"' || ch === "'") {
      inStr = true
      strQuote = ch as '"' | "'"
      continue
    }
    if (ch === startChar) depth++
    else if (ch === endChar) depth--
    if (depth === 0) {
      const candidate = text.slice(startIdx, i + 1)
      try {
        JSON.parse(candidate)
        return candidate
      } catch (balanceError) {
        getLogger()
          .withContext({ service: 'llm-utils', operation: 'extractFirstJsonChunk' })
          .debug('Balanced JSON candidate failed to parse', {
            error: balanceError instanceof Error ? balanceError.message : String(balanceError),
            candidatePreview: candidate.slice(0, 100),
          })
        // JSONC 風（コメント/末尾カンマ）を最小限サニタイズして再試行
        const sanitized = sanitizeJsonLike(candidate)
        try {
          JSON.parse(sanitized)
          return sanitized
        } catch {
          return null
        }
      }
    }
  }
  return null
}

function findFirstJsonStart(text: string): number {
  const idxObj = text.indexOf('{')
  const idxArr = text.indexOf('[')
  if (idxObj === -1) return idxArr
  if (idxArr === -1) return idxObj
  return Math.min(idxObj, idxArr)
}

// JSONC 風の入力から、コメントと末尾カンマを除去して厳密JSONに近づける。
// 文字列リテラルは厳密に保持し、コメントと配列/オブジェクト終端直前のカンマのみ除去する。
function sanitizeJsonLike(text: string): string {
  let out = ''
  let inStr = false
  let strQuote: '"' | "'" | null = null
  let escaped = false
  let inLineComment = false
  let inBlockComment = false

  const isWs = (c: string) => c === ' ' || c === '\n' || c === '\t' || c === '\r'

  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    const next = i + 1 < text.length ? text[i + 1] : ''

    // ブロックコメント終端 */
    if (inBlockComment) {
      if (ch === '*' && next === '/') {
        inBlockComment = false
        i++
      }
      continue
    }
    // 行コメント終端 \n
    if (inLineComment) {
      if (ch === '\n') {
        inLineComment = false
        out += ch
      }
      continue
    }

    // 文字列内処理
    if (inStr) {
      out += ch
      if (escaped) {
        escaped = false
      } else if (ch === '\\') {
        escaped = true
      } else if (ch === strQuote) {
        inStr = false
        strQuote = null
      }
      continue
    }

    // ここからは文字列外
    // コメント開始検出
    if (ch === '/' && next === '/') {
      inLineComment = true
      i++
      continue
    }
    if (ch === '/' && next === '*') {
      inBlockComment = true
      i++
      continue
    }

    // 末尾カンマの削除: カンマの直後に空白/改行を飛ばした次の非空白が ] or } の場合、スキップ
    if (ch === ',') {
      let j = i + 1
      while (j < text.length && isWs(text[j])) j++
      const ahead = j < text.length ? text[j] : ''
      if (ahead === ']' || ahead === '}') {
        // カンマを出力しない（スキップ）
        continue
      }
      out += ch
      continue
    }

    // 文字列開始
    if (ch === '"' || ch === "'") {
      inStr = true
      strQuote = ch as '"' | "'"
      out += ch
      continue
    }

    out += ch
  }

  return out
}
