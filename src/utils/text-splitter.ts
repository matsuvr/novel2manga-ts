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

export function generateChunkFileName(jobId: string, index: number): string {
  return `${jobId}_${String(index + 1).padStart(3, '0')}.txt`
}
