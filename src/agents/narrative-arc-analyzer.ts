import { Agent } from '@mastra/core'

import { getNarrativeAnalysisConfig } from '@/config'
import type { EpisodeBoundary } from '@/types/episode'
import { getNarrativeAnalysisLLM } from '@/utils/llm-factory'
import { NarrativeArcOrchestrator, type AnalyzeInput } from './narrative-arc-orchestrator'

const narrativeArcAnalyzer = new Agent({
  name: 'Narrative Arc Analyzer',
  instructions: () => {
    const config = getNarrativeAnalysisConfig()
    return config.systemPrompt
  },
  model: async () => {
    // フォールバック機能付きでLLMを取得
    const llm = await getNarrativeAnalysisLLM()
    console.log(`[narrativeArcAnalyzer] Using provider: ${llm.providerName}`)
    console.log(`[narrativeArcAnalyzer] Using model: ${llm.model}`)

    // モデルを返す
    return llm.provider(llm.model)
  },
})

export async function analyzeNarrativeArc(input: AnalyzeInput): Promise<EpisodeBoundary[]> {
  const orchestrator = new NarrativeArcOrchestrator(narrativeArcAnalyzer)
  return orchestrator.analyze(input)
}
