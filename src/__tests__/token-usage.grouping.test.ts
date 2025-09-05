import { describe, expect, it } from 'vitest'
import { groupByProviderModel } from '@/utils/token-usage'

describe('groupByProviderModel', () => {
  it('aggregates prompt/completion/total by provider+model', () => {
    const rows = [
      {
        provider: 'groq',
        model: 'gpt-oss-12b',
        promptTokens: 100,
        completionTokens: 50,
        totalTokens: 150,
      },
      {
        provider: 'groq',
        model: 'gpt-oss-12b',
        promptTokens: 40,
        completionTokens: 10,
        totalTokens: 50,
      },
      {
        provider: 'gemini',
        model: 'gemini-2.5-pro',
        promptTokens: 70,
        completionTokens: 30,
        totalTokens: 100,
      },
    ]
    const agg = groupByProviderModel(rows)
    expect(Object.keys(agg).length).toBe(2)
    expect(agg['groq gpt-oss-12b']).toEqual({ prompt: 140, completion: 60, total: 200 })
    expect(agg['gemini gemini-2.5-pro']).toEqual({ prompt: 70, completion: 30, total: 100 })
  })
})
