import { describe, expect, it } from 'vitest'
import { CompatAgent } from '@/agent/compat'
import {
  getNarrativeAnalysisConfig,
  getPageBreakEstimationConfig,
  getScriptConversionConfig,
  getTextAnalysisConfig,
} from '@/config'

function assertNoPlaceholders(str: string) {
  expect(str).toBeTypeOf('string')
  expect(str.length).toBeGreaterThan(0)
  // 未展開の {{...}} が残っていないこと
  expect(str.includes('{{')).toBe(false)
  expect(str.includes('}}')).toBe(false)
}

describe('LLM prompt wiring (temporary)', () => {
  it('textAnalysis prompt/systemPrompt が展開され、エージェントが実行できる', async () => {
    const cfg = getTextAnalysisConfig()
    const prompt = cfg.userPromptTemplate
      .replace('{{chunkIndex}}', '1')
      .replace('{{chunkText}}', 'これはテスト用の本文です。')
      .replace('{{previousChunkText}}', '')
      .replace('{{nextChunkText}}', '')

    assertNoPlaceholders(prompt)
    assertNoPlaceholders(cfg.systemPrompt)

    const agent = new CompatAgent({
      name: 'prompt-wire-text',
      instructions: cfg.systemPrompt,
      provider: 'fake',
      maxTokens: cfg.maxTokens,
    })

    const out = await agent.generateText(prompt)
    expect(out).toBeTypeOf('string')
    expect(out.length).toBeGreaterThan(0)
  })

  it('narrativeArcAnalysis prompt/systemPrompt が展開され、エージェントが実行できる', async () => {
    const cfg = getNarrativeAnalysisConfig()
    const prompt = cfg.userPromptTemplate
      .replace('{{totalChars}}', '12000')
      .replace('{{targetPages}}', '24')
      .replace('{{minPages}}', '15')
      .replace('{{maxPages}}', '30')
      .replace('{{characterList}}', '- 太郎\n- 花子')
      .replace('{{overallSummary}}', '全体の要約テキスト')
      .replace('{{highlightsInfo}}', '- クライマックス')
      .replace('{{characterActions}}', '- 太郎は走る')
      .replace('{{fullText}}', '長文テキスト...')

    assertNoPlaceholders(prompt)
    assertNoPlaceholders(cfg.systemPrompt)

    const agent = new CompatAgent({
      name: 'prompt-wire-narrative',
      instructions: cfg.systemPrompt,
      provider: 'fake',
      maxTokens: cfg.maxTokens,
    })

    const out = await agent.generateText(prompt)
    expect(out).toBeTypeOf('string')
    expect(out.length).toBeGreaterThan(0)
  })

  it('scriptConversion prompt/systemPrompt が展開され、エージェントが実行できる', async () => {
    const cfg = getScriptConversionConfig()
    const prompt = (cfg.userPromptTemplate || 'Episode text: {{episodeText}}').replace(
      '{{episodeText}}',
      '太郎は走った。花子は笑った。',
    )

    assertNoPlaceholders(prompt)
    assertNoPlaceholders(cfg.systemPrompt)

    const agent = new CompatAgent({
      name: 'prompt-wire-script',
      instructions: cfg.systemPrompt,
      provider: 'fake',
      maxTokens: cfg.maxTokens,
    })

    const out = await agent.generateText(prompt)
    expect(out).toBeTypeOf('string')
    expect(out.length).toBeGreaterThan(0)
  })

  it('pageBreakEstimation prompt/systemPrompt が展開され、エージェントが実行できる', async () => {
    const cfg = getPageBreakEstimationConfig()
    const scriptJson = JSON.stringify({
      script: [
        { index: 0, type: 'dialogue', speaker: '太郎', text: '行くぞ！' },
        { index: 1, type: 'narration', text: '雨が強くなる。' },
        { index: 2, type: 'dialogue', speaker: '花子', text: '待って！' },
      ],
    })
    const prompt = (cfg.userPromptTemplate || '')
      .replace('{{scriptJson}}', scriptJson)
      .replace('{{targetPages}}', '4')
      .replace('{{avgLinesPerPage}}', '8')

    assertNoPlaceholders(prompt)
    assertNoPlaceholders(cfg.systemPrompt)

    const agent = new CompatAgent({
      name: 'prompt-wire-pagebreak',
      instructions: cfg.systemPrompt,
      provider: 'fake',
      maxTokens: cfg.maxTokens,
    })

    const out = await agent.generateText(prompt)
    expect(out).toBeTypeOf('string')
    expect(out.length).toBeGreaterThan(0)
  })
})
