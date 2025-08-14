import type { NewOutput } from '@/db'
import type { OutputDbPort } from './ports'

// Re-export for backward compatibility
export type { OutputDbPort } from './ports'

export class OutputRepository {
  constructor(private readonly db: OutputDbPort) {}

  async create(payload: Omit<NewOutput, 'createdAt'>): Promise<string> {
    return this.db.createOutput(payload)
  }

  async getById(_id: string): Promise<{
    id: string
    novelId: string
    jobId: string
    outputType: string
    outputPath: string
    fileSize?: number | null
    pageCount?: number | null
    metadataPath?: string | null
  } | null> {
    // 現在のPortにはgetByIdが無いため、最小実装としてストレージパスは推論不可。
    // ここではDBへの直接アクセスは行わず、互換としてnullを返すのではなくエラーにする。
    // 呼び出し側はこのメソッドを使用せず、DatabaseService経由で取得するように修正するのが理想。
    throw new Error(
      'OutputRepository.getById is not implemented via port. Use DatabaseService or extend port.',
    )
  }
}
