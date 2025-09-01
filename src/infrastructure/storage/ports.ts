import { getLogger } from '@/infrastructure/logging/logger'
import { executeStorageWithTracking } from '@/services/application/transaction-manager'
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
  putEpisodeLayout(jobId: string, episodeNumber: number, json: string): Promise<string>
  getEpisodeLayout(jobId: string, episodeNumber: number): Promise<string | null>
  // Incremental progress checkpoint for atomic resumes
  putEpisodeLayoutProgress(jobId: string, episodeNumber: number, json: string): Promise<string>
  getEpisodeLayoutProgress(jobId: string, episodeNumber: number): Promise<string | null>
}

export interface EpisodeTextStoragePort {
  putEpisodeText(jobId: string, episodeNumber: number, text: string): Promise<string>
  getEpisodeText(jobId: string, episodeNumber: number): Promise<string | null>
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
    userId: string,
    jobId: string,
    kind: 'pdf' | 'zip',
    data: Buffer,
    meta?: Record<string, string | number>,
  ): Promise<string>
  getExport(path: string): Promise<{ text: string } | null>
  deleteExport(path: string): Promise<void>
}

export interface StoragePorts {
  novel: NovelTextStoragePort
  chunk: ChunkStoragePort
  analysis: AnalysisStoragePort
  layout: LayoutStoragePort
  episodeText: EpisodeTextStoragePort
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

        await executeStorageWithTracking({
          storage,
          key,
          value: json,
          tracking: {
            filePath: key,
            fileCategory: 'original',
            fileType: 'json',
            novelId,
            jobId: undefined,
            mimeType: 'application/json; charset=utf-8',
          },
        })

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

        await executeStorageWithTracking({
          storage,
          key,
          value: content,
          tracking: {
            filePath: key,
            fileCategory: 'chunk',
            fileType: 'txt',
            novelId: undefined,
            jobId,
            mimeType: 'text/plain; charset=utf-8',
          },
        })

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

        await executeStorageWithTracking({
          storage,
          key,
          value: json,
          tracking: {
            filePath: key,
            fileCategory: 'analysis',
            fileType: 'json',
            novelId: undefined,
            jobId,
            mimeType: 'application/json; charset=utf-8',
          },
        })

