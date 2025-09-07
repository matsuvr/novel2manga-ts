import { describe, expect, it } from 'vitest'
import { CompatAgent } from '@/agents/compat'
import { getScriptConversionConfig, getTextAnalysisConfig } from '@/config'

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
      .replace(/\{\{chunkIndex\}\}/g, '1')
      .replace('{{chunkText}}', 'これはテスト用の本文です。')
      .replace('{{previousChunkText}}', '')
      .replace('{{nextChunkText}}', '')
      .replace('{{previousCharacterMemoryJson}}', '[]')

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

  it('scriptConversion prompt/systemPrompt が展開され、エージェントが実行できる', async () => {
    const cfg = getScriptConversionConfig()
    let prompt = cfg.userPromptTemplate || ''
    let systemPrompt = cfg.systemPrompt || ''

    // Replace all placeholders in userPromptTemplate (use global replace for multiple occurrences)
    prompt = prompt
      .replace(/\{\{chunksNumber\}\}/g, '5')
      .replace(/\{\{chunkIndex\}\}/g, '1')
      .replace(/\{\{previousText\}\}/g, '前のチャンクテキスト')
      .replace(/\{\{chunkText\}\}/g, '太郎は走った。花子は笑った。')
      .replace(/\{\{nextChunk\}\}/g, '次のチャンクテキスト')
      .replace(/\{\{charactersList\}\}/g, '太郎（主人公）、花子（ヒロイン）')
      .replace(/\{\{scenesList\}\}/g, '公園、学校')
      .replace(/\{\{dialoguesList\}\}/g, '「行くぞ！」「待って！」')
      .replace(/\{\{highlightLists\}\}/g, 'クライマックス')
      .replace(/\{\{situations\}\}/g, '雨の中を走る')

    // Replace any placeholders in systemPrompt as well
    systemPrompt = systemPrompt
      .replace('{{chunksNumber}}', '5')
      .replace('{{chunkIndex}}', '1')
      .replace('{{previousText}}', '前のチャンクテキスト')
      .replace('{{chunkText}}', '太郎は走った。花子は笑った。')
      .replace('{{nextChunk}}', '次のチャンクテキスト')
      .replace('{{charactersList}}', '太郎（主人公）、花子（ヒロイン）')
      .replace('{{scenesList}}', '公園、学校')
      .replace('{{dialoguesList}}', '「行くぞ！」「待って！」')
      .replace('{{highlightLists}}', 'クライマックス')
      .replace('{{situations}}', '雨の中を走る')

    // Debug: log any remaining placeholders
    if (prompt.includes('{{') || prompt.includes('}}')) {
      console.log('Remaining placeholders in prompt:', prompt.match(/\{\{[^}]+\}\}/g))
      console.log('Full prompt:', prompt)
    }
    if (systemPrompt.includes('{{') || systemPrompt.includes('}}')) {
      console.log('Remaining placeholders in systemPrompt:', systemPrompt.match(/\{\{[^}]+\}\}/g))
      console.log('Full systemPrompt:', systemPrompt)
    }

    assertNoPlaceholders(prompt)
    assertNoPlaceholders(systemPrompt)

    const agent = new CompatAgent({
      name: 'prompt-wire-script',
      instructions: systemPrompt,
      provider: 'fake',
      maxTokens: cfg.maxTokens,
    })

    const out = await agent.generateText(prompt)
    expect(out).toBeTypeOf('string')
    expect(out.length).toBeGreaterThan(0)
  })

  // pageBreakEstimation test removed - replaced with importance-based calculation
})
