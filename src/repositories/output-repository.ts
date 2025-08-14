import type { NewOutput } from '@/db'
import type { OutputDbPort } from './ports'

export class OutputRepository {
  constructor(private readonly db: OutputDbPort) {}

  async create(payload: Omit<NewOutput, 'createdAt'>): Promise<string> {
    return this.db.createOutput(payload)
  }

  async getById(id: string): Promise<NewOutput | null> {
    return this.db.getOutput(id)
  }
}
