import * as dotenv from "dotenv";
dotenv.config();

import { promises as fs } from "fs";
import * as path from "path";

const NOVEL_UUID = "bbb7aa00-c954-42a1-b9cd-655b03d87b68";
const API_BASE_URL = "http://localhost:3000/api";

async function testEpisodeSave() {
  console.log("=== エピソード保存テスト開始 ===");
  
  try {
    // 既存のエピソードファイルを削除
    const episodePath = path.join(".local-storage", "episodes", `${NOVEL_UUID}.json`);
    try {
      await fs.unlink(episodePath);
      console.log("既存のエピソードファイルを削除しました");
    } catch (error) {
      console.log("既存のエピソードファイルなし");
    }
    
    // 全体の物語構造分析を実行
    console.log("\n1. 全体の物語構造分析を実行");
    const response = await fetch(`${API_BASE_URL}/analyze/narrative-arc`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        novelId: NOVEL_UUID,
        startChunkIndex: 0,
        targetChars: 25000,
        minChars: 20000,
        maxChars: 30000
      })
    });
    
    if (!response.ok) {
      throw new Error(`API error: ${response.status}`);
    }
    
    const result = await response.json();
    console.log(`分析完了: ${result.boundaries.length}個のエピソード`);
    
    // 保存されたファイルを確認
    console.log("\n2. 保存されたエピソードファイルを確認");
    const savedData = JSON.parse(await fs.readFile(episodePath, "utf-8"));
    
    console.log(`保存されたエピソード数: ${savedData.boundaries.length}`);
    savedData.boundaries.forEach((boundary: any, index: number) => {
      console.log(`\nエピソード${index + 1}:`);
      console.log(`  タイトル: ${boundary.title}`);
      console.log(`  チャンク範囲: ${boundary.startChunk}-${boundary.endChunk}`);
      console.log(`  文字範囲: ${boundary.startCharIndex}-${boundary.endCharIndex}`);
    });
    
    console.log("\n=== テスト完了 ===");
    
  } catch (error) {
    console.error("テストエラー:", error);
    throw error;
  }
}

// 実行
testEpisodeSave()
  .then(() => {
    console.log("テスト成功");
    process.exit(0);
  })
  .catch((error) => {
    console.error("テスト失敗:", error);
    process.exit(1);
  });