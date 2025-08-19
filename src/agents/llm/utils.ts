/*
  JSON抽出ユーティリティ: LLM出力から最初の完全なJSON(オブジェクト/配列)を安全に取り出す。
  - フェンス ```json ... ``` / ``` ... ``` を除去
  - 先頭から { または [ を検出し、対応する終端までバランスを取りながらスキャン
  - 文字列/エスケープを考慮
*/

export function extractFirstJsonChunk(text: string): string {
  const trimmed = text.trim()
  // コードフェンス除去
  const fenceMatch = trimmed.match(/```(?:json)?\n([\s\S]*?)```/i)
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
    console.debug('Initial JSON parse failed, trying balanced extraction', {
      error: jsonError instanceof Error ? jsonError.message : String(jsonError),
      contentPreview: text.slice(0, 100),
    })
  }

  const chunk = tryExtractBalanced(trimmed)
  if (chunk) return chunk

  // 最終的にJSONが見つからない場合の詳細エラー
  console.error(
    JSON.stringify({
      ts: new Date().toISOString(),
      level: 'error',
      service: 'llm-utils',
      operation: 'extractFirstJsonChunk',
      msg: 'LLMレスポンスから有効なJSONを抽出できませんでした。',
      contentPreview: text.slice(0, 300),
      contentLength: text.length,
    }),
  )
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
        console.debug('Balanced JSON candidate failed to parse', {
          error: balanceError instanceof Error ? balanceError.message : String(balanceError),
          candidatePreview: candidate.slice(0, 100),
        })
        return null
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
