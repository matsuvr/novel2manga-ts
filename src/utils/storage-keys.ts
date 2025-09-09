function validateId(id: string, label: string): void {
  if (typeof id !== 'string' || id.length === 0) {
    throw new Error(`StorageKeys: ${label} is empty`)
  }
  // 先頭 ../ や /、含まれる .. セグメント、許可外文字を拒否
  if (id.includes('..') || id.startsWith('/') || /[^a-zA-Z0-9_-]/.test(id)) {
    throw new Error(`StorageKeys: invalid ${label} value`)
  }
  // 追加の攻撃パターン: null byte / %00 の混入を拒否（レビュー指摘）
  if (id.includes('\0') || /%00/i.test(id)) {
    throw new Error(`StorageKeys: null bytes not allowed in ${label}`)
  }
  // URLエンコードされた入力は禁止（%エスケープを含むと decode で変化する）
  try {
    if (decodeURIComponent(id) !== id) {
      throw new Error(`StorageKeys: encoded characters not allowed in ${label}`)
    }
  } catch {
    throw new Error(`StorageKeys: invalid percent-encoding in ${label}`)
  }
}

export const StorageKeys = {
  novel: (uuid: string) => {
    validateId(uuid, 'uuid')
    // Fixed: Remove duplicate 'novels/' prefix since getNovelStorage() already provides baseDir = novels
    return `${uuid}.json`
  },
  chunk: (jobId: string, index: number) => {
    validateId(jobId, 'jobId')
    return `${jobId}/chunk_${index}.txt`
  },
  chunkAnalysis: (jobId: string, index: number) => {
    validateId(jobId, 'jobId')
    return `${jobId}/chunk_${index}.json`
  },
  integratedAnalysis: (jobId: string) => {
    validateId(jobId, 'jobId')
    return `${jobId}/integrated.json`
  },
  episodeBoundaries: (jobId: string) => {
    validateId(jobId, 'jobId')
    return `${jobId}/episodes.json`
  },
  episodeLayout: (jobId: string, episodeNumber: number) => {
    validateId(jobId, 'jobId')
    return `${jobId}/episode_${episodeNumber}.json`
  },
  episodeLayoutProgress: (jobId: string, episodeNumber: number) => {
    validateId(jobId, 'jobId')
    return `${jobId}/episode_${episodeNumber}.progress.json`
  },
  episodeText: (jobId: string, episodeNumber: number) => {
    validateId(jobId, 'jobId')
    return `${jobId}/episode_${episodeNumber}.txt`
  },
  pageRender: (jobId: string, episodeNumber: number, pageNumber: number) => {
    validateId(jobId, 'jobId')
    return `${jobId}/episode_${episodeNumber}/page_${pageNumber}.png`
  },
  pageThumbnail: (jobId: string, episodeNumber: number, pageNumber: number) => {
    validateId(jobId, 'jobId')
    return `${jobId}/episode_${episodeNumber}/thumbnails/page_${pageNumber}_thumb.png`
  },
  exportOutput: (userId: string, jobId: string, format: string) => {
    validateId(userId, 'userId')
    validateId(jobId, 'jobId')
    if (!/^[a-zA-Z0-9]+$/.test(format)) {
      throw new Error('StorageKeys: invalid export format')
    }
    return `results/${userId}/${jobId}.${format}`
  },
  renderStatus: (jobId: string, episodeNumber: number, pageNumber: number) => {
    validateId(jobId, 'jobId')
    return `${jobId}/episode_${episodeNumber}/page_${pageNumber}.json`
  },
} as const

/**
 * Convert legacy 'r2://'-style paths or simple storage paths into a
 * storage-relative path used by LocalFileStorage. This intentionally does
 * not return absolute filesystem paths; callers should pass the returned
 * value to a Storage implementation obtained from StorageFactory.
 */
export function toStoragePath(input: string): string {
  if (!input || typeof input !== 'string') throw new Error('toStoragePath: invalid input')
  // Allow inputs like 'r2://manifests/abc.json' or 'manifests/abc.json'
  const normalized = input.startsWith('r2://') ? input.replace(/^r2:\/\/\//, '') : input
  // Prevent traversal and enforce allowed characters (lowercase, digits, /, -, _ and dot)
  if (normalized.includes('..') || normalized.startsWith('/') || /[^a-z0-9/_.-]/i.test(normalized)) {
    throw new Error('toStoragePath: invalid storage path')
  }
  return normalized
}

// Additional JSON-first keys for new pipeline artifacts
export const JsonStorageKeys = {
  scriptChunk: (jobId: string, index: number) => {
    validateId(jobId, 'jobId')
    return `${jobId}/script_chunk_${index}.json`
  },
  scriptCombined: (jobId: string) => {
    validateId(jobId, 'jobId')
    return `${jobId}/script_combined.json`
  },
  fullPages: (jobId: string) => {
    validateId(jobId, 'jobId')
    return `${jobId}/full_pages.json`
  },
  characterMemoryFull: (jobId: string) => {
    validateId(jobId, 'jobId')
    return `${jobId}/character_memory.full.json`
  },
  characterMemoryPrompt: (jobId: string) => {
    validateId(jobId, 'jobId')
    return `${jobId}/character_memory.prompt.json`
  },
  // episodeBundling removed - replaced with episode break estimation
} as const
