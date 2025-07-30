import * as dotenv from "dotenv";
dotenv.config();

import { createOpenAI } from "@ai-sdk/openai";
import { generateObject } from "ai";
import { z } from "zod";

// ローカルLLMクライアントの作成
const localOpenAI = createOpenAI({
  baseURL: process.env.LOCAL_LLM_BASE_URL || 'http://localhost:1234/v1/',
  apiKey: 'dummy', // ローカルLLMではAPIキーは不要だがライブラリ仕様で必須
});

// テスト用のモデル
const model = localOpenAI(process.env.LOCAL_LLM_MODEL || 'qwen3-30b-a3b-erp-v0.1');

// 簡単なスキーマ
const testSchema = z.object({
  characters: z.array(z.object({
    name: z.string(),
    description: z.string(),
  })),
});

async function testLLMConnection() {
  console.log("=== LLM接続テスト ===");
  console.log(`Base URL: ${process.env.LOCAL_LLM_BASE_URL}`);
  console.log(`Model: ${process.env.LOCAL_LLM_MODEL}`);
  
  try {
    console.log("\n1. シンプルなテキスト生成テスト...");
    const result = await generateObject({
      model,
      schema: testSchema,
      prompt: "モルグ街の殺人事件の主要登場人物2人を挙げてください。",
      maxTokens: 500,
    });
    
    console.log("成功！レスポンス:");
    console.log(JSON.stringify(result.object, null, 2));
    
  } catch (error) {
    console.error("エラー発生:");
    console.error(error);
    
    if (error instanceof Error) {
      console.error("\nエラー詳細:");
      console.error("メッセージ:", error.message);
      console.error("スタック:", error.stack);
      
      // HTTPエラーの場合
      if ('response' in error) {
        const httpError = error as any;
        console.error("HTTPステータス:", httpError.response?.status);
        console.error("HTTPボディ:", httpError.response?.body);
      }
    }
  }
}

testLLMConnection().catch(console.error);