import { NarrativeProcessingState, EpisodeInfo } from "@/types/narrative-processing";
import { EpisodeBoundary } from "@/types/episode";
import { promises as fs } from "fs";
import * as path from "path";

const STATE_DIR = ".local-storage/narrative-state";

function getStatePath(novelId: string): string {
  return path.join(STATE_DIR, `${novelId}.json`);
}

// 状態を読み込む
export async function loadNarrativeState(
  novelId: string
): Promise<NarrativeProcessingState | null> {
  try {
    const statePath = getStatePath(novelId);
    const data = await fs.readFile(statePath, "utf-8");
    return JSON.parse(data);
  } catch (error) {
    // ファイルが存在しない場合はnullを返す
    return null;
  }
}

// 状態を保存する
export async function saveNarrativeState(
  state: NarrativeProcessingState
): Promise<void> {
  const statePath = getStatePath(state.novelId);
  const dir = path.dirname(statePath);
  
  // ディレクトリを作成
  await fs.mkdir(dir, { recursive: true });
  
  // 更新日時を設定
  state.updatedAt = new Date().toISOString();
  
  // ファイルに保存
  await fs.writeFile(statePath, JSON.stringify(state, null, 2), "utf-8");
}

// 新しい状態を作成
export function createNarrativeState(
  novelId: string,
  totalChunks: number
): NarrativeProcessingState {
  return {
    novelId,
    totalChunks,
    processedChunks: 0,
    currentChunkIndex: 0,
    episodes: [],
    isCompleted: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

// エピソード境界を状態に追加
export function addEpisodesToState(
  state: NarrativeProcessingState,
  boundaries: EpisodeBoundary[],
  lastProcessedChunkIndex: number,
  lastProcessedText: string
): NarrativeProcessingState {
  const newEpisodes: EpisodeInfo[] = boundaries.map(boundary => ({
    episodeNumber: boundary.episodeNumber,
    title: boundary.title,
    summary: boundary.summary,
    startChunk: boundary.startChunk,
    startCharIndex: boundary.startCharIndex,
    endChunk: boundary.endChunk,
    endCharIndex: boundary.endCharIndex,
    estimatedPages: boundary.estimatedPages,
    confidence: boundary.confidence,
  }));

  // 最後のエピソードの情報を記録
  const lastEpisode = boundaries[boundaries.length - 1];
  
  return {
    ...state,
    episodes: [...state.episodes, ...newEpisodes],
    processedChunks: lastProcessedChunkIndex + 1,
    currentChunkIndex: lastProcessedChunkIndex + 1,
    lastEpisodeEndPosition: lastEpisode ? {
      chunkIndex: lastEpisode.endChunk,
      charIndex: lastEpisode.endCharIndex,
      episodeNumber: lastEpisode.episodeNumber,
    } : state.lastEpisodeEndPosition,
    lastProcessedText: lastProcessedText.slice(-1000), // 最後の1000文字を保持
    isCompleted: lastProcessedChunkIndex >= state.totalChunks - 1,
    updatedAt: new Date().toISOString(),
  };
}

// 次に処理すべきチャンク範囲を計算
export function getNextChunkRange(
  state: NarrativeProcessingState,
  chunksPerBatch: number
): { startIndex: number; endIndex: number } | null {
  if (state.isCompleted) {
    return null;
  }

  const startIndex = state.currentChunkIndex;
  const endIndex = Math.min(
    startIndex + chunksPerBatch - 1,
    state.totalChunks - 1
  );

  return { startIndex, endIndex };
}

// 前回の終了位置以降のテキストを取得
export async function getLastEpisodeEndText(
  state: NarrativeProcessingState,
  getChunkText: (chunkIndex: number) => Promise<string | null>,
  overlapChars: number = 500
): Promise<string> {
  if (!state.lastEpisodeEndPosition) {
    return "";
  }

  const { chunkIndex, charIndex } = state.lastEpisodeEndPosition;
  const chunkText = await getChunkText(chunkIndex);
  
  if (!chunkText) {
    return "";
  }

  // 終了位置から最大overlapChars文字を取得
  const endText = chunkText.substring(
    Math.max(0, charIndex - overlapChars),
    charIndex
  );

  return endText;
}