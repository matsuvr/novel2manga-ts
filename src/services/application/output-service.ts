import { randomUUID } from 'node:crypto'
import JSZip from 'jszip'
import PDFDocument from 'pdfkit'
import type { Episode, NewOutput } from '@/db'
import { getStoragePorts } from '@/infrastructure/storage/ports'
import { adaptAll } from '@/repositories/adapters'
import { EpisodeRepository } from '@/repositories/episode-repository'
import { JobRepository } from '@/repositories/job-repository'
import { OutputRepository } from '@/repositories/output-repository'
import { getDatabaseService } from '@/services/db-factory'
import { parseMangaLayoutFromYaml } from '@/utils/layout-parser'
// StorageKeys は内部で直接使用しない

export class OutputService {
  private readonly outputRepo: OutputRepository
  private readonly ports = getStoragePorts()

  constructor() {
    const db = getDatabaseService()
    const { output } = adaptAll(db)
    this.outputRepo = new OutputRepository(output)
  }

  async create(payload: Omit<NewOutput, 'createdAt'>): Promise<string> {
    return this.outputRepo.create(payload)
  }

  async getById(id: string) {
    return this.outputRepo.getById(id)
  }

  async savePdf(jobId: string, data: Buffer): Promise<string> {
    return this.ports.output.putExport(jobId, 'pdf', data, { jobId })
  }

  async saveZip(jobId: string, data: Buffer): Promise<string> {
    return this.ports.output.putExport(jobId, 'zip', data, { jobId })
  }

  async getExportContent(path: string): Promise<Buffer | null> {
    const obj = await this.ports.output.getExport(path)
    if (!obj) return null
    // output storage returns base64 for binary
    try {
      const buf = Buffer.from(obj.text, 'base64')
      if (buf.length > 0) return buf
    } catch (_e) {
      // ignore base64 decoding failure; fall back to utf-8 buffer below
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
    episodeNumbers?: number[],
  ): Promise<{
    outputId: string
    exportFilePath: string
    fileSize: number
    pageCount: number
  }> {
    const db = getDatabaseService()
    const { episode: episodePort, job: jobPort } = adaptAll(db)
    const episodeRepo = new EpisodeRepository(episodePort)
    const jobRepo = new JobRepository(jobPort)

    const job = await jobRepo.getJob(jobId)
    if (!job) throw new Error('指定されたジョブが見つかりません')

    const allEpisodes = await episodeRepo.getByJobId(jobId)
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
        const pdf = await this.exportToPDF(jobId, targetEpisodes)
        exportFilePath = pdf.exportFilePath
        fileSize = pdf.fileSize
        pageCount = pdf.pageCount
        break
      }
      case 'images_zip': {
        const zip = await this.exportToZIP(jobId, targetEpisodes)
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
      await this.outputRepo.create({
        id: outputId,
        novelId: job.novelId,
        jobId,
        outputType: format === 'pdf' ? 'pdf' : 'images_zip',
        outputPath: exportFilePath,
        fileSize,
        pageCount,
        metadataPath: null,
      })
    } catch (e) {
      // DB 失敗時はストレージへ保存済みの成果物を削除して整合性維持
      try {
        const ports = getStoragePorts()
        await ports.output.deleteExport(exportFilePath)
      } catch {
        // 削除失敗は握りつぶして元のDBエラーを返す
      }
      throw e
    }

    return { outputId, exportFilePath, fileSize, pageCount }
  }

  private async exportToPDF(
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
      const mangaLayout = parseMangaLayoutFromYaml(layoutDataText)
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
          const exportPath = await this.savePdf(jobId, pdfBuffer)
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
        episodeFolder.file('layout.yaml', layoutText)
        try {
          const mangaLayout = parseMangaLayoutFromYaml(layoutText)
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
        } catch {
          // 読み取り不能な場合はスキップ（画像は出力可能な範囲で続行）
        }
      }
    }

    const zipBuffer = await zip.generateAsync({ type: 'nodebuffer' })
    const exportPath = await this.saveZip(jobId, zipBuffer)
    return {
      exportFilePath: exportPath,
      fileSize: zipBuffer.length,
      pageCount: totalPages,
    }
  }
}
