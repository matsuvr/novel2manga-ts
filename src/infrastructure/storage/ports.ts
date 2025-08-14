import { StorageFactory, StorageKeys } from '@/utils/storage'

export interface ChunkStoragePort {
  getChunk(jobId: string, index: number): Promise<{ text: string } | null>
  putChunk(jobId: string, index: number, content: string): Promise<string>
}

export interface AnalysisStoragePort {
  getAnalysis(jobId: string, index: number): Promise<{ text: string } | null>
  putAnalysis(jobId: string, index: number, json: string): Promise<string>
}

export interface NovelTextStoragePort {
  getNovelText(novelId: string): Promise<{ text: string } | null>
  putNovelText(novelId: string, json: string): Promise<string>
}

export interface LayoutStoragePort {
  putEpisodeLayout(jobId: string, episodeNumber: number, yaml: string): Promise<string>
  getEpisodeLayout(jobId: string, episodeNumber: number): Promise<string | null>
}

export interface RenderStoragePort {
  putPageRender(
    jobId: string,
    episodeNumber: number,
    pageNumber: number,
    data: Buffer,
    meta?: Record<string, string | number>,
  ): Promise<string>
  putPageThumbnail(
    jobId: string,
    episodeNumber: number,
    pageNumber: number,
    data: Buffer,
    meta?: Record<string, string | number>,
  ): Promise<string>
  getPageRender(jobId: string, episodeNumber: number, pageNumber: number): Promise<string | null>
}

export interface OutputStoragePort {
  putExport(
    jobId: string,
    kind: 'pdf' | 'zip',
    data: Buffer,
    meta?: Record<string, string | number>,
  ): Promise<string>
  getExport(path: string): Promise<{ text: string } | null>
}

export interface StoragePorts {
  novel: NovelTextStoragePort
  chunk: ChunkStoragePort
  analysis: AnalysisStoragePort
  layout: LayoutStoragePort
  render: RenderStoragePort
  output: OutputStoragePort
}

export function getStoragePorts(): StoragePorts {
  return {
    novel: {
      async getNovelText(novelId) {
        const storage = await StorageFactory.getNovelStorage()
        const key = `${novelId}.json`
        const obj = await storage.get(key)
        if (!obj) return null
        return { text: obj.text }
      },
      async putNovelText(novelId, json) {
        const storage = await StorageFactory.getNovelStorage()
        const key = `${novelId}.json`
        await storage.put(key, json)
        return key
      },
    },
    chunk: {
      async getChunk(jobId, index) {
        const storage = await StorageFactory.getChunkStorage()
        const key = StorageKeys.chunk(jobId, index)
        const obj = await storage.get(key)
        if (!obj) return null
        return { text: obj.text }
      },
      async putChunk(jobId, index, content) {
        const storage = await StorageFactory.getChunkStorage()
        const key = StorageKeys.chunk(jobId, index)
        await storage.put(key, content)
        return key
      },
    },
    analysis: {
      async getAnalysis(jobId, index) {
        const storage = await StorageFactory.getAnalysisStorage()
        const key = StorageKeys.chunkAnalysis(jobId, index)
        const obj = await storage.get(key)
        if (!obj) return null
        return { text: obj.text }
      },
      async putAnalysis(jobId, index, json) {
        const storage = await StorageFactory.getAnalysisStorage()
        const key = StorageKeys.chunkAnalysis(jobId, index)
        await storage.put(key, json)
        return key
      },
    },
    layout: {
      async putEpisodeLayout(jobId, episodeNumber, yaml) {
        const storage = await StorageFactory.getLayoutStorage()
        const key = StorageKeys.episodeLayout(jobId, episodeNumber)
        await storage.put(key, yaml)
        return key
      },
      async getEpisodeLayout(jobId, episodeNumber) {
        const storage = await StorageFactory.getLayoutStorage()
        const key = StorageKeys.episodeLayout(jobId, episodeNumber)
        const obj = await storage.get(key)
        return obj?.text ?? null
      },
    },
    render: {
      async putPageRender(jobId, episodeNumber, pageNumber, data, meta) {
        const storage = await StorageFactory.getRenderStorage()
        const key = StorageKeys.pageRender(jobId, episodeNumber, pageNumber)
        await storage.put(key, data, {
          contentType: 'image/png',
          jobId,
          episodeNumber: String(episodeNumber),
          pageNumber: String(pageNumber),
          ...(meta ?? {}),
        })
        return key
      },
      async putPageThumbnail(jobId, episodeNumber, pageNumber, data, meta) {
        const storage = await StorageFactory.getRenderStorage()
        const key = StorageKeys.pageThumbnail(jobId, episodeNumber, pageNumber)
        await storage.put(key, data, {
          contentType: 'image/jpeg',
          jobId,
          episodeNumber: String(episodeNumber),
          pageNumber: String(pageNumber),
          type: 'thumbnail',
          ...(meta ?? {}),
        })
        return key
      },
      async getPageRender(jobId, episodeNumber, pageNumber) {
        const storage = await StorageFactory.getRenderStorage()
        const key = StorageKeys.pageRender(jobId, episodeNumber, pageNumber)
        const obj = await storage.get(key)
        return obj?.text ?? null
      },
    },
    output: {
      async putExport(jobId, kind, data, meta) {
        const storage = await StorageFactory.getOutputStorage()
        const key = StorageKeys.exportOutput(jobId, kind === 'pdf' ? 'pdf' : 'zip')
        await storage.put(key, data, {
          contentType: kind === 'pdf' ? 'application/pdf' : 'application/zip',
          jobId,
          type: kind === 'pdf' ? 'pdf_export' : 'zip_export',
          ...(meta ?? {}),
        })
        return key
      },
      async getExport(path) {
        const storage = await StorageFactory.getOutputStorage()
        const obj = await storage.get(path)
        return obj ? { text: obj.text } : null
      },
    },
  }
}
