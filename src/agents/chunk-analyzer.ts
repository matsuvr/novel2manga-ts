import { BaseAgent } from './base-agent'
import { getTextAnalysisConfig } from '@/config'

export class ChunkAnalyzerAgent extends BaseAgent {
  constructor() {
    super(
      'chunk-analyzer',
      () => getTextAnalysisConfig().systemPrompt,
      'textAnalysis',
      '小説のチャンクを分析して、キャラクター、場面、対話、ハイライト、状況を抽出するエージェント',
    )
  }
}

export const chunkAnalyzerAgent = new ChunkAnalyzerAgent()
