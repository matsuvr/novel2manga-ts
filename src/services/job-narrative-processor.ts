import { DatabaseService } from "@/services/database";
import { analyzeNarrativeArc } from "@/agents/narrative-arc-analyzer";
import { prepareNarrativeAnalysisInput } from "@/utils/episode-utils";
import { getChunkData } from "@/utils/storage";
import { JobProgress, Episode, JobStatus } from "@/types/job";
import { appConfig } from "@/config/app.config";

export interface RetryableError extends Error {
  retryable: boolean;
  retryAfter?: number;
}

export interface NarrativeProcessorConfig {
  chunksPerBatch: number;
  overlapChars: number;
  targetCharsPerEpisode: number;
  minCharsPerEpisode: number;
  maxCharsPerEpisode: number;
  maxRetries: number;
  retryDelay: number;
}

export class JobNarrativeProcessor {
  private config: NarrativeProcessorConfig;

  constructor(
    private dbService: DatabaseService,
    config?: Partial<NarrativeProcessorConfig>
  ) {
    this.config = {
      chunksPerBatch: 20,
      overlapChars: 500,
      targetCharsPerEpisode: config?.targetCharsPerEpisode || appConfig.episode.targetCharsPerEpisode,
      minCharsPerEpisode: config?.minCharsPerEpisode || appConfig.episode.minCharsPerEpisode,
      maxCharsPerEpisode: config?.maxCharsPerEpisode || appConfig.episode.maxCharsPerEpisode,
      maxRetries: 3,
      retryDelay: 5000,
      ...config
    };
  }

  /**
   * ジョブの処理を開始または再開
   */
  async processJob(
    jobId: string,
    onProgress?: (progress: JobProgress) => void
  ): Promise<JobProgress> {
    const job = await this.dbService.getExtendedJob(jobId);
    if (!job) {
      throw new Error(`Job ${jobId} not found`);
    }

    // 既存の進捗を取得、または新規作成
    let progress = job.progress || this.createInitialProgress(jobId, job.chunkCount);

    // ステータスを処理中に更新
    await this.dbService.updateJobStatus(jobId, 'processing');

    try {
      while (!progress.isCompleted) {
        // 次のバッチ範囲を計算
        const startIndex = progress.currentChunkIndex;
        const endIndex = Math.min(
          startIndex + this.config.chunksPerBatch,
          progress.totalChunks
        );

        console.log(`Processing chunks ${startIndex} to ${endIndex} for job ${jobId}`);

        // チャンクデータを取得
        const chunkTexts: string[] = [];
        for (let i = startIndex; i < endIndex; i++) {
          const chunkData = await getChunkData(jobId, i);
          if (!chunkData) {
            throw new Error(`Chunk ${i} not found for job ${jobId}`);
          }
          chunkTexts.push(chunkData.content);
        }

        // 前回のエピソード終了部分を含める
        const previousEndText = this.getLastEpisodeEndText(progress);
        const { combinedText } = prepareNarrativeAnalysisInput(
          chunkTexts,
          previousEndText
        );

        // リトライ付きでナラティブアーク分析を実行
        const analysisResult = await this.executeWithRetry(
          () => analyzeNarrativeArc(
            combinedText,
            {
              targetCharsPerEpisode: this.config.targetCharsPerEpisode,
              minCharsPerEpisode: this.config.minCharsPerEpisode,
              maxCharsPerEpisode: this.config.maxCharsPerEpisode,
              isMiddleOfNovel: startIndex > 0,
              startingEpisodeNumber: progress.episodes.length + 1,
              previousEpisodeEndText: previousEndText
            }
          ),
          `Narrative arc analysis for chunks ${startIndex}-${endIndex}`
        );

        // エピソード境界を現在のバッチに適用
        const newEpisodes = this.convertBoundariesToEpisodes(
          analysisResult.episodeBoundaries,
          startIndex,
          previousEndText?.length || 0,
          jobId
        );

        // 進捗を更新
        progress = this.updateProgress(progress, newEpisodes, endIndex);

        // データベースに保存
        await this.dbService.updateJobProgress(jobId, progress);
        if (newEpisodes.length > 0) {
          await this.dbService.createEpisodes(newEpisodes);
        }

        // コールバック
        if (onProgress) {
          onProgress(progress);
        }
      }

      // 処理完了
      await this.dbService.updateJobStatus(jobId, 'completed');
      return progress;

    } catch (error) {
      // エラー時の処理
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      await this.dbService.updateJobStatus(jobId, 'failed', errorMessage);
      throw error;
    }
  }

