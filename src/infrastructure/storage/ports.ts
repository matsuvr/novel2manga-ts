import { getLogger } from '@/infrastructure/logging/logger'
import { executeStorageWithTracking } from '@/services/application/transaction-manager'
import * as StorageUtil from '@/utils/storage'

export interface ChunkStoragePort {
  getChunk(novelId: string, jobId: string, index: number): Promise<{ text: string } | null>
  putChunk(novelId: string, jobId: string, index: number, content: string): Promise<string>
}

export interface AnalysisStoragePort {
  getAnalysis(novelId: string, jobId: string, index: number): Promise<{ text: string } | null>
  putAnalysis(novelId: string, jobId: string, index: number, json: string): Promise<string>
}

export interface NovelTextStoragePort {
  getNovelText(novelId: string): Promise<{ text: string } | null>
  putNovelText(novelId: string, json: string): Promise<string>
}

export interface LayoutStoragePort {
  putEpisodeLayout(novelId: string, jobId: string, episodeNumber: number, json: string): Promise<string>
  getEpisodeLayout(novelId: string, jobId: string, episodeNumber: number): Promise<string | null>
  // Incremental progress checkpoint for atomic resumes
  putEpisodeLayoutProgress(
    novelId: string,
    jobId: string,
    episodeNumber: number,
    json: string,
  ): Promise<string>
  getEpisodeLayoutProgress(
    novelId: string,
    jobId: string,
    episodeNumber: number,
  ): Promise<string | null>
}

export interface EpisodeTextStoragePort {
  putEpisodeText(novelId: string, jobId: string, episodeNumber: number, text: string): Promise<string>
  getEpisodeText(novelId: string, jobId: string, episodeNumber: number): Promise<string | null>
}

export interface CharacterMemoryStoragePort {
  putFull(novelId: string, jobId: string, json: string): Promise<string>
  getFull(novelId: string, jobId: string): Promise<string | null>
  putPrompt(novelId: string, jobId: string, json: string): Promise<string>
  getPrompt(novelId: string, jobId: string): Promise<string | null>
}

export interface RenderStoragePort {
  putPageRender(
    novelId: string,
    jobId: string,
    episodeNumber: number,
    pageNumber: number,
    data: Buffer,
    meta?: Record<string, string | number>,
  ): Promise<string>
  putPageThumbnail(
    novelId: string,
    jobId: string,
    episodeNumber: number,
    pageNumber: number,
    data: Buffer,
    meta?: Record<string, string | number>,
  ): Promise<string>
  getPageRender(
    novelId: string,
    jobId: string,
    episodeNumber: number,
    pageNumber: number,
  ): Promise<string | null>
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
  characterMemory: CharacterMemoryStoragePort
}

