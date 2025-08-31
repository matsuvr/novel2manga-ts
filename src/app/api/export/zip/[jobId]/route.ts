import type { NextRequest } from 'next/server'
import { getLogger } from '@/infrastructure/logging/logger'
import { OutputService } from '@/services/application/output-service'
import { ApiResponder } from '@/utils/api-responder'
import { validateJobId } from '@/utils/validators'
import { getCurrentUserId } from '@/utils/current-user'

export async function GET(_request: NextRequest, ctx: { params: Promise<{ jobId: string }> }) {
  try {
    const { jobId } = await ctx.params
    const logger = getLogger().withContext({
      route: 'api/export/zip/[jobId]',
      method: 'GET',
      jobId,
    })

    validateJobId(jobId)

    const output = new OutputService()
    const userId = getCurrentUserId()
    // すべてのエピソードを対象にZIPを生成（レイアウトYAMLとPNGを同梱）
    const { exportFilePath } = await output.export(jobId, 'images_zip', undefined, userId)

    const buffer = await output.getExportContent(exportFilePath)
    if (!buffer) {
      return ApiResponder.validation('ZIPの生成に失敗しました')
    }

    logger.info('ZIP export generated for job')

    return new Response(new Uint8Array(buffer), {
      status: 200,
      headers: {
        'Content-Type': 'application/zip',
        'Content-Disposition': `attachment; filename="${jobId}.zip"`,
        'Cache-Control': 'public, max-age=3600',
      },
    })
  } catch (error) {
    return ApiResponder.error(error)
  }
}
