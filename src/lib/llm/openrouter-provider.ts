import { createOpenAI } from "@ai-sdk/openai";

/**
 * OpenRouterプロバイダーの作成
 * OpenAI互換のAPIを使用するため、@ai-sdk/openaiを利用
 */
export function createOpenRouter(config: {
  apiKey?: string;
  baseURL?: string;
}) {
  return createOpenAI({
    baseURL: config.baseURL || 'https://openrouter.ai/api/v1',
    apiKey: config.apiKey || process.env.OPENROUTER_API_KEY || '',
    headers: {
      'HTTP-Referer': process.env.YOUR_SITE_URL || 'http://localhost:3000',
      'X-Title': process.env.YOUR_APP_NAME || 'Novel2Manga',
    },
  });
}