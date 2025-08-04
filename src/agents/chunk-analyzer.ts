import { Agent } from '@mastra/core/agent'
import { getTextAnalysisConfig } from '@/config'
import { getTextAnalysisLLM } from '@/utils/llm-factory'

export const chunkAnalyzerAgent = new Agent({
  name: 'chunk-analyzer',
  description:
    '小説のチャンクを分析して、キャラクター、場面、対話、ハイライト、状況を抽出するエージェント',
  instructions: () => {
    const config = getTextAnalysisConfig()
    return config.systemPrompt
  },
  model: async ({ runtimeContext: _runtimeContext }) => {
    // フォールバック機能付きでLLMを取得
    const llm = await getTextAnalysisLLM()
    console.log(`[chunkAnalyzerAgent] Using provider: ${llm.providerName}`)
    console.log(`[chunkAnalyzerAgent] Using model: ${llm.model}`)

    // モデルを返す
    return llm.provider(llm.model) as any // Mastraの型互換性のための一時的な回避策
  },
})
