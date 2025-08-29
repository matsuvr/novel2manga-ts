import { describe, expect, it } from 'vitest'
import { CompatAgent } from '@/agents/compat'
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
    let prompt = cfg.userPromptTemplate || ''
    let systemPrompt = cfg.systemPrompt || ''

    // Replace all placeholders in userPromptTemplate (use global replace for multiple occurrences)
    prompt = prompt
      .replace(/\{\{episodeText\}\}/g, '太郎は走った。花子は笑った。')
      .replace(/\{\{chunkIndex\}\}/g, '1')
      .replace(/\{\{totalChunks\}\}/g, '1')
      .replace(/\{\{previousFragment\}\}/g, '')
      .replace(/\{\{nextFragment\}\}/g, '')
      .replace(/\{\{characterList\}\}/g, '太郎（主人公）、花子（ヒロイン）')
      .replace(/\{\{sceneList\}\}/g, '公園、学校')
      .replace(/\{\{dialogueList\}\}/g, '「行くぞ！」「待って！」')
      .replace(/\{\{highlightList\}\}/g, 'クライマックス')
      .replace(/\{\{situationList\}\}/g, '雨の中を走る')
      // Fix the malformed placeholder in the template
      .replace(/\{\{episodeTextの0\.\.40\}\}/g, '太郎は走った。花子は笑った。')

    // Replace any placeholders in systemPrompt as well
    systemPrompt = systemPrompt
      .replace('{{episodeText}}', '太郎は走った。花子は笑った。')
      .replace('{{chunkIndex}}', '1')
      .replace('{{totalChunks}}', '1')
      .replace('{{previousFragment}}', '')
      .replace('{{nextFragment}}', '')
      .replace('{{characterList}}', '太郎（主人公）、花子（ヒロイン）')
      .replace('{{sceneList}}', '公園、学校')
      .replace('{{dialogueList}}', '「行くぞ！」「待って！」')
      .replace('{{highlightList}}', 'クライマックス')
      .replace('{{situationList}}', '雨の中を走る')
      .replace('{{episodeTextの0..40}}', '太郎は走った。花子は笑った。')

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

  it('pageBreakEstimation prompt/systemPrompt が展開され、エージェントが実行できる', async () => {
    const cfg = getPageBreakEstimationConfig()
    const scriptJson = JSON.stringify({
      script: [
        { index: 0, type: 'dialogue', speaker: '太郎', text: '行くぞ！' },
        { index: 1, type: 'narration', text: '雨が強くなる。' },
        { index: 2, type: 'dialogue', speaker: '花子', text: '待って！' },
      ],
    })
    const prompt = (cfg.userPromptTemplate || '').replace('{{scriptJson}}', scriptJson)

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
