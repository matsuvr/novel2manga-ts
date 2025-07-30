import { ChunkData, ChunkAnalysisResult } from "@/types/chunk";
import { EpisodeBoundary } from "@/types/episode";
import { promises as fs } from "fs";
import * as path from "path";

// ベースストレージパス
const STORAGE_BASE = ".local-storage";

function getChunkKey(novelId: string, chunkIndex: number): string {
  return `${novelId}:${chunkIndex}`;
}

function getEpisodeKey(novelId: string): string {
  return novelId;
}

// ストレージパスヘルパー
function getNovelPath(novelId: string): string {
  return path.join(STORAGE_BASE, "novels", `${novelId}.json`);
}

function getAnalysisPath(novelId: string, chunkIndex: number): string {
  return path.join(STORAGE_BASE, "analysis", novelId, `chunk_${chunkIndex}.json`);
}

function getEpisodePath(novelId: string): string {
  return path.join(STORAGE_BASE, "episodes", `${novelId}.json`);
}

// ディレクトリ作成ヘルパー
async function ensureDir(dirPath: string): Promise<void> {
  await fs.mkdir(dirPath, { recursive: true });
}

export async function saveChunkData(
  novelId: string,
  chunkIndex: number,
  data: ChunkData
): Promise<void> {
  // メモリストレージは使用せず、小説データから動的に生成
  // チャンク情報はDBに保存されている
}

export async function getChunkData(
  novelId: string,
  chunkIndex: number
): Promise<ChunkData | null> {
  try {
    // 小説データから動的にチャンクを生成
    const novelPath = getNovelPath(novelId);
    const novelData = JSON.parse(await fs.readFile(novelPath, "utf-8"));
    
    if (!novelData.text) {
      return null;
    }
    
    // デフォルトのチャンク設定
    const chunkSize = 5000;
    const overlapSize = 500;
    
    // チャンク位置の計算
    const startPosition = chunkIndex * (chunkSize - overlapSize);
    const endPosition = Math.min(startPosition + chunkSize, novelData.text.length);
    
    if (startPosition >= novelData.text.length) {
      return null;
    }
    
    const text = novelData.text.substring(startPosition, endPosition);
    
    return {
      id: `chunk-${novelId}-${chunkIndex}`,
      novelId,
      chunkIndex,
      startPosition,
      endPosition,
      text,
      createdAt: new Date(),
      updatedAt: new Date()
    };
  } catch (error) {
    console.error(`Failed to get chunk data: ${error}`);
    return null;
  }
}

export async function saveChunkAnalysis(
  novelId: string,
  chunkIndex: number,
  analysis: ChunkAnalysisResult
): Promise<void> {
  const analysisPath = getAnalysisPath(novelId, chunkIndex);
  const dir = path.dirname(analysisPath);
  await ensureDir(dir);
  
  const data = {
    novelId,
    chunkIndex,
    analysis,
    savedAt: new Date().toISOString()
  };
  
  await fs.writeFile(analysisPath, JSON.stringify(data, null, 2));
}

export async function getChunkAnalysis(
  novelId: string,
  chunkIndex: number
): Promise<ChunkAnalysisResult | null> {
  try {
    const analysisPath = getAnalysisPath(novelId, chunkIndex);
    const data = JSON.parse(await fs.readFile(analysisPath, "utf-8"));
    return data.analysis || null;
  } catch (error) {
    console.error(`Failed to get chunk analysis: ${error}`);
    return null;
  }
}

export async function saveEpisodeBoundaries(
  novelId: string,
  boundaries: EpisodeBoundary[]
): Promise<void> {
  const episodePath = getEpisodePath(novelId);
  const dir = path.dirname(episodePath);
  await ensureDir(dir);
  
  // 既存のデータを読み込む
  let existingData: { novelId: string; boundaries: EpisodeBoundary[]; savedAt: string } | null = null;
  try {
    const fileContent = await fs.readFile(episodePath, "utf-8");
    existingData = JSON.parse(fileContent);
  } catch (error) {
    // ファイルが存在しない場合は新規作成
  }
  
  // 既存のboundariesと新しいboundariesをマージ
  let mergedBoundaries: EpisodeBoundary[] = [];
  
  if (existingData && existingData.boundaries) {
    // 既存のエピソードと新しいエピソードをマージ
    const existingMap = new Map<string, EpisodeBoundary>();
    
    // 既存のエピソードをMapに格納（startChunk-endChunkをキーとして）
    existingData.boundaries.forEach(boundary => {
      const key = `${boundary.startChunk}-${boundary.endChunk}`;
      existingMap.set(key, boundary);
    });
    
    // 新しいエピソードを追加（重複する場合は上書き）
    boundaries.forEach(boundary => {
      const key = `${boundary.startChunk}-${boundary.endChunk}`;
      existingMap.set(key, boundary);
    });
    
    // Mapから配列に変換し、startChunkでソート
    mergedBoundaries = Array.from(existingMap.values()).sort((a, b) => a.startChunk - b.startChunk);
    
    // エピソード番号を再割り当て
    mergedBoundaries.forEach((boundary, index) => {
      boundary.episodeNumber = index + 1;
    });
  } else {
    mergedBoundaries = boundaries;
  }
  
  const data = {
    novelId,
    boundaries: mergedBoundaries,
    savedAt: new Date().toISOString()
  };
  
  await fs.writeFile(episodePath, JSON.stringify(data, null, 2));
}

export async function getEpisodeBoundaries(
  novelId: string
): Promise<EpisodeBoundary[] | null> {
  try {
    const episodePath = getEpisodePath(novelId);
    const data = JSON.parse(await fs.readFile(episodePath, "utf-8"));
    return data.boundaries || null;
  } catch (error) {
    console.error(`Failed to get episode boundaries: ${error}`);
    return null;
  }
}

export async function getAllChunksForNovel(
  novelId: string
): Promise<ChunkData[]> {
  const chunks: ChunkData[] = [];
  
  try {
    // 小説データから全チャンクを生成
    const novelPath = getNovelPath(novelId);
    const novelData = JSON.parse(await fs.readFile(novelPath, "utf-8"));
    
    if (!novelData.text) {
      return [];
    }
    
    const chunkSize = 5000;
    const overlapSize = 500;
    const stepSize = chunkSize - overlapSize;
    const totalChunks = Math.ceil(novelData.text.length / stepSize);
    
    for (let i = 0; i < totalChunks; i++) {
      const chunk = await getChunkData(novelId, i);
      if (chunk) {
        chunks.push(chunk);
      }
    }
  } catch (error) {
    console.error(`Failed to get all chunks: ${error}`);
  }
  
  return chunks;
}

export async function clearNovelData(novelId: string): Promise<void> {
  try {
    // 小説データの削除
    const novelPath = getNovelPath(novelId);
    await fs.unlink(novelPath).catch(() => {});
    
    // 分析データの削除
    const analysisDir = path.dirname(getAnalysisPath(novelId, 0));
    await fs.rm(analysisDir, { recursive: true, force: true }).catch(() => {});
    
    // エピソードデータの削除
    const episodePath = getEpisodePath(novelId);
    await fs.unlink(episodePath).catch(() => {});
  } catch (error) {
    console.error(`Failed to clear novel data: ${error}`);
  }
}