const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:8787';

export interface AnalyzeRequest {
  text: string;
}

export interface AnalyzeResponse {
  jobId: string;
  chunkCount: number;
  message: string;
}

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

export interface JobResponse {
  job: Job;
  chunks: Chunk[];
}

export class APIError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = 'APIError';
  }
}

export const api = {
  async analyzeText(text: string): Promise<AnalyzeResponse> {
    const response = await fetch(`${API_BASE_URL}/api/analyze`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ text }),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Unknown error' })) as { error?: string };
      throw new APIError(response.status, error.error || 'Failed to analyze text');
    }

    return response.json();
  },

  async getJob(jobId: string): Promise<JobResponse> {
    const response = await fetch(`${API_BASE_URL}/api/job/${jobId}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Unknown error' })) as { error?: string };
      throw new APIError(response.status, error.error || 'Failed to get job');
    }

    return response.json();
  },
};