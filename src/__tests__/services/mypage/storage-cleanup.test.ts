import { Effect } from 'effect'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { StorageFileRecord } from '@/services/application/storage-files-service'
import { deleteStorageArtifacts } from '@/services/mypage/storage-cleanup'
import { ApiError, ERROR_CODES } from '@/utils/api-error'

const novelDelete = vi.fn()
const chunkDelete = vi.fn()
const analysisDelete = vi.fn()
const layoutDelete = vi.fn()
const renderDelete = vi.fn()
const outputDelete = vi.fn()

vi.mock('@/utils/storage', () => ({
  StorageFactory: {
    getNovelStorage: vi.fn(async () => ({ delete: novelDelete })),
    getChunkStorage: vi.fn(async () => ({ delete: chunkDelete })),
    getAnalysisStorage: vi.fn(async () => ({ delete: analysisDelete })),
    getLayoutStorage: vi.fn(async () => ({ delete: layoutDelete })),
    getRenderStorage: vi.fn(async () => ({ delete: renderDelete })),
    getOutputStorage: vi.fn(async () => ({ delete: outputDelete })),
  },
}))

vi.mock('@/infrastructure/logging/logger', () => ({
  getLogger: () => ({
    withContext: () => ({
      error: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
    }),
  }),
}))

describe('deleteStorageArtifacts', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('deletes each unique file path using the configured storage resolvers', async () => {
    const records: StorageFileRecord[] = [
      {
        id: 's1',
        novelId: 'novel-1',
        jobId: 'job-1',
        filePath: 'novels/novel-1.txt',
        fileCategory: 'original',
        fileType: 'txt',
        mimeType: 'text/plain',
        fileSize: 10,
        createdAt: null,
      },
      {
        id: 's2',
        novelId: 'novel-1',
        jobId: 'job-1',
        filePath: 'chunks/chunk-1.json',
        fileCategory: 'chunk',
        fileType: 'json',
        mimeType: 'application/json',
        fileSize: 20,
        createdAt: null,
      },
      {
        id: 's3',
        novelId: 'novel-1',
        jobId: 'job-1',
        filePath: 'novels/novel-1.txt',
        fileCategory: 'original',
        fileType: 'txt',
        mimeType: 'text/plain',
        fileSize: 10,
        createdAt: null,
      },
    ]

    const result = await Effect.runPromise(
      deleteStorageArtifacts(records, { novelId: 'novel-1', jobId: 'job-1' }).pipe(Effect.either),
    )

    expect(result._tag).toBe('Right')
    expect(novelDelete).toHaveBeenCalledTimes(1)
    expect(novelDelete).toHaveBeenCalledWith('novels/novel-1.txt')
    expect(chunkDelete).toHaveBeenCalledTimes(1)
    expect(chunkDelete).toHaveBeenCalledWith('chunks/chunk-1.json')
  })

  it('propagates storage errors as ApiError with storage error code', async () => {
    renderDelete.mockRejectedValueOnce(new Error('delete failed'))

    const records: StorageFileRecord[] = [
      {
        id: 'render-1',
        novelId: 'novel-2',
        jobId: null,
        filePath: 'renders/output.png',
        fileCategory: 'render',
        fileType: 'png',
        mimeType: 'image/png',
        fileSize: 42,
        createdAt: null,
      },
    ]

    const result = await Effect.runPromise(
      deleteStorageArtifacts(records, { novelId: 'novel-2' }).pipe(Effect.either),
    )

    expect(result._tag).toBe('Left')
    if (result._tag === 'Left') {
      expect(result.left).toBeInstanceOf(ApiError)
      expect(result.left).toMatchObject({ code: ERROR_CODES.STORAGE_ERROR, statusCode: 500 })
    }
  })
})

