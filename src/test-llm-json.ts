import * as dotenv from "dotenv";
dotenv.config();

import { createOpenAI } from "@ai-sdk/openai";
import { generateText } from "ai";

// ローカルLLMクライアントの作成
const localOpenAI = createOpenAI({
  baseURL: process.env.LOCAL_LLM_BASE_URL || 'http://localhost:1234/v1/',
  apiKey: 'dummy',
});

// テスト用のモデル
const model = localOpenAI(process.env.LOCAL_LLM_MODEL || 'magnum-v4-22b');

async function testLLMJson() {
  console.log("=== LLM JSON Mode テスト ===");
  console.log(`Base URL: ${process.env.LOCAL_LLM_BASE_URL}`);
  console.log(`Model: ${process.env.LOCAL_LLM_MODEL}`);
  
  try {
    console.log("\n1. response_format: json_object を使用したテスト...");
    const result = await generateText({
      model,
      prompt: `以下のJSON形式で、モルグ街の殺人事件の主要登場人物2人を挙げてください：
{
  "characters": [
    {
      "name": "キャラクター名",
      "description": "キャラクターの説明"
    }
  ]
}`,
      maxTokens: 500,
      // @ts-ignore - response_formatはOpenAI固有の機能
      experimental_providerMetadata: {
        openai: {
          response_format: { type: "json_object" }
        }
      }
    });
    
    console.log("成功！レスポンス:");
    console.log(result.text);
    
    // JSONパースを試みる
    try {
      const parsed = JSON.parse(result.text);
      console.log("\nパース成功:");
      console.log(JSON.stringify(parsed, null, 2));
    } catch (e) {
      console.log("\nJSONパース失敗:", e);
    }
    
  } catch (error) {
    console.error("エラー発生:");
    console.error(error);
  }
  
  console.log("\n2. 通常のテキスト生成でJSONを生成するテスト...");
  try {
    const result2 = await generateText({
      model,
      prompt: `以下のJSON形式で、モルグ街の殺人事件の主要登場人物2人を挙げてください。JSONのみを出力し、他の説明は不要です：
{
  "characters": [
    {
      "name": "キャラクター名",
      "description": "キャラクターの説明"
    }
  ]
}`,
      maxTokens: 500,
    });
    
    console.log("成功！レスポンス:");
    console.log(result2.text);
    
    // JSONパースを試みる
    try {
      const parsed = JSON.parse(result2.text);
      console.log("\nパース成功:");
      console.log(JSON.stringify(parsed, null, 2));
    } catch (e) {
      console.log("\nJSONパース失敗:", e);
    }
  } catch (error) {
    console.error("エラー発生:", error);
  }
}

testLLMJson().catch(console.error);