import { randomUUID } from 'node:crypto'
import JSZip from 'jszip'
import PDFDocument from 'pdfkit'
import type { Episode, NewOutput } from '@/db'
import { getLogger } from '@/infrastructure/logging/logger'
import { getStoragePorts } from '@/infrastructure/storage/ports'
import { db } from '@/services/database/index'
// YAML依存を撤廃。レイアウトはJSONとして扱う
// StorageKeys は内部で直接使用しない

export class OutputService {
  private readonly ports = getStoragePorts()

  async create(payload: Omit<NewOutput, 'createdAt'>): Promise<string> {
    return db.outputs().createOutput(payload)
  }

  async getById(id: string) {
    return db.outputs().getOutput(id)
  }

  async savePdf(userId: string, jobId: string, data: Buffer): Promise<string> {
    return this.ports.output.putExport(userId, jobId, 'pdf', data, { jobId })
  }

  async saveZip(userId: string, jobId: string, data: Buffer): Promise<string> {
    return this.ports.output.putExport(userId, jobId, 'zip', data, { jobId })
  }

  async getExportContent(path: string): Promise<Buffer | null> {
    const obj = await this.ports.output.getExport(path)
    if (!obj) return null
    // output storage returns base64 for binary
    try {
      const buf = Buffer.from(obj.text, 'base64')
      if (buf.length > 0) return buf
    } catch (error) {
      const logger = getLogger().withContext({
        service: 'OutputService',
        operation: 'getExportContent',
        path,
      })
      logger.warn('Base64 decoding failed, falling back to UTF-8', {
        path,
        textLength: obj.text.length,
        error: error instanceof Error ? error.message : String(error),
      })
    }
    return Buffer.from(obj.text)
  }

  /**
   * ルート薄化のための統合エクスポートユースケース。
   * - ジョブ/エピソードの検証
   * - PDF/ZIP 生成
   * - ストレージ保存 + outputs レコード作成
   */
  async export(
    jobId: string,
    format: 'pdf' | 'images_zip',
    episodeNumbers: number[] | undefined,
    userId: string,
  ): Promise<{
    outputId: string
    exportFilePath: string
    fileSize: number
    pageCount: number
  }> {
    const job = await db.jobs().getJob(jobId)
    if (!job) throw new Error('指定されたジョブが見つかりません')

    let allEpisodes = await db.episodes().getEpisodesByJobId(jobId)
    const logger = getLogger().withContext({
      service: 'OutputService',
      operation: 'export',
      jobId,
    })

    logger.debug('Episodes found in database', { count: allEpisodes.length })

    if (allEpisodes.length === 0) {
      // Fallback: derive episode list from layout storage (JSON files)
      try {
        logger.debug('Attempting fallback episode discovery from layout storage')

        // Use layout port directly to find episodes
        const episodeNumbers: number[] = []
        let episodeNumber = 1

        // Try to find episodes by checking for layout files (episode_1.json, episode_2.json, etc.)
        while (episodeNumber <= 50) {
          // Reasonable upper limit
          try {
            const layoutData = await this.ports.layout.getEpisodeLayout(jobId, episodeNumber)
            if (layoutData) {
              episodeNumbers.push(episodeNumber)
              logger.debug('Found episode layout', { episodeNumber })
            }
          } catch (_error) {
            // This episode doesn't exist, which is expected
          }
          episodeNumber++

          // Early exit if we haven't found any episodes in the first few attempts
          if (episodeNumber > 10 && episodeNumbers.length === 0) {
            break
          }
        }

        if (episodeNumbers.length > 0) {
          logger.info('Found episodes via layout storage fallback', {
            count: episodeNumbers.length,
            episodes: episodeNumbers,
          })

          allEpisodes = episodeNumbers.map(
            (n) =>
              ({
                id: `${jobId}-${n}`,
                novelId: job.novelId,
                jobId,
                episodeNumber: n,
                title: `エピソード${n}`,
                summary: null,
                startChunk: 0,
                startCharIndex: 0,
                endChunk: 0,
                endCharIndex: 0,
                confidence: 1,
                episodeTextPath: null,
                createdAt: new Date().toISOString(),
              }) satisfies Episode,
          )
        } else {
          logger.warn('No episodes found via layout storage fallback')
        }
      } catch (error) {
        logger.error('Layout storage fallback failed', {
          error: error instanceof Error ? error.message : String(error),
        })
      }
    }
    let targetEpisodes = allEpisodes
    if (episodeNumbers && episodeNumbers.length > 0) {
      targetEpisodes = allEpisodes.filter((e) => episodeNumbers.includes(e.episodeNumber))
    }
    if (targetEpisodes.length === 0) {
      throw new Error('エクスポート対象のエピソードが見つかりません')
    }

    let exportFilePath: string
    let fileSize = 0
    let pageCount = 0
    switch (format) {
      case 'pdf': {
        const pdf = await this.exportToPDF(userId, jobId, targetEpisodes)
        exportFilePath = pdf.exportFilePath
        fileSize = pdf.fileSize
        pageCount = pdf.pageCount
        break
      }
      case 'images_zip': {
        const zip = await this.exportToZIP(userId, jobId, targetEpisodes)
        exportFilePath = zip.exportFilePath
        fileSize = zip.fileSize
        pageCount = zip.pageCount
        break
      }
      default:
        throw new Error('サポートされていないフォーマットです')
    }

    const outputId = `out_${randomUUID()}`
    try {
      await db.outputs().createOutput({
        id: outputId,
        novelId: job.novelId,
        jobId,
        outputType: format === 'pdf' ? 'pdf' : 'images_zip',
        outputPath: exportFilePath,
        userId,
        fileSize,
        pageCount,
        metadataPath: null,
      })
    } catch (e) {
      // TODO: Refactor to use TransactionManager for atomic storage+DB operations
      // This would require changing exportToPDF/exportToZIP to return buffers instead of saving directly
      // Current manual rollback provides partial consistency but isn't fully atomic

      // DB 失敗時はストレージへ保存済みの成果物を削除して整合性維持
      try {
        const ports = getStoragePorts()
        await ports.output.deleteExport(exportFilePath)
      } catch (deleteError) {
        const logger = getLogger().withContext({
          service: 'OutputService',
          operation: 'export-cleanup',
          jobId,
          exportFilePath,
        })
        logger.warn('Failed to delete export file during cleanup', {
          jobId,
          exportFilePath,
          deleteError: deleteError instanceof Error ? deleteError.message : String(deleteError),
          originalError: e instanceof Error ? e.message : String(e),
        })
      }
      throw e
    }

    return { outputId, exportFilePath, fileSize, pageCount }
  }

