import type { ChunkDbPort, TransactionPort } from './ports'

export class ChunkRepository {
  constructor(private readonly db: ChunkDbPort & Partial<TransactionPort>) {}

  async create(payload: Parameters<ChunkDbPort['createChunk']>[0]): Promise<string> {
    return this.db.createChunk(payload)
  }

  async createBatch(payloads: Parameters<ChunkDbPort['createChunksBatch']>[0]): Promise<void> {
    if (payloads.length === 0) return
    const candidate: unknown = this.db as unknown
    const hasBatch =
      candidate &&
      typeof (candidate as { createChunksBatch?: unknown }).createChunksBatch === 'function'
    if (hasBatch) {
      const run = async () =>
        (this.db as { createChunksBatch: ChunkDbPort['createChunksBatch'] }).createChunksBatch(
          payloads,
        )
      if (typeof this.db.withTransaction === 'function') {
        await this.db.withTransaction(async () => {
          await run()
        })
      } else {
        await run()
      }
      return
    }
    // Fallback: sequential inserts for environments/tests that do not implement batch API
    const runEach = async () => {
      for (const item of payloads) {
        // eslint-disable-next-line no-await-in-loop
        await this.db.createChunk(item)
      }
    }
    if (typeof this.db.withTransaction === 'function') {
      await this.db.withTransaction(async () => {
        await runEach()
      })
    } else {
      await runEach()
    }
  }
}
