import { randomUUID } from 'node:crypto'
import { load as yamlLoad } from 'js-yaml'
import JSZip from 'jszip'
import type { NextRequest } from 'next/server'
import PDFDocument from 'pdfkit'
import type { Episode } from '@/db'
import { adaptAll } from '@/repositories/adapters'
import { EpisodeRepository } from '@/repositories/episode-repository'
import { JobRepository } from '@/repositories/job-repository'
import { OutputRepository } from '@/repositories/output-repository'
import { getDatabaseService } from '@/services/db-factory'
import type { MangaLayout } from '@/types/panel-layout'
import { isMangaLayout } from '@/utils/type-guards'
import { handleApiError, successResponse, validationError } from '@/utils/api-error'
import { StorageFactory, StorageKeys } from '@/utils/storage'
import { validateJobId } from '@/utils/validators'

interface ExportRequest {
  jobId: string
  format: 'pdf' | 'images_zip'
  episodeNumbers?: number[]
}

interface ExportResponse {
  success: boolean
  jobId: string
  format: string
  downloadUrl: string | null
  message: string
  fileSize?: number
  pageCount?: number
  exportedAt: string
}

export async function POST(request: NextRequest): Promise<Response> {
  try {
    const body = (await request.json()) as Partial<ExportRequest>

    // バリデーション
    validateJobId(body.jobId)

    const validFormats = ['pdf', 'images_zip']
    if (!body.format || !validFormats.includes(body.format)) {
      return validationError('有効なformatが必要です（pdf, images_zip）')
    }

    // データベースサービスの初期化
    const dbService = getDatabaseService()
    const { episode: episodePort, output: outputPort, job: jobPort } = adaptAll(dbService)
    const episodeRepo = new EpisodeRepository(episodePort)
    const outputRepo = new OutputRepository(outputPort)
    const jobRepo = new JobRepository(jobPort)

    // ジョブの存在確認
    const job = await jobRepo.getJob(body.jobId)
    if (!job) {
      return validationError('指定されたジョブが見つかりません')
    }

    // エピソードの取得
    const allEpisodes = await episodeRepo.getByJobId(body.jobId)

    // エクスポート対象エピソードの決定
    let targetEpisodes = allEpisodes
    if (body.episodeNumbers && body.episodeNumbers.length > 0) {
      targetEpisodes = allEpisodes.filter((episode) =>
        body.episodeNumbers?.includes(episode.episodeNumber),
      )
    }

    if (targetEpisodes.length === 0) {
      return validationError('エクスポート対象のエピソードが見つかりません')
    }

    console.log(
      `エクスポート開始: Job ${body.jobId}, Format ${
        body.format
      }, Episodes: ${targetEpisodes.map((e) => e.episodeNumber).join(', ')}`,
    )

    let exportFilePath: string
    let fileSize: number
    let pageCount: number

    switch (body.format) {
      case 'pdf':
        ;({ exportFilePath, fileSize, pageCount } = await exportToPDF(body.jobId, targetEpisodes))
        break
      case 'images_zip':
        ;({ exportFilePath, fileSize, pageCount } = await exportToZIP(body.jobId, targetEpisodes))
        break
      default:
        return validationError('サポートされていないフォーマットです')
    }

    // 成果物テーブルに記録（衝突回避のためUUIDを使用）
    const outputId = `out_${randomUUID()}`
    await outputRepo.create({
      id: outputId,
      novelId: job.novelId,
      jobId: body.jobId,
      outputType: body.format,
      outputPath: exportFilePath,
      fileSize,
      pageCount,
      metadataPath: null,
    })

    console.log(`エクスポート完了: ${exportFilePath} (${fileSize} bytes, ${pageCount} pages)`)

    return successResponse(
      {
        success: true,
        jobId: body.jobId,
        format: body.format,
        downloadUrl: `/api/export/download/${outputId}`,
        message: `${body.format.toUpperCase()}形式でのエクスポートが完了しました`,
        fileSize,
        pageCount,
        exportedAt: new Date().toISOString(),
      } as ExportResponse,
      201,
    )
  } catch (error) {
    console.error('Export API error:', error)
    return handleApiError(error)
  }
}

// isMangaLayout is imported from utils/type-guards (Zod-backed)

