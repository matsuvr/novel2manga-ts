import { getLLMDefaultProvider, getTextAnalysisConfig } from '@/config'
import { BaseAgent } from './base-agent'

// Singleton instance with lazy initialization
let agentInstance: BaseAgent | null = null

export function getChunkAnalyzerAgent(): BaseAgent {
  if (!agentInstance) {
    const config = getTextAnalysisConfig()
    const provider = getLLMDefaultProvider()

    agentInstance = new BaseAgent({
      name: 'chunk-analyzer',
      instructions: config.systemPrompt,
      provider: provider,
      maxTokens: config.maxTokens,
    })

    console.log(`[chunkAnalyzerAgent] Using provider: ${provider}`)
  }

  return agentInstance
}

// For backward compatibility
export const chunkAnalyzerAgent = {
  get instance() {
    return getChunkAnalyzerAgent()
  },
}
