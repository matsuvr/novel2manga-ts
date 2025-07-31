export type JobStatus = 'pending' | 'processing' | 'completed' | 'failed';

export interface Job {
  id: string;
  originalText: string;
  chunkCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface ExtendedJob extends Job {
  status: JobStatus;
  progress: JobProgress | null;
  errorMessage: string | null;
  processedChunks: number;
  totalEpisodes: number;
}

export interface JobProgress {
  novelId: string;
  totalChunks: number;
  processedChunks: number;
  currentChunkIndex: number;
  episodes: Episode[];
  lastEpisodeEndPosition?: {
    chunkIndex: number;
    charIndex: number;
    episodeNumber: number;
  };
  lastProcessedText?: string;
  isCompleted: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Episode {
  id?: string;
  jobId?: string;
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

export interface Chunk {
  id: string;
  jobId: string;
  chunkIndex: number;
  content: string;
  fileName: string;
  createdAt: string;
}

export interface AnalyzeRequest {
  text: string;
}

export interface AnalyzeResponse {
  jobId: string;
  chunkCount: number;
  message: string;
}

export interface JobResponse {
  job: Job;
  chunks: Chunk[];
}