  /**
   * 初期進捗を作成
   */
  private createInitialProgress(jobId: string, totalChunks: number): JobProgress {
    return {
      novelId: jobId,
      totalChunks,
      processedChunks: 0,
      currentChunkIndex: 0,
      episodes: [],
      isCompleted: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
  }

  /**
   * 最後のエピソード終了テキストを取得
   */
  private getLastEpisodeEndText(progress: JobProgress): string | undefined {
    if (!progress.lastProcessedText || progress.episodes.length === 0) {
      return undefined;
    }
    
    // オーバーラップ文字数分を返す
    const text = progress.lastProcessedText;
    return text.slice(-this.config.overlapChars);
  }

  /**
   * 境界情報をエピソードに変換
   */
  private convertBoundariesToEpisodes(
    boundaries: Array<{ startPosition: number; endPosition: number; confidence: number }>,
    startChunkIndex: number,
    previousTextLength: number,
    jobId: string
  ): Episode[] {
    const episodes: Episode[] = [];
    const existingEpisodeCount = boundaries.length;

    for (let i = 0; i < boundaries.length; i++) {
      const boundary = boundaries[i];
      
      // 文字位置からチャンク位置を計算（簡略化版）
      // 実際の実装では、チャンクごとの文字数を考慮する必要がある
      const avgCharsPerChunk = 2000; // 仮の値
      const adjustedStart = boundary.startPosition - previousTextLength;
      const adjustedEnd = boundary.endPosition - previousTextLength;
      
      episodes.push({
        jobId,
        episodeNumber: existingEpisodeCount + i + 1,
        startChunk: startChunkIndex + Math.floor(adjustedStart / avgCharsPerChunk),
        startCharIndex: adjustedStart % avgCharsPerChunk,
        endChunk: startChunkIndex + Math.floor(adjustedEnd / avgCharsPerChunk),
        endCharIndex: adjustedEnd % avgCharsPerChunk,
        estimatedPages: Math.ceil((boundary.endPosition - boundary.startPosition) / 1000), // 仮の計算
        confidence: boundary.confidence
      });
    }

    return episodes;
  }

  /**
   * 進捗を更新
   */
  private updateProgress(
    progress: JobProgress,
    newEpisodes: Episode[],
    newChunkIndex: number
  ): JobProgress {
    const lastEpisode = newEpisodes[newEpisodes.length - 1];
    
    return {
      ...progress,
      currentChunkIndex: newChunkIndex,
      processedChunks: newChunkIndex,
      episodes: [...progress.episodes, ...newEpisodes],
      lastEpisodeEndPosition: lastEpisode ? {
        chunkIndex: lastEpisode.endChunk,
        charIndex: lastEpisode.endCharIndex,
        episodeNumber: lastEpisode.episodeNumber
      } : progress.lastEpisodeEndPosition,
      isCompleted: newChunkIndex >= progress.totalChunks,
      updatedAt: new Date().toISOString()
    };
  }

  /**
   * ジョブの処理を再開可能かチェック
   */
  async canResumeJob(jobId: string): Promise<boolean> {
    const job = await this.dbService.getExtendedJob(jobId);
    return job !== null && 
           job.status !== 'completed' && 
           job.progress !== null &&
           !job.progress.isCompleted;
  }

  /**
   * リトライ付きで処理を実行
   */
  private async executeWithRetry<T>(
    fn: () => Promise<T>,
    operationName: string
  ): Promise<T> {
    let lastError: Error | undefined;
    
    for (let attempt = 0; attempt < this.config.maxRetries; attempt++) {
      try {
        return await fn();
      } catch (error) {
        lastError = error as Error;
        console.error(`${operationName} failed (attempt ${attempt + 1}/${this.config.maxRetries}):`, error);
        
        // リトライ可能なエラーかチェック
        if (!this.isRetryableError(error)) {
          throw error;
        }
        
        // 最後の試行でなければ待機
        if (attempt < this.config.maxRetries - 1) {
          const delay = this.getRetryDelay(error, attempt);
          console.log(`Retrying ${operationName} after ${delay}ms...`);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }
    
    throw lastError || new Error(`${operationName} failed after ${this.config.maxRetries} attempts`);
  }

  /**
   * エラーがリトライ可能かチェック
   */
  private isRetryableError(error: unknown): boolean {
    if (error instanceof Error) {
      // タイムアウトエラー
      if (error.message.includes('timeout')) return true;
      
      // ネットワークエラー
      if (error.message.includes('network') || error.message.includes('fetch')) return true;
      
      // レート制限エラー
      if (error.message.includes('rate limit') || error.message.includes('429')) return true;
      
      // 一時的なサーバーエラー
      if (error.message.includes('500') || error.message.includes('502') || error.message.includes('503')) return true;
      
      // RetryableErrorインターフェースを実装している場合
      if ('retryable' in error && (error as RetryableError).retryable) return true;
    }
    
    return false;
  }

  /**
   * リトライ遅延時間を計算
   */
  private getRetryDelay(error: unknown, attempt: number): number {
    // RetryableErrorでretryAfterが指定されている場合
    if (error && typeof error === 'object' && 'retryAfter' in error) {
      const retryableError = error as RetryableError;
      if (retryableError.retryAfter) {
        return retryableError.retryAfter;
      }
    }
    
    // 指数バックオフ
    return this.config.retryDelay * Math.pow(2, attempt);
  }
}