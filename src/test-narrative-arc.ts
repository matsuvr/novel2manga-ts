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
const LOG_FILE = path.join(LOG_DIR, `narrative-arc-test-${format(new Date(), "yyyyMMdd-HHmmss")}.log`);

// タイムアウト設定（10分）- 長文処理のため十分な時間を確保
const TIMEOUT_MS = 10 * 60 * 1000;

// ログ関数
async function log(message: string, data?: any) {
  const timestamp = new Date().toISOString();
  const logEntry = `[${timestamp}] ${message}${data ? '\n' + JSON.stringify(data, null, 2) : ''}\n`;
  
  console.log(logEntry);
  
  // ログディレクトリが存在しない場合は作成
  await fs.mkdir(LOG_DIR, { recursive: true });
  await fs.appendFile(LOG_FILE, logEntry);
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

// 物語構造分析のテスト
async function testNarrativeArcAnalysis() {
  await log("=== 物語構造分析（ナラティブアーク）テスト開始 ===");
  await log(`対象小説UUID: ${NOVEL_UUID}`);
  
  try {
    // 1. まずチャンク情報を取得
    await log("ステップ1: チャンク情報の取得");
    const chunksInfo = await apiRequest(`/novel/${NOVEL_UUID}/chunks`);
    await log(`チャンク情報取得完了: ${chunksInfo.chunks.length}個のチャンク`);
    
    // 2. 分析済みチャンクの確認
    await log("ステップ2: 分析済みチャンクの確認");
    let analyzedChunks = 0;
    for (const chunk of chunksInfo.chunks) {
      try {
        // ストレージから分析結果を読み込む（エラーが出なければ分析済み）
        const analysisPath = path.join(".local-storage", "analysis", NOVEL_UUID, `chunk_${chunk.index}.json`);
        await fs.access(analysisPath);
        analyzedChunks++;
      } catch {
        // ファイルが存在しない = 未分析
      }
    }
    await log(`分析済みチャンク: ${analyzedChunks}/${chunksInfo.chunks.length}`);
    
    // 3. 物語構造分析を実行（正しいパラメータで）
    await log("ステップ3: 物語構造分析の実行");
    
    // エピソード分割のために複数のチャンクをまとめて分析
    // 今回は全チャンクを1エピソードとして分析
    const narrativeRequest = {
      novelId: NOVEL_UUID,
      startChunkIndex: 0,  // 最初のチャンクから
      targetChars: 25000,  // 小説全体を1エピソードとして
      minChars: 20000,
      maxChars: 30000
    };
    
    await log("物語構造分析リクエスト:", narrativeRequest);
    
    try {
      const narrativeResponse = await apiRequest("/analyze/narrative-arc", "POST", narrativeRequest, TIMEOUT_MS);
      
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
            summary: boundary.summary,
            charRange: boundary.charRange,
            estimatedPages: boundary.estimatedPages,
            confidence: boundary.confidence,
            reasoning: boundary.reasoning
          });
        }
      }
      
    } catch (error) {
      await log("物語構造分析エラー:", error);
      
      // エラーの詳細を分析
      if (error instanceof Error && error.message.includes("400")) {
        await log("リクエストパラメータのエラーです。パラメータを確認してください。");
      }
    }
    
    // 4. 小説テキストを読み込んで、チャンクごとの分析も試す
    await log("ステップ4: チャンクごとの段階的分析");
    
    // 2チャンクずつ分析してみる（エピソードの候補として）
    const chunkGroups = [
      { start: 0, end: 1 }, // チャンク0-1
      { start: 2, end: 3 }, // チャンク2-3
      { start: 4, end: 5 }  // チャンク4-5
    ];
    
    for (const group of chunkGroups) {
      if (group.start < chunksInfo.chunks.length) {
        await log(`チャンク${group.start}-${group.end}の分析`);
        
        const groupRequest = {
          novelId: NOVEL_UUID,
          startChunkIndex: group.start,
          targetChars: 10000,  // 2チャンク分の目標
          minChars: 8000,
          maxChars: 12000
        };
        
        try {
          const groupResponse = await apiRequest("/analyze/narrative-arc", "POST", groupRequest, TIMEOUT_MS);
          await log(`チャンク${group.start}-${group.end}分析完了:`, {
            totalChars: groupResponse.totalChars,
            boundaries: groupResponse.boundaries?.length || 0
          });
        } catch (error) {
          await log(`チャンク${group.start}-${group.end}分析エラー:`, error);
        }
      }
    }
    
    await log("=== 物語構造分析テスト完了 ===");
    
  } catch (error) {
    await log(`テストエラー: ${error}`);
    throw error;
  }
}

// 実行
testNarrativeArcAnalysis()
  .then(() => {
    console.log("テスト完了");
    process.exit(0);
  })
  .catch((error) => {
    console.error("テスト失敗:", error);
    process.exit(1);
  });