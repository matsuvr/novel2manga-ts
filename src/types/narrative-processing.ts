// ナラティブ処理の状態管理用の型定義

export interface NarrativeProcessingState {
  novelId: string;
  totalChunks: number;
  processedChunks: number;
  currentChunkIndex: number;
  episodes: EpisodeInfo[];
  lastEpisodeEndPosition?: {
    chunkIndex: number;
    charIndex: number;
    episodeNumber: number;
  };
  lastProcessedText?: string; // 最後に処理したテキストの末尾部分
  isCompleted: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface EpisodeInfo {
  episodeNumber: number;
  title?: string;
  summary?: string;
  startChunk: number;
  startCharIndex: number;
  endChunk: number;
  endCharIndex: number;
  estimatedPages: number;
  confidence: number;
}

// 処理設定
export interface NarrativeProcessingConfig {
  chunksPerBatch: number; // 一度に処理するチャンク数
  overlapChars: number; // 前回の終わり部分として含める文字数
  targetCharsPerEpisode: number;
  minCharsPerEpisode: number;
  maxCharsPerEpisode: number;
}