import fs from 'node:fs/promises'
import path from 'node:path'
import { type NextRequest, NextResponse } from 'next/server'
import { DatabaseService } from '@/services/database'
import { StorageService } from '@/services/storage'
import type { AnalyzeRequest, AnalyzeResponse } from '@/types/job'
import { getD1Database } from '@/utils/cloudflare-env'
import { generateChunkFileName, splitTextIntoChunks } from '@/utils/text-splitter'
import { generateUUID } from '@/utils/uuid'

export async function POST(request: NextRequest) {
  try {
    const body: AnalyzeRequest = await request.json()

    if (!body.text || body.text.trim().length === 0) {
      return NextResponse.json({ error: 'テキストが入力されていません' }, { status: 400 })
    }

    const jobId = generateUUID()
    const chunks = splitTextIntoChunks(body.text)

    // 開発環境では、D1の代わりにローカルファイルシステムを使用
    const isProduction = process.env.NODE_ENV === 'production'

    if (isProduction) {
      const db = getD1Database()
      const dbService = new DatabaseService(db)
      const storageService = new StorageService(global.NOVEL_STORAGE)

      // 元のテキストをR2に保存
      await storageService.saveNovel(jobId, body.text)

      // ジョブをD1に保存
      await dbService.createJob(jobId, body.text, chunks.length)

      // チャンクを保存
      const chunkPromises = chunks.map(async (content, index) => {
        const chunkId = generateUUID()
        const fileName = generateChunkFileName(jobId, index)

        // R2にチャンクファイルを保存
        await storageService.saveChunk(fileName, content)

        // D1にチャンク情報を保存
        await dbService.createChunk({
          id: chunkId,
          jobId,
          chunkIndex: index,
          content,
          fileName,
        })
      })

      await Promise.all(chunkPromises)
    } else {
      // 開発環境: ローカルファイルシステムを使用
      const baseDir = path.join(process.cwd(), '.local-storage')

      // 元のテキストを保存
      const novelPath = path.join(baseDir, 'novels', `${jobId}.json`)
      await fs.mkdir(path.dirname(novelPath), { recursive: true })
      await fs.writeFile(
        novelPath,
        JSON.stringify({
          id: jobId,
          text: body.text,
          createdAt: new Date().toISOString(),
        }),
        'utf-8',
      )

      // ジョブ情報を保存
      const jobPath = path.join(baseDir, 'jobs', `${jobId}.json`)
      await fs.mkdir(path.dirname(jobPath), { recursive: true })
      await fs.writeFile(
        jobPath,
        JSON.stringify({
          id: jobId,
          originalText: body.text,
          chunkCount: chunks.length,
          status: 'pending',
          processedChunks: 0,
          totalEpisodes: 0,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        }),
        'utf-8',
      )

      // チャンクを保存
      const chunksDir = path.join(baseDir, 'chunks', jobId)
      await fs.mkdir(chunksDir, { recursive: true })

      await Promise.all(
        chunks.map(async (content, index) => {
          const chunkPath = path.join(chunksDir, `chunk_${index}.txt`)
          await fs.writeFile(chunkPath, content, 'utf-8')
        }),
      )
    }

    const response: AnalyzeResponse = {
      jobId,
      chunkCount: chunks.length,
      message: `テキストを${chunks.length}個のチャンクに分割しました`,
    }

    return NextResponse.json(response)
  } catch (error) {
    console.error('分析エラー:', error)
    return NextResponse.json({ error: 'テキストの分析中にエラーが発生しました' }, { status: 500 })
  }
}
