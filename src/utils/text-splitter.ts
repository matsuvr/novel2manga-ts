// Legacy sentence-aware splitter (kept for compatibility in other callsites)
export function splitTextIntoChunks(text: string, maxChunkSize: number = 2000): string[] {
  const chunks: string[] = []
  const sentences = text.split(/[。！？\n]/)
  let currentChunk = ''

  for (const sentence of sentences) {
    if (!sentence.trim()) continue

    const sentenceWithDelimiter = `${sentence}。`

    if ((currentChunk + sentenceWithDelimiter).length > maxChunkSize) {
      if (currentChunk) {
        chunks.push(currentChunk.trim())
        currentChunk = sentenceWithDelimiter
      } else {
        // 1文が長すぎる場合は強制的に分割
        const words = sentenceWithDelimiter.split('')
        let tempChunk = ''

        for (const word of words) {
          if ((tempChunk + word).length > maxChunkSize) {
            chunks.push(tempChunk)
            tempChunk = word
          } else {
            tempChunk += word
          }
        }

        if (tempChunk) {
          currentChunk = tempChunk
        }
      }
    } else {
      currentChunk += sentenceWithDelimiter
    }
  }

  if (currentChunk.trim()) {
    chunks.push(currentChunk.trim())
  }

  return chunks
}

// New: mechanical fixed-size sliding window splitter with overlap
// - Uses character counts, no linguistic boundaries
// - Ensures 0 < overlap < chunkSize
export function splitTextIntoSlidingChunks(
  text: string,
  chunkSize: number,
  overlap: number,
  bounds?: { minChunkSize?: number; maxChunkSize?: number; maxOverlapRatio?: number },
): string[] {
  const len = text.length
  if (len === 0) return []

  const minSize = Math.max(1, bounds?.minChunkSize ?? 1)
  const maxSize = Math.max(minSize, bounds?.maxChunkSize ?? Math.max(minSize, chunkSize))
  const maxOverlapRatio = bounds?.maxOverlapRatio ?? 0.5

  const size = Math.max(minSize, Math.min(chunkSize, maxSize))
  let ov = Math.max(0, Math.min(overlap, Math.floor(size * maxOverlapRatio)))
  if (ov >= size) ov = Math.floor(size * maxOverlapRatio)
  const stride = Math.max(1, size - ov)

  const chunks: string[] = []
  for (let start = 0; start < len; start += stride) {
    const end = Math.min(len, start + size)
    chunks.push(text.slice(start, end))
  }
  return chunks
}

export function generateChunkFileName(jobId: string, index: number): string {
  return `${jobId}_${String(index + 1).padStart(3, '0')}.txt`
}
