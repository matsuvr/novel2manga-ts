import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { getLogger } from '@/infrastructure/logging/logger'
import { OutputService } from '@/services/application/output-service'
import { db } from '@/services/database'
import { withAuth } from '@/utils/api-auth'
import {
  createErrorResponse,
  ForbiddenError,
  NotFoundError,
  ValidationError,
} from '@/utils/api-error'
import { validateJobId } from '@/utils/validators'

export const GET = withAuth(
  async (_request: NextRequest, user, ctx: { params: Promise<{ jobId: string }> }) => {
    try {
      const { jobId } = await ctx.params
      const logger = getLogger().withContext({
        route: 'api/export/zip/[jobId]',
        method: 'GET',
        jobId,
      })

      validateJobId(jobId)

      // ユーザー所有権チェック
      const job = await db.jobs().getJob(jobId)
      if (!job) {
        return createErrorResponse(new NotFoundError('指定されたジョブが見つかりません'))
      }
      if (job.userId && job.userId !== user.id) {
        return createErrorResponse(new ForbiddenError('アクセス権限がありません'))
      }

      const output = new OutputService()
      const userId = user.id
      // すべてのエピソードを対象にZIPを生成（レイアウトYAMLとPNGを同梱）
      const { exportFilePath } = await output.export(jobId, 'images_zip', undefined, userId)

      const buffer = await output.getExportContent(exportFilePath)
      if (!buffer) {
        return createErrorResponse(new ValidationError('ZIPの生成に失敗しました'))
      }

      logger.info('ZIP export generated for job')

      return new NextResponse(new Uint8Array(buffer), {
        status: 200,
        headers: {
          'Content-Type': 'application/zip',
          'Content-Disposition': `attachment; filename="${jobId}.zip"`,
          'Cache-Control': 'public, max-age=3600',
        },
      })
    } catch (error) {
      return createErrorResponse(error)
    }
  },
)
