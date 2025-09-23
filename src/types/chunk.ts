// (Slimmed) chunk types: legacy analysis structures were removed, but
// some agents still rely on a lightweight analysis shape. We re-introduce
// a minimal, forward-compatible structure (no heavy legacy fields) so that
// analysis-dependent code can compile without resurrecting the full legacy model.

export interface ChunkData {
  chunkIndex: number
  text: string
  sfx?: string[]
}

export interface ChunkSummary {
  chunkIndex: number
  summary: string
}

// Lightweight per-chunk analysis types (only properties actually consumed
// by current agents). Add new facets here when needed; avoid bloating.
export interface ChunkCharacter {
  name: string
  description?: string
}

export interface ChunkScene {
  location: string
  description: string
  time?: string | null
}

export interface ChunkDialogue {
  speakerId: string
  text: string
  emotion?: string | null
}

export interface ChunkHighlight {
  startIndex: number
  endIndex: number
  type: string
  description: string
  importance: number
}

export interface ChunkSituation {
  description: string
}

// Summary is optional (some flows may only fill arrays). Keep arrays present
// to simplify consuming code (fallback to empty arrays instead of undefined).
export interface ChunkAnalysisResult {
  summary?: string
  characters: ChunkCharacter[]
  scenes: ChunkScene[]
  dialogues: ChunkDialogue[]
  highlights: ChunkHighlight[]
  situations: ChunkSituation[]
}

// Utility constructor for empty analysis (avoid duplicating literals)
export function createEmptyChunkAnalysis(): ChunkAnalysisResult {
  return {
    summary: '',
    characters: [],
    scenes: [],
    dialogues: [],
    highlights: [],
    situations: [],
  }
}
