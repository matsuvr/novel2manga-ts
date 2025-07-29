import * as dotenv from "dotenv";
dotenv.config();

import { promises as fs } from "fs";
import * as path from "path";
import { format } from "date-fns";
import { getChunkingConfig } from "./config";

// APIエンドポイントのベースURL
const API_BASE_URL = "http://localhost:3000/api";

// ログディレクトリ
const LOG_DIR = path.join(process.cwd(), "logs");

// ログファイル名（タイムスタンプ付き）
const LOG_FILE = path.join(LOG_DIR, `novel-processing-test-${format(new Date(), "yyyyMMdd-HHmmss")}.log`);

// ログ関数
async function log(message: string, data?: any) {
  const timestamp = new Date().toISOString();
  const logEntry = `[${timestamp}] ${message}${data ? '\n' + JSON.stringify(data, null, 2) : ''}\n`;
  
  console.log(logEntry);
  
  // ログディレクトリが存在しない場合は作成
  await fs.mkdir(LOG_DIR, { recursive: true });
  await fs.appendFile(LOG_FILE, logEntry);
}

// APIリクエストヘルパー
async function apiRequest(endpoint: string, method: string = "GET", body?: any, truncateLargeText: boolean = false) {
  const url = `${API_BASE_URL}${endpoint}`;
  const options: RequestInit = {
    method,
    headers: {
      "Content-Type": "application/json",
    },
  };
  
  if (body) {
    options.body = JSON.stringify(body);
  }
  
  // ログ用にボディをコピーして、長いテキストフィールドを切り詰める
  let logBody = body;
  if (body && endpoint === "/novel" && body.text) {
    logBody = {
      ...body,
      text: body.text.slice(0, 100) + (body.text.length > 100 ? "..." : ""),
      originalLength: body.text.length
    };
  } else if (body && truncateLargeText && body.chunkText) {
    logBody = {
      ...body,
      chunkText: body.chunkText.slice(0, 100) + (body.chunkText.length > 100 ? "..." : ""),
      originalLength: body.chunkText.length
    };
  }
  
  await log(`API Request: ${method} ${url}`, logBody);
  
  try {
    const response = await fetch(url, options);
    const data = await response.json();
    
    await log(`API Response: ${response.status} ${response.statusText}`, data);
    
    if (!response.ok) {
      throw new Error(`API error: ${response.status} ${response.statusText}`);
    }
    
    return data;
  } catch (error) {
    await log(`API Error: ${error}`);
    throw error;
  }
}

