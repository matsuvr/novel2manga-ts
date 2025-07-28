export interface ChunkInfo {
  index: number
  startPosition: number
  endPosition: number
  text: string
}

export function splitTextIntoChunks(
  text: string,
  chunkSize: number,
  overlapSize: number
): ChunkInfo[] {
  if (chunkSize <= 0) {
    throw new Error('チャンクサイズは0より大きい必要があります')
  }
  
  if (overlapSize < 0) {
    throw new Error('オーバーラップサイズは0以上である必要があります')
  }
  
  if (overlapSize >= chunkSize) {
    throw new Error('オーバーラップサイズはチャンクサイズより小さい必要があります')
  }
  
  const chunks: ChunkInfo[] = []
  const effectiveChunkSize = chunkSize - overlapSize
  let currentPosition = 0
  let chunkIndex = 0
  
  while (currentPosition < text.length) {
    const startPosition = currentPosition
    const endPosition = Math.min(currentPosition + chunkSize, text.length)
    const chunkText = text.substring(startPosition, endPosition)
    
    chunks.push({
      index: chunkIndex,
      startPosition,
      endPosition,
      text: chunkText
    })
    
    currentPosition += effectiveChunkSize
    chunkIndex++
  }
  
  return chunks
}