  private async exportToPDF(
    userId: string,
    jobId: string,
    episodes: Episode[],
  ): Promise<{ exportFilePath: string; fileSize: number; pageCount: number }> {
    const doc = new PDFDocument({
      size: 'A4',
      layout: 'landscape',
      margins: { top: 0, bottom: 0, left: 0, right: 0 },
    })

    const chunks: Buffer[] = []
    doc.on('data', (chunk) => chunks.push(chunk))

    let totalPages = 0
    for (const episode of episodes.sort((a, b) => a.episodeNumber - b.episodeNumber)) {
      const layoutDataText = await this.ports.layout.getEpisodeLayout(jobId, episode.episodeNumber)
      if (!layoutDataText) continue
      const mangaLayout = JSON.parse(layoutDataText) as {
        pages?: Array<{ page_number: number }>
      }
      if (mangaLayout.pages) {
        for (const page of mangaLayout.pages.sort((a, b) => a.page_number - b.page_number)) {
          const base64Image = await this.ports.render.getPageRender(
            jobId,
            episode.episodeNumber,
            page.page_number,
          )
          if (!base64Image) continue
          const imageBuffer = Buffer.from(base64Image, 'base64')
          if (totalPages > 0) doc.addPage()
          doc.image(imageBuffer, 0, 0, {
            fit: [doc.page.width, doc.page.height],
            align: 'center',
            valign: 'center',
          })
          totalPages++
        }
      }
    }

    doc.end()
    return await new Promise((resolve, reject) => {
      doc.on('end', async () => {
        try {
          const pdfBuffer = Buffer.concat(chunks)
          const exportPath = await this.savePdf(userId, jobId, pdfBuffer)
          resolve({
            exportFilePath: exportPath,
            fileSize: pdfBuffer.length,
            pageCount: totalPages,
          })
        } catch (e) {
          reject(e)
        }
      })
    })
  }

  private async exportToZIP(
    userId: string,
    jobId: string,
    episodes: Episode[],
  ): Promise<{ exportFilePath: string; fileSize: number; pageCount: number }> {
    const zip = new JSZip()
    let totalPages = 0

    for (const episode of episodes.sort((a, b) => a.episodeNumber - b.episodeNumber)) {
      const episodeFolder = zip.folder(
        `episode_${episode.episodeNumber.toString().padStart(3, '0')}`,
      )
      if (!episodeFolder) continue

      const layoutText = await this.ports.layout.getEpisodeLayout(jobId, episode.episodeNumber)
      if (layoutText) {
        episodeFolder.file('layout.json', layoutText)
        try {
          const mangaLayout = JSON.parse(layoutText) as {
            pages?: Array<{ page_number: number }>
          }
          if (mangaLayout.pages) {
            for (const page of mangaLayout.pages.sort((a, b) => a.page_number - b.page_number)) {
              const base64Image = await this.ports.render.getPageRender(
                jobId,
                episode.episodeNumber,
                page.page_number,
              )
              if (!base64Image) continue
              const imageBuffer = Buffer.from(base64Image, 'base64')
              const fileName = `page_${page.page_number.toString().padStart(3, '0')}.png`
              episodeFolder.file(fileName, imageBuffer)
              totalPages++
            }
          }
        } catch (error) {
          const logger = getLogger().withContext({
            service: 'OutputService',
            operation: 'exportToZIP',
            jobId,
            episodeNumber: episode.episodeNumber,
          })
          logger.warn('Failed to parse layout JSON, skipping episode pages', {
            jobId,
            episodeNumber: episode.episodeNumber,
            error: error instanceof Error ? error.message : String(error),
          })
        }
      }
    }

    const zipBuffer = await zip.generateAsync({ type: 'nodebuffer' })
    const exportPath = await this.saveZip(userId, jobId, zipBuffer)
    return {
      exportFilePath: exportPath,
      fileSize: zipBuffer.length,
      pageCount: totalPages,
    }
  }
}