export function getStoragePorts(): StoragePorts {
  // ローカルファイルストレージのディレクトリ構造を事前に用意（冪等）
  // テスト・開発環境の安定性確保
  try {
    // 安全に起動（テストの部分モック環境では未定義のことがある）
    void Promise.resolve(StorageUtil.ensureLocalStorageStructure?.()).catch(() => {
      // no-op: 事前ディレクトリ作成の失敗は本処理に影響しない
    })
  } catch (_err) {
    // no-op: optional 呼び出しの同期例外を明示的に無視
  }
  return {
    novel: {
      async getNovelText(novelId) {
        const storage = await StorageUtil.StorageFactory.getNovelStorage()
        const key = `${novelId}.json`
        const obj = await storage.get(key)
        if (!obj) return null
        return { text: obj.text }
      },
      async putNovelText(novelId, json) {
        const storage = await StorageUtil.StorageFactory.getNovelStorage()
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
      async getChunk(novelId, jobId, index) {
        const storage = await StorageUtil.StorageFactory.getChunkStorage()
        const key = StorageUtil.StorageKeys.chunk({ novelId, jobId, index })
        const obj = await storage.get(key)
        if (!obj) return null
        return { text: obj.text }
      },
      async putChunk(novelId, jobId, index, content) {
        const storage = await StorageUtil.StorageFactory.getChunkStorage()
        const key = StorageUtil.StorageKeys.chunk({ novelId, jobId, index })

        await executeStorageWithTracking({
          storage,
          key,
          value: content,
          tracking: {
            filePath: key,
            fileCategory: 'chunk',
            fileType: 'txt',
            novelId,
            jobId,
            mimeType: 'text/plain; charset=utf-8',
          },
        })

        return key
      },
    },
    analysis: {
      async getAnalysis(novelId, jobId, index) {
        const storage = await StorageUtil.StorageFactory.getAnalysisStorage()
        const key = StorageUtil.StorageKeys.chunkAnalysis({ novelId, jobId, index })
        const obj = await storage.get(key)
        if (!obj) return null
        return { text: obj.text }
      },
      async putAnalysis(novelId, jobId, index, json) {
        const storage = await StorageUtil.StorageFactory.getAnalysisStorage()
        const key = StorageUtil.StorageKeys.chunkAnalysis({ novelId, jobId, index })

        await executeStorageWithTracking({
          storage,
          key,
          value: json,
          tracking: {
            filePath: key,
            fileCategory: 'analysis',
            fileType: 'json',
            novelId,
            jobId,
            mimeType: 'application/json; charset=utf-8',
          },
        })

        return key
      },
    },
    layout: {
      async putEpisodeLayout(novelId, jobId, episodeNumber, json) {
        const storage = await StorageUtil.StorageFactory.getLayoutStorage()
        const key = StorageUtil.StorageKeys.episodeLayout({ novelId, jobId, episodeNumber })

        await executeStorageWithTracking({
          storage,
          key,
          value: json,
          tracking: {
            filePath: key,
            fileCategory: 'layout',
            fileType: 'json',
            novelId,
            jobId,
            mimeType: 'application/json; charset=utf-8',
          },
        })

        return key
      },
      async getEpisodeLayout(novelId, jobId, episodeNumber) {
        const storage = await StorageUtil.StorageFactory.getLayoutStorage()
        const key = StorageUtil.StorageKeys.episodeLayout({ novelId, jobId, episodeNumber })
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
      async putEpisodeLayoutProgress(novelId, jobId, episodeNumber, json) {
        const storage = await StorageUtil.StorageFactory.getLayoutStorage()
        // Some tests mock StorageKeys partially. Fallback to string template if function missing.
        const keyFn = (StorageUtil.StorageKeys as unknown as Record<string, unknown>)
          .episodeLayoutProgress as
          | ((params: { novelId: string; jobId: string; episodeNumber: number }) => string)
          | undefined
        const key =
          typeof keyFn === 'function'
            ? keyFn({ novelId, jobId, episodeNumber })
            : `${novelId}/jobs/${jobId}/layouts/episode_${episodeNumber}.progress.json`

        await executeStorageWithTracking({
          storage,
          key,
          value: json,
          tracking: {
            filePath: key,
            fileCategory: 'metadata',
            fileType: 'json',
            novelId,
            jobId,
            mimeType: 'application/json; charset=utf-8',
          },
        })

        return key
      },
      async getEpisodeLayoutProgress(novelId, jobId, episodeNumber) {
        const storage = await StorageUtil.StorageFactory.getLayoutStorage()
        const keyFn = (StorageUtil.StorageKeys as unknown as Record<string, unknown>)
          .episodeLayoutProgress as
          | ((params: { novelId: string; jobId: string; episodeNumber: number }) => string)
          | undefined
        const key =
          typeof keyFn === 'function'
            ? keyFn({ novelId, jobId, episodeNumber })
            : `${novelId}/jobs/${jobId}/layouts/episode_${episodeNumber}.progress.json`
        const obj = await storage.get(key)
        return obj?.text ?? null
      },
    },
    episodeText: {
      async putEpisodeText(novelId, jobId, episodeNumber, text) {
        const storage = await StorageUtil.StorageFactory.getAnalysisStorage()
        // Some tests mock StorageKeys partially. Fallback to string template if function missing.
        const keyFn = (StorageUtil.StorageKeys as unknown as Record<string, unknown>)
          .episodeText as
          | ((params: { novelId: string; jobId: string; episodeNumber: number }) => string)
          | undefined
        const key =
          typeof keyFn === 'function'
            ? keyFn({ novelId, jobId, episodeNumber })
            : `${novelId}/jobs/${jobId}/analysis/episode_${episodeNumber}.txt`

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
            novelId,
            jobId,
            mimeType: 'text/plain; charset=utf-8',
          },
        })

        return key
      },
      async getEpisodeText(novelId, jobId, episodeNumber) {
        const storage = await StorageUtil.StorageFactory.getAnalysisStorage()
        const keyFn = (StorageUtil.StorageKeys as unknown as Record<string, unknown>)
          .episodeText as
          | ((params: { novelId: string; jobId: string; episodeNumber: number }) => string)
          | undefined
        const key =
          typeof keyFn === 'function'
            ? keyFn({ novelId, jobId, episodeNumber })
            : `${novelId}/jobs/${jobId}/analysis/episode_${episodeNumber}.txt`
        const obj = await storage.get(key)
        return obj?.text ?? null
      },
    },
    render: {
      async putPageRender(novelId, jobId, episodeNumber, pageNumber, data, meta) {
        const storage = await StorageUtil.StorageFactory.getRenderStorage()
        const key = StorageUtil.StorageKeys.pageRender({
          novelId,
          jobId,
          episodeNumber,
          pageNumber,
        })

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
            novelId,
            jobId,
            mimeType: 'image/png',
          },
        })

        return key
      },
      async putPageThumbnail(novelId, jobId, episodeNumber, pageNumber, data, meta) {
        const storage = await StorageUtil.StorageFactory.getRenderStorage()
        const key = StorageUtil.StorageKeys.pageThumbnail({
          novelId,
          jobId,
          episodeNumber,
          pageNumber,
        })

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
            novelId,
            jobId,
            mimeType: 'image/jpeg',
          },
        })

        return key
      },
      async getPageRender(novelId, jobId, episodeNumber, pageNumber) {
        const storage = await StorageUtil.StorageFactory.getRenderStorage()
        const key = StorageUtil.StorageKeys.pageRender({
          novelId,
          jobId,
          episodeNumber,
          pageNumber,
        })
        const obj = await storage.get(key)
        return obj?.text ?? null
      },
    },
    output: {
      async putExport(userId, jobId, kind, data, meta) {
        const storage = await StorageUtil.StorageFactory.getOutputStorage()
        const key = StorageUtil.StorageKeys.exportOutput(
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
        const storage = await StorageUtil.StorageFactory.getOutputStorage()
        const obj = await storage.get(path)
        return obj ? { text: obj.text } : null
      },
      async deleteExport(path) {
        const storage = await StorageUtil.StorageFactory.getOutputStorage()
        await storage.delete(path)
      },
    },
    characterMemory: {
      async putFull(novelId, jobId, json) {
        return save('full', novelId, jobId, json)
      },
      async getFull(novelId, jobId) {
        return load('full', novelId, jobId)
      },
      async putPrompt(novelId, jobId, json) {
        return save('prompt', novelId, jobId, json)
      },
      async getPrompt(novelId, jobId) {
        return load('prompt', novelId, jobId)
      },
    },
  }
}

async function save(
  kind: 'full' | 'prompt',
  novelId: string,
  jobId: string,
  json: string,
): Promise<string> {
  const storage = await StorageUtil.StorageFactory.getAnalysisStorage()
  const key =
    kind === 'full'
      ? StorageUtil.JsonStorageKeys.characterMemoryFull({ novelId, jobId })
      : StorageUtil.JsonStorageKeys.characterMemoryPrompt({ novelId, jobId })

  await executeStorageWithTracking({
    storage,
    key,
    value: json,
    tracking: {
      filePath: key,
      fileCategory: 'analysis',
      fileType: 'json',
      novelId,
      jobId,
      mimeType: 'application/json; charset=utf-8',
    },
  })

  return key
}

async function load(
  kind: 'full' | 'prompt',
  novelId: string,
  jobId: string,
): Promise<string | null> {
  const storage = await StorageUtil.StorageFactory.getAnalysisStorage()
  const key =
    kind === 'full'
      ? StorageUtil.JsonStorageKeys.characterMemoryFull({ novelId, jobId })
      : StorageUtil.JsonStorageKeys.characterMemoryPrompt({ novelId, jobId })
  const obj = await storage.get(key)
  return obj?.text ?? null
}
