import { Effect } from 'effect'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError, ERROR_CODES } from '@/utils/api-error'

const mockNovelService = {
  getNovel: vi.fn(),
  deleteNovel: vi.fn(),
}

const mockJobService = {
  getJobsByNovelId: vi.fn(),
}

const listByNovelMock = vi.fn()
const deleteByNovelMock = vi.fn()

vi.mock('@/services/database/database-service-factory', () => ({
  db: {
    novels: () => mockNovelService,
    jobs: () => mockJobService,
  },
}))

vi.mock('@/services/application/storage-files-service', async () => {
  const actual = await vi.importActual<typeof import('@/services/application/storage-files-service')>(
    '@/services/application/storage-files-service',
  )

  class MockStorageFilesService {
    listByNovel = listByNovelMock
    deleteByNovel = deleteByNovelMock
  }

  return {
    ...actual,
    StorageFilesService: MockStorageFilesService,
  }
})

const { deleteJobForUserMock } = vi.hoisted(() => ({
  deleteJobForUserMock: vi.fn(() => Effect.succeed(undefined)),
}))

vi.mock('@/services/mypage/job-deletion-service', () => ({
  deleteJobForUser: deleteJobForUserMock,
}))

const { deleteStorageArtifactsMock } = vi.hoisted(() => ({
  deleteStorageArtifactsMock: vi.fn(() => Effect.succeed(undefined)),
}))

vi.mock('@/services/mypage/storage-cleanup', () => ({
  deleteStorageArtifacts: deleteStorageArtifactsMock,
  normalizeDeletionError: (error: unknown) =>
    error instanceof Error
      ? { message: error.message, stack: error.stack }
      : { error },
}))

import { deleteNovelForUser } from '@/services/mypage/novel-deletion-service'

describe('deleteNovelForUser', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    deleteJobForUserMock.mockReturnValue(Effect.succeed(undefined))
    deleteStorageArtifactsMock.mockReturnValue(Effect.succeed(undefined))
  })

  it('deletes related jobs, storage records, and the novel for the owning user', async () => {
    mockNovelService.getNovel.mockResolvedValue({ id: 'novel-1', userId: 'user-1', title: 'Novel Title' })
    mockJobService.getJobsByNovelId.mockResolvedValue([
      { id: 'job-1', userId: 'user-1', novelId: 'novel-1' },
      { id: 'job-2', userId: 'user-1', novelId: 'novel-1' },
    ])
    const storageRecords = [
      {
        id: 'storage-1',
        novelId: 'novel-1',
        jobId: null,
        filePath: 'novels/novel-1.txt',
        fileCategory: 'original',
        fileType: 'txt',
        mimeType: 'text/plain',
        fileSize: 10,
        createdAt: null,
      },
    ]
    listByNovelMock.mockResolvedValue(storageRecords)
    deleteByNovelMock.mockResolvedValue(undefined)
    mockNovelService.deleteNovel.mockResolvedValue(undefined)

    await expect(Effect.runPromise(deleteNovelForUser('user-1', 'novel-1'))).resolves.toBeUndefined()

    expect(deleteJobForUserMock).toHaveBeenCalledTimes(2)
    expect(deleteJobForUserMock).toHaveBeenNthCalledWith(1, 'user-1', 'job-1')
    expect(deleteJobForUserMock).toHaveBeenNthCalledWith(2, 'user-1', 'job-2')
    expect(deleteStorageArtifactsMock).toHaveBeenCalledWith(storageRecords, { novelId: 'novel-1' })
    expect(deleteByNovelMock).toHaveBeenCalledWith('novel-1')
    expect(mockNovelService.deleteNovel).toHaveBeenCalledWith('novel-1')
  })

  it('fails when the novel does not exist for the user', async () => {
    mockNovelService.getNovel.mockResolvedValue(null)

    const result = await Effect.runPromise(deleteNovelForUser('user-1', 'missing').pipe(Effect.either))
    expect(result._tag).toBe('Left')
    if (result._tag === 'Left') {
      expect(result.left).toBeInstanceOf(ApiError)
      expect(result.left).toMatchObject({ code: ERROR_CODES.NOT_FOUND, statusCode: 404 })
    }
  })

  it('fails when a job is owned by another user', async () => {
    mockNovelService.getNovel.mockResolvedValue({ id: 'novel-2', userId: 'user-1', title: 'Other Novel' })
    mockJobService.getJobsByNovelId.mockResolvedValue([
      { id: 'job-x', userId: 'user-2', novelId: 'novel-2' },
    ])

    const result = await Effect.runPromise(deleteNovelForUser('user-1', 'novel-2').pipe(Effect.either))
    expect(result._tag).toBe('Left')
    if (result._tag === 'Left') {
      expect(result.left).toBeInstanceOf(ApiError)
      expect(result.left).toMatchObject({ code: ERROR_CODES.FORBIDDEN, statusCode: 403 })
    }
    expect(deleteJobForUserMock).not.toHaveBeenCalled()
  })

  it('propagates job deletion failures', async () => {
    mockNovelService.getNovel.mockResolvedValue({ id: 'novel-3', userId: 'user-1', title: 'Novel' })
    mockJobService.getJobsByNovelId.mockResolvedValue([{ id: 'job-err', userId: 'user-1', novelId: 'novel-3' }])
    deleteJobForUserMock.mockReturnValueOnce(
      Effect.fail(new ApiError('job delete failed', 500, ERROR_CODES.DATABASE_ERROR)),
    )

    const result = await Effect.runPromise(deleteNovelForUser('user-1', 'novel-3').pipe(Effect.either))
    expect(result._tag).toBe('Left')
    if (result._tag === 'Left') {
      expect(result.left).toBeInstanceOf(ApiError)
      expect(result.left).toMatchObject({ code: ERROR_CODES.DATABASE_ERROR, statusCode: 500 })
    }
  })
})

