import * as dotenv from "dotenv";
dotenv.config();

import { promises as fs } from "fs";
import * as path from "path";
import { format } from "date-fns";

// APIエンドポイントのベースURL
const API_BASE_URL = "http://localhost:3000/api";

// ログディレクトリ
const LOG_DIR = path.join(process.cwd(), "logs");

// ログファイル名（タイムスタンプ付き）
const LOG_FILE = path.join(LOG_DIR, `full-processing-test-${format(new Date(), "yyyyMMdd-HHmmss")}.log`);

// タイムアウト設定（30分）
const TIMEOUT_MS = 30 * 60 * 1000;

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
  
  // ログ用にボディを調整
  let logBody = body;
  if (body?.text && body.text.length > 200) {
    logBody = {
      ...body,
      text: body.text.slice(0, 200) + "...",
      originalLength: body.text.length
    };
  } else if (body?.chunkText && body.chunkText.length > 200) {
    logBody = {
      ...body,
      chunkText: body.chunkText.slice(0, 200) + "...",
      originalLength: body.chunkText.length
    };
  }
  
  await log(`API Request: ${method} ${url}`, logBody);
  
  try {
    const response = await fetch(url, options);
    const data = await response.json();
    
    await log(`API Response: ${response.status} ${response.statusText}`, 
      typeof data === 'object' && data.result ? 
        { ...data, result: '(省略)' } : data
    );
    
    if (!response.ok) {
      throw new Error(`API error: ${response.status} ${response.statusText}`);
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

// 待機ヘルパー
async function wait(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// メインの統合テスト関数
async function testFullProcessing() {
  await log("=== 小説処理統合テスト開始 ===");
  await log(`タイムアウト設定: ${TIMEOUT_MS / 1000 / 60}分`);
  
  try {
    // 1. 小説ファイルの読み込み
    await log("ステップ1: 小説ファイルの読み込み");
    const novelPath = path.join(process.cwd(), "docs", "空き家の冒険.txt");
    const novelText = await fs.readFile(novelPath, "utf-8");
    await log(`小説ファイル読み込み完了: ${novelText.length}文字`);
    
    // 2. 小説のアップロード
    await log("ステップ2: 小説のアップロード");
    const uploadResponse = await apiRequest("/novel", "POST", {
      text: novelText,
    });
    
    const { uuid, job } = uploadResponse;
    await log(`小説アップロード完了: UUID=${uuid}, JobID=${job?.id}`);
    
    // 3. チャンク分割
    await log("ステップ3: チャンク分割");
    const chunkResponse = await apiRequest(`/novel/${uuid}/chunks`, "POST", {
      chunkSize: 5000,
      overlapSize: 500,
    });
    
    await log(`チャンク分割完了: ${chunkResponse.totalChunks}個のチャンク`);
    
    // 4. チャンク情報の取得
    await log("ステップ4: チャンク情報の取得");
    const chunksInfo = await apiRequest(`/novel/${uuid}/chunks`);
    await log(`チャンク情報取得完了: ${chunksInfo.chunks.length}個`);
    
    // 5. 各チャンクの5要素抽出
    await log("ステップ5: 各チャンクの5要素抽出");
    const analysisResults = [];
    
    for (const chunk of chunksInfo.chunks) {
      await log(`チャンク${chunk.index}の分析開始`);
      
      try {
        const analysisResponse = await apiRequest("/analyze/chunk", "POST", {
          novelId: uuid, // novelIdに修正
          chunkId: chunk.id,
          chunkIndex: chunk.index,
          chunkText: "", // APIが自動的に取得するため空でOK
          provider: "gemini", // Geminiを使用
        }, TIMEOUT_MS); // 30分のタイムアウト
        
        analysisResults.push(analysisResponse);
        await log(`チャンク${chunk.index}の分析完了`, {
          characters: analysisResponse.result?.characters?.length || 0,
          scenes: analysisResponse.result?.scenes?.length || 0,
          dialogues: analysisResponse.result?.dialogues?.length || 0,
          highlights: analysisResponse.result?.highlights?.length || 0,
          situations: analysisResponse.result?.situations?.length || 0,
        });
        
        // レート制限を考慮して待機
        await wait(2000);
      } catch (error) {
        await log(`チャンク${chunk.index}の分析エラー: ${error}`);
        // エラーが発生しても続行
      }
    }
    
    await log(`5要素抽出完了: ${analysisResults.length}/${chunksInfo.chunks.length}チャンクを分析`);
    
    // 6. 物語構造分析（エピソード分割の前段階）
    await log("ステップ6: 物語構造分析");
    try {
      const narrativeResponse = await apiRequest("/analyze/narrative-arc", "POST", {
        text: novelText,
        provider: "gemini",
      }, TIMEOUT_MS);
      
      await log("物語構造分析完了", {
        stages: narrativeResponse.result?.stages?.length || 0,
        theme: narrativeResponse.result?.theme,
        climax: narrativeResponse.result?.climax,
      });
    } catch (error) {
      await log(`物語構造分析エラー: ${error}`);
    }
    
    // 7. エピソード分割（API未実装の場合はスキップ）
    await log("ステップ7: エピソード分割");
    try {
      // エピソード分割APIが実装されているか確認
      const episodesResponse = await apiRequest(`/novel/${uuid}/episodes`, "GET");
      await log("エピソード情報取得", episodesResponse);
    } catch (error) {
      await log("エピソード分割APIは未実装のようです", error);
      
      // エピソードAPIが未実装の場合、手動で分割を試みる
      await log("手動でエピソード分割を試みます");
      
      // ストレージから分析結果を集約して、エピソード境界を推定
      const totalChars = novelText.length;
      const targetCharsPerEpisode = 20000; // configから
      const estimatedEpisodes = Math.ceil(totalChars / targetCharsPerEpisode);
      
      await log(`推定エピソード数: ${estimatedEpisodes}`, {
        totalChars,
        targetCharsPerEpisode,
        averageCharsPerChunk: totalChars / chunksInfo.chunks.length,
      });
    }
    
    // 8. 結果のサマリー
    await log("=== テスト結果サマリー ===");
    await log("処理完了状況:", {
      novel: {
        uuid,
        length: novelText.length,
        title: "空き家の冒険",
      },
      chunks: {
        total: chunksInfo.chunks.length,
        analyzed: analysisResults.length,
      },
      analysis: {
        totalCharacters: analysisResults.reduce((sum, r) => 
          sum + (r.result?.characters?.length || 0), 0),
        totalScenes: analysisResults.reduce((sum, r) => 
          sum + (r.result?.scenes?.length || 0), 0),
        totalDialogues: analysisResults.reduce((sum, r) => 
          sum + (r.result?.dialogues?.length || 0), 0),
        totalHighlights: analysisResults.reduce((sum, r) => 
          sum + (r.result?.highlights?.length || 0), 0),
      },
    });
    
    await log("=== 統合テスト完了 ===");
    
  } catch (error) {
    await log(`テストエラー: ${error}`);
    throw error;
  }
}

// 実行
testFullProcessing()
  .then(() => {
    console.log("テスト完了");
    process.exit(0);
  })
  .catch((error) => {
    console.error("テスト失敗:", error);
    process.exit(1);
  });