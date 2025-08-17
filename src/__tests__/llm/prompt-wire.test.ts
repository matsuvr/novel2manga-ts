import { describe, expect, it } from 'vitest'
import { CompatAgent } from '@/agent/compat'
import {
  getChunkBundleAnalysisConfig,
  getLayoutGenerationConfig,
  getNarrativeAnalysisConfig,
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

  it('layoutGeneration prompt/systemPrompt が展開され、エージェントが実行できる', async () => {
    const cfg = getLayoutGenerationConfig()
    const prompt = cfg.userPromptTemplate
      .replace('{{episodeNumber}}', '1')
      .replace(
        '{{layoutInputJson}}',
        JSON.stringify({ pages: [{ pageNumber: 1, importance: 5 }] }, null, 2),
      )

    assertNoPlaceholders(prompt)
    assertNoPlaceholders(cfg.systemPrompt)

    const agent = new CompatAgent({
      name: 'prompt-wire-layout',
      instructions: cfg.systemPrompt,
      provider: 'fake',
      maxTokens: cfg.maxTokens,
    })

    const out = await agent.generateText(prompt)
    expect(out).toBeTypeOf('string')
    expect(out.length).toBeGreaterThan(0)
  })

  it('chunkBundleAnalysis prompt/systemPrompt が展開され、エージェントが実行できる', async () => {
    const cfg = getChunkBundleAnalysisConfig()
    const prompt = cfg.userPromptTemplate
      .replace('{{characterList}}', '- 太郎 (登場回数: 3)')
      .replace('{{sceneList}}', '- 学校の屋上')
      .replace('{{dialogueList}}', '- 太郎: 「走れ！」')
      .replace('{{highlightList}}', '- [climax] 告白シーン (重要度: 9)')
      .replace('{{situationList}}', '- 雨が降っている')

    assertNoPlaceholders(prompt)
    assertNoPlaceholders(cfg.systemPrompt)

    const agent = new CompatAgent({
      name: 'prompt-wire-bundle',
      instructions: cfg.systemPrompt,
      provider: 'fake',
      maxTokens: cfg.maxTokens,
    })

    const out = await agent.generateText(prompt)
    expect(out).toBeTypeOf('string')
    expect(out.length).toBeGreaterThan(0)
  })
})
