import { createOpenAI } from '@ai-sdk/openai'
import { createGoogleGenerativeAI } from '@ai-sdk/google'
import { createGroq } from '@ai-sdk/groq'
import { getTextAnalysisConfig, getLayoutGenerationConfig, getLLMProviderConfig } from '@/config'

// プロバイダーインスタンスのキャッシュ
const providerCache = {
  openai: null as ReturnType<typeof createOpenAI> | null,
  gemini: null as ReturnType<typeof createGoogleGenerativeAI> | null,
  groq: null as ReturnType<typeof createGroq> | null,
}

// プロバイダーインスタンスを取得
function getProviderInstance(provider: 'openai' | 'gemini' | 'groq') {
  const config = getLLMProviderConfig(provider)
  
  if (!config.apiKey) {
    throw new Error(`API key not found for provider: ${provider}`)
  }
  
  switch (provider) {
    case 'openai':
      if (!providerCache.openai) {
        providerCache.openai = createOpenAI({
          apiKey: config.apiKey,
        })
      }
      return providerCache.openai
      
    case 'gemini':
      if (!providerCache.gemini) {
        providerCache.gemini = createGoogleGenerativeAI({
          apiKey: config.apiKey,
        })
      }
      return providerCache.gemini
      
    case 'groq':
      if (!providerCache.groq) {
        providerCache.groq = createGroq({
          apiKey: config.apiKey,
        })
      }
      return providerCache.groq
      
    default:
      throw new Error(`Unknown provider: ${provider}`)
  }
}

// テキスト分析用のLLMを取得
export function getTextAnalysisLLM() {
  const config = getTextAnalysisConfig()
  const provider = getProviderInstance(config.provider)
  
  return {
    provider,
    model: config.model,
    settings: {
      temperature: config.temperature,
      maxTokens: config.maxTokens,
      topP: config.topP,
      topK: (config as any).topK, // Gemini専用
      frequencyPenalty: (config as any).frequencyPenalty, // OpenAI専用
      presencePenalty: (config as any).presencePenalty, // OpenAI専用
    },
    systemPrompt: config.systemPrompt,
  }
}

// レイアウト生成用のLLMを取得
export function getLayoutGenerationLLM() {
  const config = getLayoutGenerationConfig()
  const provider = getProviderInstance(config.provider)
  
  return {
    provider,
    model: config.model,
    settings: {
      temperature: config.temperature,
      maxTokens: config.maxTokens,
      topP: config.topP,
      topK: (config as any).topK, // Gemini専用
      frequencyPenalty: (config as any).frequencyPenalty, // OpenAI専用
      presencePenalty: (config as any).presencePenalty, // OpenAI専用
    },
    systemPrompt: config.systemPrompt,
  }
}

// 汎用LLMを取得（カスタム設定用）
export function getLLM(
  useCase: 'textAnalysis' | 'layoutGeneration' | 'custom' = 'custom',
  overrides?: {
    provider?: 'openai' | 'gemini' | 'groq'
    model?: string
    temperature?: number
    maxTokens?: number
    systemPrompt?: string
  }
) {
  if (useCase === 'textAnalysis') {
    return getTextAnalysisLLM()
  }
  
  if (useCase === 'layoutGeneration') {
    return getLayoutGenerationLLM()
  }
  
  // カスタム設定
  const provider = overrides?.provider || 'gemini'
  const config = getLLMProviderConfig(provider)
  const providerInstance = getProviderInstance(provider)
  
  return {
    provider: providerInstance,
    model: overrides?.model || config.model,
    settings: {
      temperature: overrides?.temperature || config.temperature,
      maxTokens: overrides?.maxTokens || config.maxTokens,
      topP: config.topP,
      topK: (config as any).topK,
      frequencyPenalty: (config as any).frequencyPenalty,
      presencePenalty: (config as any).presencePenalty,
    },
    systemPrompt: overrides?.systemPrompt || '',
  }
}