// Compatibility shim for legacy repository access.
// Internally delegates to domain services in src/services/database.
import crypto from 'node:crypto'
import type { Job } from '@/db/schema'
import { db } from '@/services/database/index'

export function getJobRepository() {
  return {
    async getByNovelId(novelId: string) {
      return db.jobs().getJobsByNovelId(novelId)
    },
    async getJob(id: string) {
      return db.jobs().getJob(id)
    },
    async updateStatus(id: string, status: string, error?: string) {
      return db.jobs().updateJobStatus(id, status as Job['status'], error)
    },
    async updateStep(
      id: string,
      step: string,
      _processedChunks?: number,
      _totalChunks?: number,
      _error?: string,
      _errorStep?: string,
    ) {
      return db.jobs().updateJobStep(id, step)
    },
    async markStepCompleted(
      id: string,
      step: 'split' | 'analyze' | 'episode' | 'layout' | 'render',
    ) {
      return db.jobs().markJobStepCompleted(id, step)
    },
    async updateJobTotalPages(id: string, totalPages: number) {
      return db.jobs().updateJobTotalPages(id, totalPages)
    },
    async create(payload: {
      id?: string
      novelId: string
      title?: string
      totalChunks?: number
      status?: string
      userId?: string
    }) {
      const id = payload.id ?? crypto.randomUUID()
      db.jobs().createJobRecord({
        id,
        novelId: payload.novelId,
        title: payload.title,
        totalChunks: payload.totalChunks,
        status: payload.status,
        userId: payload.userId,
      })
      return id
    },
    async updateCoverageWarnings(
      id: string,
      warnings: Array<{ chunkIndex: number; coverageRatio: number; message: string }>,
    ) {
      // 互換シム: 旧リポジトリの副作用を新実装にマップ
      // jobs.coverageWarnings にJSONとして永続化（schema.tsに対応カラムあり）
      // サイレントなNO-OPは避け、実際の保存に委譲する
      await db.jobs().updateJobCoverageWarnings(id, warnings)
    },
  }
}

export function getNovelRepository() {
  return {
    async get(id: string) {
      return db.novels().getNovel(id)
    },
    async list() {
      return db.novels().getAllNovels()
    },
    async ensure(
      id: string,
      payload: Omit<Parameters<ReturnType<(typeof db)['novels']>['ensureNovel']>[1], 'id'>,
    ) {
      return db.novels().ensureNovel(id, payload)
    },
  }
}

export function getChunkRepository() {
  return {
    async getByJobId(jobId: string) {
      return db.chunks().getChunksByJobId(jobId)
    },
    async create(payload: Parameters<ReturnType<(typeof db)['chunks']>['createChunk']>[0]) {
      return db.chunks().createChunk(payload)
    },
    async createChunksBatch(
      payloads: Array<Parameters<ReturnType<(typeof db)['chunks']>['createChunk']>[0]>,
    ) {
      return db.chunks().createChunksBatch(payloads)
    },
  }
}

export function getOutputRepository() {
  return {
    async create(payload: Parameters<ReturnType<(typeof db)['outputs']>['createOutput']>[0]) {
      return db.outputs().createOutput(payload)
    },
    async getById(id: string) {
      return db.outputs().getOutput(id)
    },
  }
}