async function exportToPDF(
  jobId: string,
  episodes: Episode[],
): Promise<{ exportFilePath: string; fileSize: number; pageCount: number }> {
  const renderStorage = await StorageFactory.getRenderStorage()

  // PDF作成
  const doc = new PDFDocument({
    size: 'A4',
    layout: 'landscape', // 横向き（マンガページに適している）
    margins: {
      top: 0,
      bottom: 0,
      left: 0,
      right: 0,
    },
  })

  const chunks: Buffer[] = []
  doc.on('data', (chunk) => chunks.push(chunk))
  doc.on('end', () => {
    // PDF生成完了
  })

  let totalPages = 0

  // エピソード順にページを追加
  for (const episode of episodes.sort((a, b) => a.episodeNumber - b.episodeNumber)) {
    console.log(`PDF生成: Episode ${episode.episodeNumber}`)

    // エピソードのレイアウトYAMLを取得
    let mangaLayout: MangaLayout
    try {
      const layoutKey = StorageKeys.episodeLayout(jobId, episode.episodeNumber)
      const layoutData = await renderStorage.get(layoutKey)
      if (!layoutData) {
        console.warn(`レイアウトが見つかりません: ${layoutKey}`)
        continue
      }
      const parsed = yamlLoad(layoutData.text)
      if (!isMangaLayout(parsed)) {
        console.warn(`レイアウト形式が不正です: ${layoutKey}`)
        continue
      }
      mangaLayout = parsed
    } catch (error) {
      console.warn(`レイアウト解析エラー Episode ${episode.episodeNumber}:`, error)
      continue
    }

    // ページごとにレンダリング画像を追加
    if (mangaLayout.pages) {
      for (const page of mangaLayout.pages.sort((a, b) => a.page_number - b.page_number)) {
        try {
          const pageImageKey = StorageKeys.pageRender(
            jobId,
            episode.episodeNumber,
            page.page_number,
          )
          const imageData = await renderStorage.get(pageImageKey)

          if (imageData?.text) {
            // Base64データをBufferに変換
            const imageBuffer = Buffer.from(imageData.text, 'base64')

            // 新しいページを追加
            if (totalPages > 0) {
              doc.addPage()
            }

            // 画像をページ全体に配置
            doc.image(imageBuffer, 0, 0, {
              fit: [doc.page.width, doc.page.height],
              align: 'center',
              valign: 'center',
            })

            totalPages++
          } else {
            console.warn(`画像が見つかりません: ${pageImageKey}`)
          }
        } catch (error) {
          console.warn(
            `画像処理エラー Episode ${episode.episodeNumber}, Page ${page.page_number}:`,
            error,
          )
        }
      }
    }
  }

  // PDFを完成
  doc.end()

  return new Promise((resolve, reject) => {
    doc.on('end', async () => {
      try {
        const pdfBuffer = Buffer.concat(chunks)
        const outputStorage = await StorageFactory.getOutputStorage()
        const exportPath = StorageKeys.exportOutput(jobId, 'pdf')

        await outputStorage.put(exportPath, pdfBuffer, {
          contentType: 'application/pdf',
          jobId: jobId,
          type: 'pdf_export',
        })

        resolve({
          exportFilePath: exportPath,
          fileSize: pdfBuffer.length,
          pageCount: totalPages,
        })
      } catch (error) {
        reject(error)
      }
    })
  })
}

async function exportToZIP(
  jobId: string,
  episodes: Episode[],
): Promise<{ exportFilePath: string; fileSize: number; pageCount: number }> {
  const renderStorage = await StorageFactory.getRenderStorage()
  const zip = new JSZip()

  let totalPages = 0

  // エピソード順にファイルを追加
  for (const episode of episodes.sort((a, b) => a.episodeNumber - b.episodeNumber)) {
    console.log(`ZIP生成: Episode ${episode.episodeNumber}`)

    const episodeFolder = zip.folder(`episode_${episode.episodeNumber.toString().padStart(3, '0')}`)
    if (!episodeFolder) continue

    // エピソードのレイアウトYAMLを追加
    try {
      const layoutKey = StorageKeys.episodeLayout(jobId, episode.episodeNumber)
      const layoutData = await renderStorage.get(layoutKey)
      if (layoutData) {
        episodeFolder.file('layout.yaml', layoutData.text)

        const parsed = yamlLoad(layoutData.text)
        if (!isMangaLayout(parsed)) {
          console.warn(`レイアウト形式が不正です: ${layoutKey}`)
          continue
        }
        const mangaLayout = parsed

        // ページ画像を追加
        if (mangaLayout.pages) {
          for (const page of mangaLayout.pages.sort((a, b) => a.page_number - b.page_number)) {
            try {
              const pageImageKey = StorageKeys.pageRender(
                jobId,
                episode.episodeNumber,
                page.page_number,
              )
              const imageData = await renderStorage.get(pageImageKey)

              if (imageData?.text) {
                const imageBuffer = Buffer.from(imageData.text, 'base64')
                const fileName = `page_${page.page_number.toString().padStart(3, '0')}.png`
                episodeFolder.file(fileName, imageBuffer)
                totalPages++
              }
            } catch (error) {
              console.warn(
                `画像処理エラー Episode ${episode.episodeNumber}, Page ${page.page_number}:`,
                error,
              )
            }
          }
        }
      }
    } catch (error) {
      console.warn(`レイアウト処理エラー Episode ${episode.episodeNumber}:`, error)
    }
  }

  // メタデータファイルを追加
  const metadata = {
    jobId,
    exportDate: new Date().toISOString(),
    totalEpisodes: episodes.length,
    totalPages,
    episodes: episodes.map((e) => ({
      episodeNumber: e.episodeNumber,
      title: e.title,
      estimatedPages: e.estimatedPages,
    })),
  }
  zip.file('metadata.json', JSON.stringify(metadata, null, 2))

  // ZIPファイルを生成
  const zipBuffer = await zip.generateAsync({ type: 'nodebuffer' })

  const outputStorage = await StorageFactory.getOutputStorage()
  const exportPath = StorageKeys.exportOutput(jobId, 'zip')

  await outputStorage.put(exportPath, zipBuffer, {
    contentType: 'application/zip',
    jobId: jobId,
    type: 'zip_export',
  })

  return {
    exportFilePath: exportPath,
    fileSize: zipBuffer.length,
    pageCount: totalPages,
  }
}
