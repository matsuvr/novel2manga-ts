import { type NextRequest, NextResponse } from 'next/server'
import { DatabaseService } from '@/services/database'
import { StorageFactory, StorageKeys } from '@/utils/storage'

export async function GET(request: NextRequest, { params }: { params: { jobId: string } }) {
  try {
    const { searchParams } = new URL(request.url)
    const episodeParam = searchParams.get('episode')
    const pageParam = searchParams.get('page')
    
    const dbService = new DatabaseService()
    
    // ジョブの存在確認
    const job = await dbService.getJob(params.jobId)
    if (!job) {
      return NextResponse.json({ error: 'Job not found' }, { status: 404 })
    }
    
    // エピソード番号のバリデーション
    let episodeNum: number | undefined
    if (episodeParam) {
      episodeNum = Number(episodeParam)
      if (Number.isNaN(episodeNum) || episodeNum < 1) {
        return NextResponse.json(
          { error: 'Invalid episode number' },
          { status: 400 }
        )
      }
    }
    
    // ページ番号のバリデーション
    let pageNum: number | undefined
    if (pageParam) {
      pageNum = Number(pageParam)
      if (Number.isNaN(pageNum) || pageNum < 1) {
        return NextResponse.json(
          { error: 'Invalid page number' },
          { status: 400 }
        )
      }
    }
    
    // エピソード一覧を取得
    const episodes = await dbService.getEpisodesByJobId(params.jobId)
    
    if (episodes.length === 0) {
      return NextResponse.json({
        jobId: params.jobId,
        status: 'no_episodes',
        renderStatus: [],
        message: 'No episodes found for this job'
      })
    }
    
    // 指定されたエピソードのレンダリング状態を確認
    const renderStorage = await StorageFactory.getRenderStorage()
    const renderStatus = []
    
    for (const episode of episodes) {
      // エピソード番号でフィルタリング
      if (episodeNum && episode.episodeNumber !== episodeNum) {
        continue
      }
      
      const episodeStatus = {
        episodeNumber: episode.episodeNumber,
        title: episode.title,
        pages: [] as Array<{
          pageNumber: number
          isRendered: boolean
          imagePath?: string
          thumbnailPath?: string
          width?: number
          height?: number
          fileSize?: number
        }>
      }
      
      // ページ数は仮に10ページとして処理（実際のレイアウトから取得すべき）
      const totalPages = 10
      
      for (let pageNumber = 1; pageNumber <= totalPages; pageNumber++) {
        // ページ番号でフィルタリング
        if (pageNum && pageNumber !== pageNum) {
          continue
        }
        
        const renderKey = StorageKeys.pageRender(params.jobId, episode.episodeNumber, pageNumber)
        const thumbnailKey = StorageKeys.pageThumbnail(params.jobId, episode.episodeNumber, pageNumber)
        
        try {
          const renderInfo = await renderStorage.head(renderKey)
          const isRendered = !!renderInfo
          
          episodeStatus.pages.push({
            pageNumber,
            isRendered,
            imagePath: isRendered ? renderKey : undefined,
            thumbnailPath: isRendered ? thumbnailKey : undefined,
            width: isRendered ? 842 : undefined,
            height: isRendered ? 595 : undefined,
            fileSize: isRendered ? renderInfo?.size : undefined
          })
        } catch {
          // ファイルが存在しない場合
          episodeStatus.pages.push({
            pageNumber,
            isRendered: false
          })
        }
      }
      
      renderStatus.push(episodeStatus)
    }
    
    return NextResponse.json({
      jobId: params.jobId,
      status: 'success',
      renderStatus,
      totalEpisodes: episodes.length,
      filteredEpisodes: renderStatus.length,
      filteredPages: renderStatus.reduce((total, episode) => total + episode.pages.length, 0)
    })
    
  } catch (error) {
    console.error('Error fetching render status:', error)
    return NextResponse.json(
      { error: 'Failed to fetch render status' },
      { status: 500 }
    )
  }
}