        return key
      },
    },
    layout: {
      async putEpisodeLayout(jobId, episodeNumber, json) {
        const storage = await StorageFactory.getLayoutStorage()
        const key = StorageKeys.episodeLayout(jobId, episodeNumber)

        await executeStorageWithTracking({
          storage,
          key,
          value: json,
          tracking: {
            filePath: key,
            fileCategory: 'layout',
            fileType: 'json',
            novelId: undefined,
            jobId,
            mimeType: 'application/json; charset=utf-8',
          },
        })

        return key
      },
      async getEpisodeLayout(jobId, episodeNumber) {
        const storage = await StorageFactory.getLayoutStorage()
        const key = StorageKeys.episodeLayout(jobId, episodeNumber)
        const obj = await storage.get(key)
        // Add migration monitoring - MEDIUM PRIORITY
        getLogger()
          .withContext({ service: 'storage-ports' })
          .info('Layout format migration: using JSON format', {
            jobId,
            episodeNumber,
          })
        return obj?.text ?? null
      },
      async putEpisodeLayoutProgress(jobId, episodeNumber, json) {
        const storage = await StorageFactory.getLayoutStorage()
        // Some tests mock StorageKeys partially. Fallback to string template if function missing.
        const keyFn = (StorageKeys as unknown as Record<string, unknown>).episodeLayoutProgress as
          | undefined
          | ((jobId: string, ep: number) => string)
        const key =
          typeof keyFn === 'function'
            ? keyFn(jobId, episodeNumber)
            : `${jobId}/episode_${episodeNumber}.progress.json`

        await executeStorageWithTracking({
          storage,
          key,
          value: json,
          tracking: {
            filePath: key,
            fileCategory: 'metadata',
            fileType: 'json',
            novelId: undefined,
            jobId,
            mimeType: 'application/json; charset=utf-8',
          },
        })

        return key
      },
      async getEpisodeLayoutProgress(jobId, episodeNumber) {
        const storage = await StorageFactory.getLayoutStorage()
        const keyFn = (StorageKeys as unknown as Record<string, unknown>).episodeLayoutProgress as
          | undefined
          | ((jobId: string, ep: number) => string)
        const key =
          typeof keyFn === 'function'
            ? keyFn(jobId, episodeNumber)
            : `${jobId}/episode_${episodeNumber}.progress.json`
        const obj = await storage.get(key)
        return obj?.text ?? null
      },
    },
    episodeText: {
      async putEpisodeText(jobId, episodeNumber, text) {
        const storage = await StorageFactory.getAnalysisStorage()
        // Some tests mock StorageKeys partially. Fallback to string template if function missing.
        const keyFn = (StorageKeys as unknown as Record<string, unknown>).episodeText as
          | undefined
          | ((jobId: string, ep: number) => string)
        const key =
          typeof keyFn === 'function'
            ? keyFn(jobId, episodeNumber)
            : `${jobId}/episode_${episodeNumber}.txt`

        await executeStorageWithTracking({
          storage,
          key,
          value: text,
          metadata: {
            contentType: 'text/plain; charset=utf-8',
            jobId,
            episode: String(episodeNumber),
          },
          tracking: {
            filePath: key,
            fileCategory: 'episode',
            fileType: 'txt',
            novelId: undefined,
            jobId,
            mimeType: 'text/plain; charset=utf-8',
          },
        })

        return key
      },
      async getEpisodeText(jobId, episodeNumber) {
        const storage = await StorageFactory.getAnalysisStorage()
        const keyFn = (StorageKeys as unknown as Record<string, unknown>).episodeText as
          | undefined
          | ((jobId: string, ep: number) => string)
        const key =
          typeof keyFn === 'function'
            ? keyFn(jobId, episodeNumber)
            : `${jobId}/episode_${episodeNumber}.txt`
        const obj = await storage.get(key)
        return obj?.text ?? null
      },
    },
    render: {
      async putPageRender(jobId, episodeNumber, pageNumber, data, meta) {
        const storage = await StorageFactory.getRenderStorage()
        const key = StorageKeys.pageRender(jobId, episodeNumber, pageNumber)

        await executeStorageWithTracking({
          storage,
          key,
          value: data,
          metadata: {
            contentType: 'image/png',
            jobId,
            episodeNumber: String(episodeNumber),
            pageNumber: String(pageNumber),
            ...(meta ?? {}),
          },
          tracking: {
            filePath: key,
            fileCategory: 'render',
            fileType: 'png',
            novelId: undefined,
            jobId,
            mimeType: 'image/png',
          },
        })

        return key
      },
      async putPageThumbnail(jobId, episodeNumber, pageNumber, data, meta) {
        const storage = await StorageFactory.getRenderStorage()
        const key = StorageKeys.pageThumbnail(jobId, episodeNumber, pageNumber)

        await executeStorageWithTracking({
          storage,
          key,
          value: data,
          metadata: {
            contentType: 'image/jpeg',
            jobId,
            episodeNumber: String(episodeNumber),
            pageNumber: String(pageNumber),
            type: 'thumbnail',
            ...(meta ?? {}),
          },
          tracking: {
            filePath: key,
            fileCategory: 'render',
            fileType: 'jpg',
            novelId: undefined,
            jobId,
            mimeType: 'image/jpeg',
          },
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
      async putExport(userId, jobId, kind, data, meta) {
        const storage = await StorageFactory.getOutputStorage()
        const key = StorageKeys.exportOutput(
          userId,
          jobId,
          kind === 'pdf' ? 'pdf' : 'zip',
        )

        await executeStorageWithTracking({
          storage,
          key,
          value: data,
          metadata: {
            contentType: kind === 'pdf' ? 'application/pdf' : 'application/zip',
            userId,
            jobId,
            type: kind === 'pdf' ? 'pdf_export' : 'zip_export',
            ...(meta ?? {}),
          },
          tracking: {
            filePath: key,
            fileCategory: 'output',
            fileType: kind === 'pdf' ? 'pdf' : 'zip',
            novelId: undefined,
            jobId,
            mimeType: kind === 'pdf' ? 'application/pdf' : 'application/zip',
          },
        })

        return key
      },
      async getExport(path) {
        const storage = await StorageFactory.getOutputStorage()
        const obj = await storage.get(path)
        return obj ? { text: obj.text } : null
      },
      async deleteExport(path) {
        const storage = await StorageFactory.getOutputStorage()
        await storage.delete(path)
      },
    },
  }
}
