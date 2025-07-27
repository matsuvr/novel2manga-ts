export interface Job {
  id: string;
  originalText: string;
  chunkCount: number;
  createdAt: string;
  updatedAt: string;
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