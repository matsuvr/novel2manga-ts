import type { Agent } from '@mastra/core'
import { z } from 'zod'

import { analyzeChunkBundle } from '@/agents/chunk-bundle-analyzer'
import { getEpisodeConfig } from '@/config'
import type { ChunkAnalysisResult } from '@/types/chunk'
import type { EpisodeBoundary } from '@/types/episode'

import { NarrativeArcDataService } from './narrative-arc-data-service'
import { NarrativeArcPromptBuilder } from './narrative-arc-prompt-builder'
import { NarrativeArcResultMapper } from './narrative-arc-result-mapper'

export interface AnalyzeInput {
  jobId: string
  chunks: {
    chunkIndex: number
    text: string
    analysis: {
      summary: string
      characters: { name: string; role: string }[]
      dialogues: ChunkAnalysisResult['dialogues']
      scenes: ChunkAnalysisResult['scenes']
      highlights: {
        text: string
        importance: number
        description: string
        startIndex: number
        endIndex: number
      }[]
    }
  }[]
  targetCharsPerEpisode: number
  minCharsPerEpisode: number
  maxCharsPerEpisode: number
  startingEpisodeNumber?: number
  isMiddleOfNovel: boolean
  previousEpisodeEndText?: string
}

export class NarrativeArcOrchestrator {
  constructor(
    private readonly agent: Agent,
    private readonly dataService = new NarrativeArcDataService(),
    private readonly promptBuilder = new NarrativeArcPromptBuilder(),
    private readonly resultMapper = new NarrativeArcResultMapper(),
  ) {}

  async analyze(input: AnalyzeInput): Promise<EpisodeBoundary[]> {
    const episodeConfig = getEpisodeConfig()
    const targetPages = Math.round(input.targetCharsPerEpisode / episodeConfig.charsPerPage)
    const minPages = Math.round(input.minCharsPerEpisode / episodeConfig.charsPerPage)
    const maxPages = Math.round(input.maxCharsPerEpisode / episodeConfig.charsPerPage)

    const chunksWithAnalyses = await this.dataService.loadAnalyses(
      input.jobId,
      input.chunks.map((c) => ({ chunkIndex: c.chunkIndex, text: c.text })),
    )

    const chunksText = input.chunks.map((chunk) => chunk.text).join('')
    const fullText = input.previousEpisodeEndText
      ? input.previousEpisodeEndText + chunksText
      : chunksText

    const bundleAnalysis = await analyzeChunkBundle(
      chunksWithAnalyses.map((c) => ({ text: c.text, analysis: c.analysis })),
    )

    const userPrompt = this.promptBuilder.build({
      bundleAnalysis,
      fullText,
      targetPages,
      minPages,
      maxPages,
      isMiddleOfNovel: input.isMiddleOfNovel,
      startingEpisodeNumber: input.startingEpisodeNumber,
    })

    const responseSchema = z.object({
      boundaries: z.array(
        z.object({
          startPosition: z.number(),
          endPosition: z.number(),
          episodeNumber: z
            .number()
            .describe(`エピソード番号（${input.startingEpisodeNumber || 1}から開始）`),
          title: z.string().optional(),
          summary: z.string().optional(),
          estimatedPages: z.number(),
          confidence: z.number().min(0).max(1),
          reasoning: z.string(),
        }),
      ),
      overallAnalysis: z.string(),
      suggestions: z.array(z.string()).optional(),
    })

    const result = await this.agent.generate([{ role: 'user', content: userPrompt }], {
      output: responseSchema,
    })

    if (!result.object) {
      throw new Error('Failed to generate narrative analysis - LLM returned no object')
    }

    if (result.object.boundaries.length === 0) {
      console.warn('WARNING: No episode boundaries found by LLM')
      console.warn('Suggestions:', result.object.suggestions)
      return []
    }

    return this.resultMapper.map(
      result.object.boundaries,
      chunksWithAnalyses,
      input.previousEpisodeEndText?.length || 0,
    )
  }
}
