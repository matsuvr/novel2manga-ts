import { Agent } from "@mastra/core/agent";
import { openai } from "@ai-sdk/openai";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createGroq } from "@ai-sdk/groq";
import { createOpenAI } from "@ai-sdk/openai";
import { createOpenRouter } from "@/lib/llm/openrouter-provider";
import { getConfig } from "@/config/config-loader";
import type { AppConfig } from "@/config/app.config";

// 設定を取得
const config = getConfig();
const llmConfig = config.getPath<AppConfig['llm']>('llm');
const textAnalysisConfig = llmConfig.textAnalysis;

// プロバイダーの決定
const provider = textAnalysisConfig.provider === 'default' 
  ? llmConfig.defaultProvider 
  : textAnalysisConfig.provider;

// モデルの取得
function getModel() {
  const modelOverride = textAnalysisConfig.modelOverrides[provider];
  
  switch (provider) {
    case 'openai':
      return openai(modelOverride || llmConfig.providers.openai.model);
    case 'gemini': {
      const gemini = createGoogleGenerativeAI({
        apiKey: process.env.GOOGLE_GENERATIVE_AI_API_KEY || llmConfig.providers.gemini.apiKey,
      });
      return gemini(modelOverride || llmConfig.providers.gemini.model);
    }
    case 'groq': {
      const groq = createGroq({
        apiKey: llmConfig.providers.groq.apiKey,
      });
      return groq(modelOverride || llmConfig.providers.groq.model);
    }
    case 'local': {
      const localOpenAI = createOpenAI({
        baseURL: llmConfig.providers.local.baseURL,
        apiKey: 'dummy', // ローカルLLMではAPIキーは不要だがライブラリ仕様で必須
      });
      return localOpenAI(modelOverride || llmConfig.providers.local.model);
    }
    case 'openrouter': {
      const openrouter = createOpenRouter({
        apiKey: llmConfig.providers.openrouter.apiKey,
      });
      return openrouter(modelOverride || llmConfig.providers.openrouter.model);
    }
    default:
      throw new Error(`Unknown provider: ${provider}`);
  }
}

export const chunkAnalyzerAgent = new Agent({
  name: "chunk-analyzer",
  description: "小説のチャンクを分析して、キャラクター、場面、対話、ハイライト、状況を抽出するエージェント",
  instructions: textAnalysisConfig.systemPrompt,
  model: getModel(),
});