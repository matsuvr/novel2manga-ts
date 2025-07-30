export interface ChunkData {
  chunkIndex: number;
  text: string;
  startPosition: number;
  endPosition: number;
}

export interface ChunkAnalysisResult {
  summary: string;
  characters: Array<{
    name: string;
    description: string;
    firstAppearance: number;
  }>;
  scenes: Array<{
    location: string;
    time?: string;
    description: string;
    startIndex: number;
    endIndex: number;
  }>;
  dialogues: Array<{
    speakerId: string;
    text: string;
    emotion?: string;
    index: number;
  }>;
  highlights: Array<{
    type: 'climax' | 'turning_point' | 'emotional_peak' | 'action_sequence';
    description: string;
    importance: number;
    startIndex: number;
    endIndex: number;
    text?: string;
  }>;
  situations: Array<{
    description: string;
    index: number;
  }>;
}