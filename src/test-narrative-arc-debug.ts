import * as dotenv from "dotenv";
dotenv.config();

import { promises as fs } from "fs";
import * as path from "path";
import { format } from "date-fns";

// 既存のUUIDを使用
const NOVEL_UUID = "bbb7aa00-c954-42a1-b9cd-655b03d87b68";

// APIエンドポイントのベースURL
const API_BASE_URL = "http://localhost:3000/api";

// ログディレクトリ
const LOG_DIR = path.join(process.cwd(), "logs");

// ログファイル名（タイムスタンプ付き）
const LOG_FILE = path.join(LOG_DIR, `narrative-arc-debug-${format(new Date(), "yyyyMMdd-HHmmss")}.log`);

// タイムアウト設定（5分）
const TIMEOUT_MS = 5 * 60 * 1000;

// ログ関数
async function log(message: string, data?: any) {
  const timestamp = new Date().toISOString();
  const logEntry = `[${timestamp}] ${message}${data ? '\n' + JSON.stringify(data, null, 2) : ''}\n`;
  
  console.log(logEntry);
  
  // ログディレクトリが存在しない場合は作成
  await fs.mkdir(LOG_DIR, { recursive: true });
  await fs.appendFile(LOG_FILE, logEntry);
}

// ストレージから直接チャンクデータを読み込む
async function loadChunkData(novelId: string, chunkIndex: number) {
  try {
    const novelPath = path.join(".local-storage", "novels", `${novelId}.json`);
    const novelData = JSON.parse(await fs.readFile(novelPath, "utf-8"));
    
    // チャンクテキストを取得
    const startPos = chunkIndex * 4500; // オーバーラップを考慮した位置計算
    const endPos = Math.min(startPos + 5000, novelData.text.length);
    const chunkText = novelData.text.substring(startPos, endPos);
    
    return {
      text: chunkText,
      chunkIndex,
      startPosition: startPos,
      endPosition: endPos
    };
  } catch (error) {
    await log(`チャンクデータ読み込みエラー (chunk ${chunkIndex}):`, error);
    return null;
  }
}

// 分析結果を読み込む
async function loadAnalysisResult(novelId: string, chunkIndex: number) {
  try {
    const analysisPath = path.join(".local-storage", "analysis", novelId, `chunk_${chunkIndex}.json`);
    const analysisData = JSON.parse(await fs.readFile(analysisPath, "utf-8"));
    return analysisData.analysis;
  } catch (error) {
    await log(`分析結果読み込みエラー (chunk ${chunkIndex}):`, error);
    return null;
  }
}

