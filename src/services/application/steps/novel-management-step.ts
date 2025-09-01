import { getNovelRepository } from '@/repositories'
import { ApiError } from '@/utils/api-error'
import type { PipelineStep, StepContext, StepExecutionResult } from './base-step'

/**
 * Step responsible for novel text retrieval and storage
 */
export class NovelManagementStep implements PipelineStep {
  readonly stepName = 'novel-management'

  /**
   * Retrieve novel text from novelId
   */
  async runWithNovelId(
    novelId: string,
    context: Pick<StepContext, 'logger' | 'ports'>,
  ): Promise<StepExecutionResult<{ text: string; title?: string }>> {
    const { logger, ports } = context

    try {
      // DB 上の小説存在確認（旧テスト互換: エラーメッセージに「データベース」文言を含める）
      // ここで「DBから小説メタデータを読み込む」
      const novelRepo = getNovelRepository()
      const dbNovel = await novelRepo.get(novelId)
      if (!dbNovel) {
        throw new ApiError('小説ID がデータベースに見つかりません', 404, 'NOT_FOUND')
      }

      // ストレージからテキスト取得（旧テスト互換: 「のテキストがストレージに見つかりません」）
      // ここで「ストレージ（ファイル）から小説本文を読み込む」
      const novel = await ports.novel.getNovelText(novelId)
      if (!novel?.text) {
        throw new ApiError('小説のテキストがストレージに見つかりません', 404, 'NOT_FOUND')
      }

      logger.info('Novel text retrieved successfully', {
        novelId,
        textLength: novel.text.length,
        title: dbNovel.title || 'Unknown',
      })

      return {
        success: true,
        data: { text: novel.text, title: dbNovel.title || undefined },
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      logger.error('Failed to retrieve novel text', { novelId, error: errorMessage })
      return { success: false, error: errorMessage }
    }
  }

  /**
   * Ensure novel metadata exists in database and store text in storage
   */
  async ensureNovelPersistence(
    novelId: string,
    novelText: string,
    title: string,
    context: Pick<StepContext, 'logger'>,
  ): Promise<StepExecutionResult<void>> {
    const { logger } = context

    try {
      const novelRepo = getNovelRepository()

      // DBに小説メタデータ（タイトル等）を書き込む/存在保証する
      await novelRepo.ensure(novelId, {
        title: title || `Novel ${novelId.slice(0, 8)}`,
        author: 'Unknown',
        originalTextPath: `${novelId}.json`,
        textLength: novelText.length,
        language: 'ja',
        metadataPath: null,
        userId: 'anonymous',
      })

      // ストレージに小説テキストを保存
      const novelStorage = await (await import('@/utils/storage')).StorageFactory.getNovelStorage()
      const key = `${novelId}.json`
      const novelData = JSON.stringify({ text: novelText, title: title || '' })

      const { executeStorageWithTracking } = await import(
        '@/services/application/transaction-manager'
      )
      await executeStorageWithTracking({
        storage: novelStorage,
        key,
        value: novelData,
        tracking: {
          filePath: key,
          fileCategory: 'original',
          fileType: 'json',
          novelId,
          jobId: undefined,
          mimeType: 'application/json; charset=utf-8',
        },
      })

      logger.info('Novel metadata and text persisted successfully', {
        novelId,
        title,
        textLength: novelText.length,
      })

      return { success: true, data: undefined }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      logger.error('Failed to persist novel text or ensure novel before job creation', {
        error: errorMessage,
        novelId,
      })
      return {
        success: false,
        error: `Failed to create novel before job: ${errorMessage}`,
      }
    }
  }
}
