import type { NewOutput, Output } from '@/db'

export interface OutputDbPort {
  createOutput(payload: Omit<NewOutput, 'createdAt'>): Promise<string>
}

export class OutputRepository {
  constructor(private readonly db: OutputDbPort) {}

  async create(payload: Omit<NewOutput, 'createdAt'>): Promise<string> {
    return this.db.createOutput(payload)
  }
}