// APIリクエストヘルパー（タイムアウト対応）
async function apiRequest(endpoint: string, method: string = "GET", body?: any, timeout: number = TIMEOUT_MS) {
  const url = `${API_BASE_URL}${endpoint}`;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);
  
  const options: RequestInit = {
    method,
    headers: {
      "Content-Type": "application/json",
    },
    signal: controller.signal,
  };
  
  if (body) {
    options.body = JSON.stringify(body);
  }
  
  await log(`API Request: ${method} ${url}`, body);
  
  try {
    const response = await fetch(url, options);
    const data = await response.json();
    
    await log(`API Response: ${response.status} ${response.statusText}`, data);
    
    if (!response.ok) {
      throw new Error(`API error: ${response.status} ${response.statusText} - ${JSON.stringify(data)}`);
    }
    
    return data;
  } catch (error: any) {
    if (error.name === 'AbortError') {
      await log(`API Timeout: ${endpoint} (${timeout}ms)`);
      throw new Error(`Request timeout after ${timeout}ms`);
    }
    await log(`API Error: ${error}`);
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

// 物語構造分析のデバッグテスト
async function testNarrativeArcDebug() {
  await log("=== 物語構造分析デバッグテスト開始 ===");
  await log(`対象小説UUID: ${NOVEL_UUID}`);
  
  try {
    // 1. ローカルストレージからデータを直接確認
    await log("ステップ1: ローカルストレージの確認");
    
    // 小説データの存在確認
    const novelPath = path.join(".local-storage", "novels", `${NOVEL_UUID}.json`);
    const novelExists = await fs.access(novelPath).then(() => true).catch(() => false);
    await log(`小説データ存在: ${novelExists}`);
    
    if (novelExists) {
      const novelData = JSON.parse(await fs.readFile(novelPath, "utf-8"));
      await log("小説データ概要:", {
        totalLength: novelData.text?.length || 0,
        hasText: !!novelData.text
      });
    }
    
    // 分析結果の確認
    const analysisDir = path.join(".local-storage", "analysis", NOVEL_UUID);
    const analysisFiles = await fs.readdir(analysisDir).catch(() => []);
    await log(`分析済みチャンク数: ${analysisFiles.length}`, analysisFiles);
    
    // 2. チャンクデータの準備状況を確認
    await log("ステップ2: チャンクデータの準備状況確認");
    
    // 各チャンクのデータと分析結果を確認
    for (let i = 0; i < 6; i++) {
      const chunkData = await loadChunkData(NOVEL_UUID, i);
      const analysisData = await loadAnalysisResult(NOVEL_UUID, i);
      
      await log(`チャンク${i}:`, {
        hasChunkData: !!chunkData,
        chunkTextLength: chunkData?.text?.length || 0,
        hasAnalysis: !!analysisData,
        characterCount: analysisData?.characters?.length || 0,
        highlightCount: analysisData?.highlights?.length || 0
      });
    }
    
    // 3. 適切なパラメータで物語構造分析を実行
    await log("ステップ3: 適切なパラメータで物語構造分析を実行");
    
    // バリデーションルールに従ったパラメータ
    const validRequest = {
      novelId: NOVEL_UUID,
      startChunkIndex: 0,
      targetChars: 20000,  // デフォルト値（appConfig.episode.targetCharsPerEpisode）
      minChars: 15000,     // 最小値の要件を満たす
      maxChars: 25000      // 最小値15000以上
    };
    
    await log("物語構造分析リクエスト（修正版）:", validRequest);
    
    try {
      const narrativeResponse = await apiRequest("/analyze/narrative-arc", "POST", validRequest, TIMEOUT_MS);
      
      await log("物語構造分析成功", {
        analyzedChunks: narrativeResponse.analyzedChunks,
        totalChars: narrativeResponse.totalChars,
        boundaries: narrativeResponse.boundaries?.length || 0,
        suggestions: narrativeResponse.suggestions
      });
      
      // 境界情報の詳細
      if (narrativeResponse.boundaries && narrativeResponse.boundaries.length > 0) {
        await log("エピソード境界の詳細:");
        for (const boundary of narrativeResponse.boundaries) {
          await log(`エピソード${boundary.episodeNumber}:`, {
            title: boundary.title,
            summary: boundary.summary?.substring(0, 200) + "...",
            charRange: boundary.charRange,
            estimatedPages: boundary.estimatedPages,
            confidence: boundary.confidence,
            reasoning: boundary.reasoning?.substring(0, 200) + "..."
          });
        }
      }
      
    } catch (error) {
      await log("物語構造分析エラー（詳細）:", error);
      
      // prepareNarrativeAnalysisInputの問題を調査
      await log("エラー分析: prepareNarrativeAnalysisInputがチャンクデータを見つけられない可能性");
      await log("推奨事項: storage.tsの実装をファイルシステムベースに変更する必要があります");
    }
    
    await log("=== 物語構造分析デバッグテスト完了 ===");
    
  } catch (error) {
    await log(`テストエラー: ${error}`);
    throw error;
  }
}

// 実行
testNarrativeArcDebug()
  .then(() => {
    console.log("デバッグテスト完了");
    process.exit(0);
  })
  .catch((error) => {
    console.error("デバッグテスト失敗:", error);
    process.exit(1);
  });