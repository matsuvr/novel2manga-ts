import type { NewOutput } from '@/db'

/**
 * Database port for Output entity.
 * Implementations should persist a final artifact record and return its id.
 */
export interface OutputDbPort {
  createOutput(payload: Omit<NewOutput, 'createdAt'>): Promise<string>
}

export class OutputRepository {
  constructor(private readonly db: OutputDbPort) {}

  async create(payload: Omit<NewOutput, 'createdAt'>): Promise<string> {
    return this.db.createOutput(payload)
  }
}
