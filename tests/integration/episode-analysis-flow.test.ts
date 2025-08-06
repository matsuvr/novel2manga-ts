/**
 * エピソード分析フロー統合テスト
 *
 * 宮本武蔵を使った長文小説のエピソード分析フローテスト：
 * 1. 小説の読み込み
 * 2. データベース登録
 * 3. チャンク分割
 * 4. エピソード分析API呼び出し
 * 5. 結果の検証
 */

import fs from 'node:fs/promises'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { DatabaseService } from '../../src/services/database'
import { StorageFactory } from '../../src/utils/storage'

describe('エピソード分析フロー統合テスト', () => {
  const testNovelPath = 'G:\\TsProjects\\novel2manga-mastra\\docs\\宮本武蔵地の巻.txt'
  let novelContent: string
  let novelId: string
  let jobId: string
  let dbService: DatabaseService
  let _chunks: any[]

  beforeAll(async () => {
    console.log('=== 宮本武蔵エピソード分析フローテスト初期化 ===')

    // 小説ファイルの読み込み
    try {
      novelContent = await fs.readFile(testNovelPath, 'utf-8')
      console.log(`✓ 小説ファイル読み込み完了: ${novelContent.length}文字`)
    } catch (_error) {
      throw new Error(`小説ファイルが見つかりません: ${testNovelPath}`)
    }

    // データベースとサービスの初期化
    const db = await StorageFactory.getDatabase()
    dbService = new DatabaseService(db)

    console.log('✓ サービス初期化完了')
  })

  afterAll(async () => {
    console.log('テスト終了')
  })

  it('小説を登録する', async () => {
    // 小説をデータベースに登録
    novelId = await dbService.createNovel({
      title: '宮本武蔵 地の巻',
      author: '吉川英治',
      originalTextPath: testNovelPath,
      textLength: novelContent.length,
      language: 'ja',
    })

    expect(novelId).toBeTypeOf('string')
    console.log(`✓ 小説登録完了: ID=${novelId}`)
  })

  it('正しいフローで小説登録→分析を実行する', async () => {
    console.log('--- 正しいフロー: 小説登録→分析 ---')

    // Step 1: /api/novelで小説を登録
    console.log('Step 1: 小説を/api/novelに登録中...')
    let novelResponse: Response
    try {
      novelResponse = await fetch('http://localhost:3000/api/novel', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          text: novelContent,
        }),
      })
    } catch (fetchError) {
      console.log('❌ /api/novel へのリクエスト失敗:', fetchError)
      throw fetchError // テストを失敗させる
    }

    if (!novelResponse.ok) {
      const errorText = await novelResponse.text()
      console.log(`❌ Novel API エラー: ${novelResponse.status} - ${errorText}`)
    }

    expect(novelResponse.ok).toBe(true)

    const novelResult = await novelResponse.json()
    expect(novelResult.uuid).toBeDefined()

    console.log(`✓ 小説登録完了: UUID=${novelResult.uuid}`)

    // Step 2: /api/analyzeで分析（チャンク分割も含む）
    console.log('Step 2: 登録済み小説の分析中...')
    const analyzeResponse = await fetch('http://localhost:3000/api/analyze', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        novelId: novelResult.uuid,
      }),
    })

    expect(analyzeResponse.ok).toBe(true)

    const analyzeResult = await analyzeResponse.json()

    expect(analyzeResult.jobId).toBeDefined()
    expect(analyzeResult.chunkCount).toBeGreaterThan(0)
    expect(analyzeResult.chunkCount).toBeGreaterThan(10) // 長文なので10個以上のチャンク

    // 分析結果のjobIdを使用
    jobId = analyzeResult.jobId

    console.log(`✓ 分析API完了: jobId=${jobId}, チャンク数=${analyzeResult.chunkCount}`)
  })

  it('エピソード分析APIエンドポイントを呼び出す', async () => {
    console.log('--- エピソード分析APIテスト ---')

    const episodeConfig = {
      targetCharsPerEpisode: 15000, // 長文テスト用に大きめに設定
      minCharsPerEpisode: 10000,
      maxCharsPerEpisode: 20000,
      useOpenRouter: true, // OpenRouterを明示的に使用
    }

    console.log(`POST /api/jobs/${jobId}/episodes を呼び出し中...`)
    console.log('設定:', episodeConfig)

    const startTime = Date.now()

    const response = await fetch(`http://localhost:3000/api/jobs/${jobId}/episodes`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        config: episodeConfig,
      }),
    })

    const responseTime = Date.now() - startTime
    console.log(`✓ APIレスポンス: ${response.status} (${responseTime}ms)`)

    if (!response.ok) {
      const errorText = await response.text()
      console.log(`API エラー詳細: ${response.status} - ${errorText}`)
    }
    expect(response.ok).toBe(true)

    const result = await response.json()
    console.log('✓ エピソード分析完了')
    console.log('結果サマリー:')
    console.log(`  - ステータス: ${result.status}`)
    console.log(`  - 処理時間: ${responseTime}ms`)

    // バックグラウンド処理が完了するまで待機
    if (result.status === 'processing') {
      console.log('バックグラウンド処理の完了を待機中...')
      let attempts = 0
      const maxAttempts = 30 // 最大5分待機

      while (attempts < maxAttempts) {
        await new Promise((resolve) => setTimeout(resolve, 10000)) // 10秒待機
        attempts++

        // ジョブのステータスを確認
        const statusResponse = await fetch(`http://localhost:3000/api/jobs/${jobId}/status`)
        if (statusResponse.ok) {
          const statusData = await statusResponse.json()
          console.log(`  処理状況 (${attempts * 10}秒経過): ${statusData.status}`)

          if (statusData.errorMessage) {
            console.log(`  エラー詳細: ${statusData.errorMessage}`)
          }

          if (statusData.status === 'completed' || statusData.episodeCompleted) {
            console.log('✓ バックグラウンド処理完了')
            break
          } else if (statusData.status === 'failed') {
            console.log('❌ バックグラウンド処理失敗')
            break
          }
        }
      }

      if (attempts >= maxAttempts) {
        console.log('⚠️ バックグラウンド処理のタイムアウト - 処理中のまま継続')
      }
    }

    if (result.episodes) {
      expect(result.episodes).toBeInstanceOf(Array)
      expect(result.episodes.length).toBeGreaterThan(0)

      console.log(`  - エピソード数: ${result.episodes.length}`)
      result.episodes.forEach((episode: any, index: number) => {
        console.log(`    Episode ${index + 1}: ${episode.title || 'タイトルなし'}`)
        console.log(`      概要: ${episode.summary?.substring(0, 50) || 'なし'}...`)
        console.log(`      チャンク範囲: ${episode.startChunkIndex}-${episode.endChunkIndex}`)

        // エピソードの基本構造を検証
        expect(episode).toHaveProperty('title')
        expect(episode).toHaveProperty('summary')
        expect(episode).toHaveProperty('startChunkIndex')
        expect(episode).toHaveProperty('endChunkIndex')
        expect(typeof episode.startChunkIndex).toBe('number')
        expect(typeof episode.endChunkIndex).toBe('number')
      })
    }

    // 処理時間が妥当な範囲内であることを確認（長文なので最大10分）
    expect(responseTime).toBeLessThan(600000) // 10分以内
  })

  it('データベースからエピソード結果を確認する', async () => {
    console.log('--- データベース確認 ---')

    const episodes = await dbService.getEpisodesByJobId(jobId)

    expect(episodes).toBeInstanceOf(Array)
    expect(episodes.length).toBeGreaterThan(0)

    console.log(`✓ データベースのエピソード数: ${episodes.length}`)

    episodes.forEach((episode, index) => {
      console.log(`  Episode ${index + 1} (DB): ${episode.title}`)
      console.log(`    ID: ${episode.id}`)
      console.log(`    チャンク: ${episode.startChunkIndex}-${episode.endChunkIndex}`)

      // データベースのエピソード構造を検証
      expect(episode).toHaveProperty('id')
      expect(episode).toHaveProperty('title')
      expect(episode).toHaveProperty('startChunkIndex')
      expect(episode).toHaveProperty('endChunkIndex')
      expect(episode.jobId).toBe(jobId)
    })
  })

  it('ジョブステータスを完了に更新する', async () => {
    await dbService.updateJobStatus(jobId, 'completed')

    const finalJob = await dbService.getJob(jobId)

    expect(finalJob?.status).toBe('completed')
    console.log(`✓ 最終ジョブステータス: ${finalJob?.status}`)
  })
})
