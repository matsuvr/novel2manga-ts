import { analyzeNarrativeArc } from "@/agents/narrative-arc-analyzer";
import { prepareNarrativeAnalysisInput } from "@/utils/episode-utils";
import { 
  loadNarrativeState, 
  saveNarrativeState, 
  createNarrativeState,
  addEpisodesToState,
  getNextChunkRange,
  getLastEpisodeEndText
} from "@/utils/narrative-state";
import { getChunkData } from "@/utils/storage";
import { NarrativeProcessingConfig, NarrativeProcessingState } from "@/types/narrative-processing";
import { appConfig } from "@/config/app.config";

export class NarrativeProcessor {
  private config: NarrativeProcessingConfig;

  constructor(config?: Partial<NarrativeProcessingConfig>) {
    this.config = {
      chunksPerBatch: 20, // デフォルト: 20チャンクずつ処理
      overlapChars: 500,   // デフォルト: 500文字のオーバーラップ
      targetCharsPerEpisode: config?.targetCharsPerEpisode || appConfig.episode.targetCharsPerEpisode,
      minCharsPerEpisode: config?.minCharsPerEpisode || appConfig.episode.minCharsPerEpisode,
      maxCharsPerEpisode: config?.maxCharsPerEpisode || appConfig.episode.maxCharsPerEpisode,
      ...config
    };
  }

  /**
   * 小説全体を処理してエピソード分割を行う
   */
  async processNovel(
    novelId: string,
    totalChunks: number,
    onProgress?: (state: NarrativeProcessingState) => void
  ): Promise<NarrativeProcessingState> {
    // 既存の状態を読み込むか、新規作成
    let state = await loadNarrativeState(novelId) || createNarrativeState(novelId, totalChunks);

    console.log(`Starting narrative processing for novel ${novelId}`);
    console.log(`Total chunks: ${totalChunks}, Starting from chunk: ${state.currentChunkIndex}`);

    while (!state.isCompleted) {
      try {
        // 次に処理すべきチャンク範囲を取得
        const range = getNextChunkRange(state, this.config.chunksPerBatch);
        if (!range) break;

        console.log(`Processing chunks ${range.startIndex} to ${range.endIndex}`);

        // 前回の終了テキストを取得
        const previousEndText = await getLastEpisodeEndText(
          state,
          async (chunkIndex) => {
            const chunkData = await getChunkData(novelId, chunkIndex);
            return chunkData?.text || null;
          },
          this.config.overlapChars
        );

        // ナラティブ分析用の入力を準備
        const analysisInput = await prepareNarrativeAnalysisInput({
          novelId,
          startChunkIndex: range.startIndex,
          targetChars: this.config.targetCharsPerEpisode * this.config.chunksPerBatch,
          minChars: this.config.minCharsPerEpisode,
          maxChars: this.config.maxCharsPerEpisode * this.config.chunksPerBatch,
        });

        if (!analysisInput) {
          console.error(`Failed to prepare input for chunks ${range.startIndex}-${range.endIndex}`);
          break;
        }

        // 長編小説の処理情報を追加
        analysisInput.startingEpisodeNumber = (state.lastEpisodeEndPosition?.episodeNumber || 0) + 1;
        analysisInput.previousEpisodeEndText = previousEndText;
        analysisInput.isMiddleOfNovel = state.currentChunkIndex > 0;

        // ナラティブアーク分析を実行
        console.log(`Analyzing narrative arc for chunks ${range.startIndex}-${range.endIndex}`);
        const boundaries = await analyzeNarrativeArc(analysisInput);

        // 最後に処理したチャンクのテキストを取得
        const lastChunk = analysisInput.chunks[analysisInput.chunks.length - 1];
        const lastProcessedText = lastChunk.text;

        // 状態を更新
        state = addEpisodesToState(
          state,
          boundaries,
          range.endIndex,
          lastProcessedText
        );

        // 状態を保存
        await saveNarrativeState(state);

        // 進捗をコールバック
        if (onProgress) {
          onProgress(state);
        }

        console.log(`Processed ${state.processedChunks}/${totalChunks} chunks`);
        console.log(`Found ${boundaries.length} episode boundaries`);
        console.log(`Total episodes so far: ${state.episodes.length}`);

      } catch (error) {
        console.error(`Error processing chunks:`, error);
        // エラーが発生しても状態は保存されているので、次回は続きから再開できる
        throw error;
      }
    }

    console.log(`Narrative processing completed. Total episodes: ${state.episodes.length}`);
    return state;
  }

  /**
   * 処理を再開する（中断された場合）
   */
  async resumeProcessing(
    novelId: string,
    totalChunks: number,
    onProgress?: (state: NarrativeProcessingState) => void
  ): Promise<NarrativeProcessingState> {
    const state = await loadNarrativeState(novelId);
    if (!state) {
      throw new Error(`No existing state found for novel ${novelId}`);
    }

    console.log(`Resuming processing from chunk ${state.currentChunkIndex}`);
    return this.processNovel(novelId, totalChunks, onProgress);
  }

  /**
   * 処理状態をリセット
   */
  async resetProcessing(novelId: string): Promise<void> {
    const state = createNarrativeState(novelId, 0);
    await saveNarrativeState(state);
  }
}