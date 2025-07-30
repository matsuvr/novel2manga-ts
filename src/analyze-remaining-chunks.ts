import * as dotenv from "dotenv";
dotenv.config();

import { promises as fs } from "fs";
import * as path from "path";
import { format } from "date-fns";
import sqlite3 from 'sqlite3';
import { open } from 'sqlite';

// APIエンドポイントのベースURL
const API_BASE_URL = "http://localhost:3000/api";

// ログディレクトリ
const LOG_DIR = path.join(process.cwd(), "logs");

// ログファイル名（タイムスタンプ付き）
const LOG_FILE = path.join(LOG_DIR, `analyze-remaining-chunks-${format(new Date(), "yyyyMMdd-HHmmss")}.log`);

// データベースパス
const DB_PATH = path.join(process.cwd(), '.local-storage', 'novel2manga.db');

// 対象の小説UUID
const NOVEL_UUID = '0f6cbf28-18c5-40de-895a-2f17d5e26f08';

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
  if (body && truncateLargeText && body.chunkText) {
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

// メインの分析関数
async function analyzeRemainingChunks() {
  await log("=== 残りのチャンク分析開始 ===");
  
  const db = await open({
    filename: DB_PATH,
    driver: sqlite3.Database
  });
  
  try {
    // 1. 既に分析済みのチャンクを確認
    await log("ステップ1: 既存の分析結果を確認");
    const analyzedChunks = await db.all(
      `SELECT c.chunk_index, c.id as chunk_id
       FROM chunk_analyses ca
       JOIN chunks c ON ca.chunk_id = c.id
       WHERE c.novel_id = ?`,
      [NOVEL_UUID]
    );
    
    const analyzedIndices = new Set(analyzedChunks.map(c => c.chunk_index));
    await log(`分析済みチャンク: ${Array.from(analyzedIndices).sort().join(', ')}`);
    
    // 2. 全チャンクを取得
    await log("ステップ2: 全チャンクを取得");
    const allChunks = await db.all(
      'SELECT * FROM chunks WHERE novel_id = ? ORDER BY chunk_index',
      [NOVEL_UUID]
    );
    
    await log(`全チャンク数: ${allChunks.length}`);
    
    // 3. 未分析のチャンクを特定
    const unanalyzedChunks = allChunks.filter(chunk => !analyzedIndices.has(chunk.chunk_index));
    await log(`未分析チャンク数: ${unanalyzedChunks.length}`);
    await log(`未分析チャンクインデックス: ${unanalyzedChunks.map(c => c.chunk_index).join(', ')}`);
    
    if (unanalyzedChunks.length === 0) {
      await log("全てのチャンクが既に分析済みです");
      return;
    }
    
    // 4. 各未分析チャンクを順次分析
    await log("ステップ3: 未分析チャンクの分析開始");
    const analysisResults = [];
    
    for (const chunk of unanalyzedChunks) {
      await log(`チャンク${chunk.chunk_index}の分析開始 (ID: ${chunk.id})`);
      
      try {
        // チャンクのテキストを読み込み
        const chunkFilePath = path.join(process.cwd(), ".local-storage", "chunks", `${chunk.id}.json`);
        const chunkData = JSON.parse(await fs.readFile(chunkFilePath, "utf-8"));
        
        // 分析APIを呼び出し
        const analysisResponse = await apiRequest("/analyze/chunk", "POST", {
          chunkId: chunk.id,
          chunkText: chunkData.text,
          chunkIndex: chunk.chunk_index,
          novelId: NOVEL_UUID,
        }, true);
        
        analysisResults.push({
          chunkIndex: chunk.chunk_index,
          chunkId: chunk.id,
          analysis: analysisResponse.data?.analysis || analysisResponse.analysis,
          summary: analysisResponse.data?.summary || analysisResponse.summary,
        });
        
        await log(`チャンク${chunk.chunk_index}の分析完了`, {
          summary: analysisResponse.data?.summary || analysisResponse.summary,
        });
        
        // レート制限を避けるため少し待機
        await wait(1000);
      } catch (error) {
        await log(`チャンク${chunk.chunk_index}の分析エラー: ${error}`);
      }
    }
    
    // 5. 分析結果のサマリー
    await log("ステップ4: 分析結果のサマリー");
    const totalSummary = {
      analyzedChunks: analysisResults.length,
      totalCharacters: 0,
      totalScenes: 0,
      totalDialogues: 0,
      totalHighlights: 0,
      totalSituations: 0,
    };
    
    analysisResults.forEach(result => {
      if (result.summary) {
        totalSummary.totalCharacters += result.summary.characterCount || 0;
        totalSummary.totalScenes += result.summary.sceneCount || 0;
        totalSummary.totalDialogues += result.summary.dialogueCount || 0;
        totalSummary.totalHighlights += result.summary.highlightCount || 0;
        totalSummary.totalSituations += result.summary.situationCount || 0;
      }
    });
    
    await log("新規分析結果サマリー", totalSummary);
    
    // 6. 詳細な分析結果の保存
    await log("ステップ5: 詳細な分析結果の保存");
    const detailsFile = path.join(LOG_DIR, `remaining-analysis-details-${format(new Date(), "yyyyMMdd-HHmmss")}.json`);
    await fs.writeFile(detailsFile, JSON.stringify(analysisResults, null, 2));
    await log(`詳細な分析結果を保存: ${detailsFile}`);
    
    await log("=== 残りのチャンク分析完了 ===");
    await log(`ログファイル: ${LOG_FILE}`);
    await log(`詳細結果ファイル: ${detailsFile}`);
    
  } catch (error) {
    await log(`分析中にエラーが発生: ${error}`);
    if (error instanceof Error) {
      await log("エラー詳細", {
        message: error.message,
        stack: error.stack,
      });
    }
  } finally {
    await db.close();
  }
}

// 実行
analyzeRemainingChunks().catch(console.error);