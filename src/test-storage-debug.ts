import * as dotenv from "dotenv";
dotenv.config();

import { getChunkData, getChunkAnalysis } from "@/utils/storage";
import { prepareNarrativeAnalysisInput } from "@/utils/episode-utils";

const NOVEL_UUID = "bbb7aa00-c954-42a1-b9cd-655b03d87b68";

async function debugStorage() {
  console.log("=== ストレージデバッグテスト ===");
  
  try {
    // 1. チャンクデータの取得テスト
    console.log("\n1. チャンクデータ取得テスト:");
    for (let i = 0; i < 3; i++) {
      const chunkData = await getChunkData(NOVEL_UUID, i);
      console.log(`チャンク${i}:`, {
        hasData: !!chunkData,
        textLength: chunkData?.text?.length || 0,
        startPosition: chunkData?.startPosition,
        endPosition: chunkData?.endPosition,
      });
    }
    
    // 2. 分析結果の取得テスト
    console.log("\n2. 分析結果取得テスト:");
    for (let i = 0; i < 3; i++) {
      const analysis = await getChunkAnalysis(NOVEL_UUID, i);
      console.log(`チャンク${i}分析:`, {
        hasAnalysis: !!analysis,
        characterCount: analysis?.characters?.length || 0,
        highlightCount: analysis?.highlights?.length || 0,
        hasSummary: !!analysis?.summary,
      });
      
      // 詳細確認
      if (analysis?.highlights) {
        console.log(`  ハイライト詳細:`, analysis.highlights.slice(0, 2));
      }
    }
    
    // 3. prepareNarrativeAnalysisInputのテスト
    console.log("\n3. prepareNarrativeAnalysisInputテスト:");
    try {
      const input = await prepareNarrativeAnalysisInput({
        novelId: NOVEL_UUID,
        startChunkIndex: 0,
        targetChars: 10000,
        minChars: 5000,
        maxChars: 15000,
      });
      
      if (input) {
        console.log("入力データ準備成功:", {
          chunkCount: input.chunks.length,
          firstChunk: {
            index: input.chunks[0].chunkIndex,
            textLength: input.chunks[0].text.length,
            characterCount: input.chunks[0].characters?.length || 0,
            highlightCount: input.chunks[0].highlights?.length || 0,
          },
          totalChars: input.chunks.reduce((sum, c) => sum + c.text.length, 0),
        });
        
        // ハイライトの詳細を確認
        console.log("\nハイライト情報:");
        input.chunks.forEach(chunk => {
          if (chunk.highlights && chunk.highlights.length > 0) {
            console.log(`チャンク${chunk.chunkIndex}:`, chunk.highlights.slice(0, 2));
          }
        });
      } else {
        console.log("入力データ準備失敗: nullが返されました");
      }
    } catch (error) {
      console.error("prepareNarrativeAnalysisInputエラー:", error);
    }
    
  } catch (error) {
    console.error("テストエラー:", error);
  }
}

// 実行
debugStorage()
  .then(() => console.log("\n=== デバッグテスト完了 ==="))
  .catch((error) => console.error("デバッグテスト失敗:", error));