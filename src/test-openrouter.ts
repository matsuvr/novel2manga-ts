import * as dotenv from "dotenv";
dotenv.config();

import { createOpenRouter } from "./lib/llm/openrouter-provider";
import { generateObject } from "ai";
import { z } from "zod";

// テスト用のスキーマ
const testSchema = z.object({
  characters: z.array(z.object({
    name: z.string(),
    description: z.string(),
  })),
});

async function testOpenRouter() {
  console.log("=== OpenRouter接続テスト ===");
  console.log(`API Key: ${process.env.OPENROUTER_API_KEY ? '設定済み' : '未設定'}`);
  console.log(`Model: qwen/qwen3-235b-a22b-2507:cerebras`);
  
  try {
    const openrouter = createOpenRouter({
      apiKey: process.env.OPENROUTER_API_KEY,
    });
    
    const model = openrouter('qwen/qwen3-235b-a22b-2507:cerebras');
    
    console.log("\n1. 構造化出力テスト...");
    const result = await generateObject({
      model,
      schema: testSchema,
      prompt: "エドガー・アラン・ポーの『モルグ街の殺人事件』の主要登場人物2人を挙げてください。",
      maxTokens: 500,
      temperature: 0.7,
    });
    
    console.log("\n成功！レスポンス:");
    console.log(JSON.stringify(result.object, null, 2));
    console.log("\n使用トークン数:", result.usage);
    
  } catch (error) {
    console.error("\nエラー発生:");
    console.error(error);
    
    if (error instanceof Error) {
      console.error("\nエラー詳細:");
      console.error("メッセージ:", error.message);
      
      // HTTPエラーの場合
      if ('response' in error) {
        const httpError = error as any;
        console.error("HTTPステータス:", httpError.response?.status);
        console.error("HTTPボディ:", httpError.response?.body);
      }
    }
  }
}

testOpenRouter().catch(console.error);