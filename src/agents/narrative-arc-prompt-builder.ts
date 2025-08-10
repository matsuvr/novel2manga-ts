import { getNarrativeAnalysisConfig } from '@/config'
import type { BundleAnalysisResult } from '@/agents/chunk-bundle-analyzer'

interface PromptParams {
  bundleAnalysis: BundleAnalysisResult
  fullText: string
  targetPages: number
  minPages: number
  maxPages: number
  isMiddleOfNovel: boolean
  startingEpisodeNumber?: number
}

export class NarrativeArcPromptBuilder {
  build({
    bundleAnalysis,
    fullText,
    targetPages,
    minPages,
    maxPages,
    isMiddleOfNovel,
    startingEpisodeNumber,
  }: PromptParams): string {
    const config = getNarrativeAnalysisConfig()

    const characterList = bundleAnalysis.mainCharacters
      .map((char) => `${char.name}（${char.role}）`)
      .join('、')

    const highlightsInfo = bundleAnalysis.highlights
      .filter((h) => h.importance >= 6)
      .map((h) => `- ${h.text} (重要度: ${h.importance})${h.context ? `\n  ${h.context}` : ''}`)
      .join('\n')

    const characterActions = bundleAnalysis.keyDialogues
      .map((d) => `${d.speaker}: 「${d.text}」\n  意味: ${d.significance}`)
      .join('\n\n')

    let prompt = config.userPromptTemplate
    if (isMiddleOfNovel && config.middleSegmentContextTemplate) {
      const contextInfo = config.middleSegmentContextTemplate.replace(
        '{{startingEpisodeNumber}}',
        (startingEpisodeNumber || 1).toString(),
      )
      prompt = prompt.replace('【分析対象】', `【分析対象】${contextInfo}`)
    }

    return prompt
      .replace('{{totalChars}}', fullText.length.toString())
      .replace('{{targetPages}}', targetPages.toString())
      .replace('{{minPages}}', minPages.toString())
      .replace('{{maxPages}}', maxPages.toString())
      .replace('{{characterList}}', characterList || 'なし')
      .replace('{{overallSummary}}', bundleAnalysis.summary || 'なし')
      .replace('{{highlightsInfo}}', highlightsInfo || 'なし')
      .replace('{{characterActions}}', characterActions || 'なし')
      .replace('{{fullText}}', fullText)
  }
}
