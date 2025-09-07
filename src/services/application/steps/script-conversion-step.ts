import { convertChunkToMangaScript } from '@/agents/script/script-converter'
import { formatSnapshotForPrompt, loadCharacterSnapshot } from '@/character/snapshot'
import { getAppConfigWithOverrides } from '@/config/app.config'
import type { NewMangaScript } from '@/types/script'
import type { PipelineStep, StepContext, StepExecutionResult } from './base-step'

export interface ScriptConversionResult {
  script: NewMangaScript // The converted manga script object
}

/**
 * Step responsible for converting episode text to script format with character memory integration
 */
export class ScriptConversionStep implements PipelineStep {
  readonly stepName = 'script-conversion'

  /**
   * Get character information from snapshot for the specified chunk
   */
  private async getCharacterInfoFromSnapshot(
    chunkIndex: number,
    dataDir?: string,
  ): Promise<string> {
    try {
      // Load character snapshot for this chunk
      const snapshot = await loadCharacterSnapshot(chunkIndex, dataDir)

      if (!snapshot) {
        console.warn(`No character snapshot found for chunk ${chunkIndex}`)
        return ''
      }

      // Format snapshot for LLM prompt using config settings
      return formatSnapshotForPrompt(snapshot)
    } catch (error) {
      // If snapshot is not available, return empty string
      console.warn('Character snapshot not available:', error)
      return ''
    }
  }

  /**
   * Convert chunk text to manga script format using LLM
   */
  async convertToScript(
    chunkText: string,
    chunkIndex: number,
    chunksNumber: number,
    allChunks: string[],
    context: StepContext,
    analysisResults?: {
      scenes?: Array<{ location: string; description: string }>
      dialogues?: Array<{ text: string; emotion?: string }>
      highlights?: Array<{ description: string; importance: number }>
      situations?: Array<{ description: string }>
    },
  ): Promise<StepExecutionResult<ScriptConversionResult>> {
    const { jobId, logger } = context

    try {
      // Get previous and next chunks for context
      const previousText = chunkIndex > 1 ? allChunks[chunkIndex - 2] : undefined
      const nextChunk = chunkIndex < chunksNumber ? allChunks[chunkIndex] : undefined

      logger.info('Starting manga script conversion with character memory snapshot', {
        jobId,
        chunkIndex,
        chunksNumber,
        chunkTextLength: chunkText.length,
        hasPrevious: !!previousText,
        hasNext: !!nextChunk,
      })

      // Get app config for data directory
      const config = getAppConfigWithOverrides()
      const dataDir = config.storage.local.basePath

      // Get character information from snapshot (0-based index)
      const charactersList = await this.getCharacterInfoFromSnapshot(chunkIndex - 1, dataDir)

      // Format analysis results if available
      const formatting = config.llm.scriptConversion.analysisFormatting || {
        scenesHeader: '【シーン情報】',
        dialoguesHeader: '【セリフ情報】',
        highlightsHeader: '【重要ポイント】',
        situationsHeader: '【状況】',
        emotionUnknown: '感情不明',
        importanceLabel: '重要度',
      }

      let scenesList = ''
      let dialoguesList = ''
      let highlightLists = ''
      let situations = ''

      if (analysisResults) {
        if (analysisResults.scenes && analysisResults.scenes.length > 0) {
          scenesList = `${formatting.scenesHeader}\n${analysisResults.scenes
            .map((s) => `- ${s.location}: ${s.description}`)
            .join('\n')}`
        }

        if (analysisResults.dialogues && analysisResults.dialogues.length > 0) {
          dialoguesList = `${formatting.dialoguesHeader}\n${analysisResults.dialogues
            .map((d) => `- "${d.text}" (${d.emotion || formatting.emotionUnknown})`)
            .join('\n')}`
        }

        if (analysisResults.highlights && analysisResults.highlights.length > 0) {
          highlightLists = `${formatting.highlightsHeader}\n${analysisResults.highlights
            .map((h) => `- ${h.description} (${formatting.importanceLabel}: ${h.importance})`)
            .join('\n')}`
        }

        if (analysisResults.situations && analysisResults.situations.length > 0) {
          situations = `${formatting.situationsHeader}\n${analysisResults.situations
            .map((s) => `- ${s.description}`)
            .join('\n')}`
        }
      }

      // Convert chunk text to manga script using new format
      const script = await convertChunkToMangaScript(
        {
          chunkText,
          chunkIndex,
          chunksNumber,
          previousText,
          nextChunk,
          charactersList,
          scenesList,
          dialoguesList,
          highlightLists,
          situations,
        },
        {
          jobId,
        },
      )

      logger.info('Manga script conversion completed with character snapshot', {
        jobId,
        chunkIndex,
        chunksNumber,
        scriptGenerated: !!script,
        panelsCount: script?.panels?.length || 0,
        charactersInScript: script?.characters?.length || 0,
      })

      return {
        success: true,
        data: { script },
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      logger.error('Manga script conversion failed', {
        jobId,
        chunkIndex,
        chunksNumber,
        error: errorMessage,
        stack: error instanceof Error ? error.stack : undefined,
      })
      return { success: false, error: errorMessage }
    }
  }
}