// 待機ヘルパー
async function wait(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// メインのテスト関数
async function testNovelProcessing() {
  await log("=== 小説処理テスト開始 ===");
  
  try {
    // 1. 小説ファイルの読み込み
    await log("ステップ1: 小説ファイルの読み込み");
    const novelPath = path.join(process.cwd(), "docs", "モルグ街の殺人事件.txt");
    const novelText = await fs.readFile(novelPath, "utf-8");
    await log(`小説ファイル読み込み完了: ${novelText.length}文字`);
    
    // 2. 小説のアップロード
    await log("ステップ2: 小説のアップロード");
    const uploadResponse = await apiRequest("/novel", "POST", {
      text: novelText,
    });
    
    const novelId = uploadResponse.uuid;
    await log(`小説アップロード完了: Novel ID = ${novelId}`);
    
    // 3. チャンク化の実行
    await log("ステップ3: チャンク化の実行");
    const chunkingConfig = getChunkingConfig();
    const chunkingResponse = await apiRequest(`/novel/${novelId}/chunks`, "POST", {
      chunkSize: chunkingConfig.defaultChunkSize,
      overlapSize: chunkingConfig.defaultOverlapSize
    });
    await log(`チャンク化完了: ${chunkingResponse.totalChunks}個のチャンクを生成`);
    
    // 4. チャンクの取得
    await log("ステップ4: チャンクの取得");
    const chunksResponse = await apiRequest(`/novel/${novelId}/chunks`);
    const chunks = chunksResponse.chunks || chunksResponse.data?.chunks || [];
    await log(`チャンク取得完了: ${chunks.length}個のチャンク`);
    
    // 5. 各チャンクの分析
    await log("ステップ5: チャンクの分析開始");
    const analysisResults = [];
    
    // チャンクのテキストを読み込み
    const chunksWithText = [];
    for (const chunk of chunks) {
      try {
        const chunkFilePath = path.join(process.cwd(), ".local-storage", "chunks", `${chunk.id}.json`);
        const chunkData = JSON.parse(await fs.readFile(chunkFilePath, "utf-8"));
        chunksWithText.push({
          ...chunk,
          text: chunkData.text,
          novelId: chunkData.novelId
        });
      } catch (error) {
        await log(`チャンク${chunk.id}のファイル読み込みエラー: ${error}`);
      }
    }
    
    for (let i = 0; i < Math.min(chunksWithText.length, 5); i++) { // 最初の5チャンクのみテスト
      const chunk = chunksWithText[i];
      await log(`チャンク${i}の分析開始 (ID: ${chunk.id})`);
      
      try {
        const analysisResponse = await apiRequest("/analyze/chunk", "POST", {
          chunkId: chunk.id,
          chunkText: chunk.text,
          chunkIndex: chunk.index,
          novelId: chunk.novelId,
        }, true);
        
        analysisResults.push({
          chunkIndex: chunk.index,
          chunkId: chunk.id,
          analysis: analysisResponse.data?.analysis || analysisResponse.analysis,
          summary: analysisResponse.data?.summary || analysisResponse.summary,
        });
        
        await log(`チャンク${i}の分析完了`, {
          summary: analysisResponse.data?.summary || analysisResponse.summary,
        });
        
        // レート制限を避けるため少し待機
        await wait(1000);
      } catch (error) {
        await log(`チャンク${i}の分析エラー: ${error}`);
      }
    }
    
    // 6. 分析結果のサマリー
    await log("ステップ6: 分析結果のサマリー");
    const totalSummary = {
      totalChunks: chunks.length,
      analyzedChunks: analysisResults.length,
      totalCharacters: 0,
      totalScenes: 0,
      totalDialogues: 0,
      totalHighlights: 0,
      totalSituations: 0,
    };
    
    analysisResults.forEach(result => {
      totalSummary.totalCharacters += result.summary.characterCount;
      totalSummary.totalScenes += result.summary.sceneCount;
      totalSummary.totalDialogues += result.summary.dialogueCount;
      totalSummary.totalHighlights += result.summary.highlightCount;
      totalSummary.totalSituations += result.summary.situationCount;
    });
    
    await log("分析結果サマリー", totalSummary);
    
    // 6. 詳細な分析結果の保存
    await log("ステップ6: 詳細な分析結果の保存");
    const detailsFile = path.join(LOG_DIR, `analysis-details-${format(new Date(), "yyyyMMdd-HHmmss")}.json`);
    await fs.writeFile(detailsFile, JSON.stringify(analysisResults, null, 2));
    await log(`詳細な分析結果を保存: ${detailsFile}`);
    
    // 7. DB内のデータ確認
    await log("ステップ7: データベース内のデータ確認");
    const dbNovelResponse = await apiRequest("/novel/db");
    await log("データベース内の小説一覧", dbNovelResponse.data || dbNovelResponse);
    
    await log("=== 小説処理テスト完了 ===");
    await log(`ログファイル: ${LOG_FILE}`);
    await log(`詳細結果ファイル: ${detailsFile}`);
    
  } catch (error) {
    await log(`テスト中にエラーが発生: ${error}`);
    if (error instanceof Error) {
      await log("エラー詳細", {
        message: error.message,
        stack: error.stack,
      });
    }
  }
}

// 実行
testNovelProcessing().catch(console.error);