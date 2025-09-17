import { beforeEach, describe, expect, it, vi } from 'vitest'
import { z } from 'zod'

const { recordSpy, tokenUsageFactoryMock } = vi.hoisted(() => {
  const innerRecordSpy = vi.fn(async (_params: unknown) => {})
  const factory = vi.fn(() => ({
    record: innerRecordSpy,
  }))
  return { recordSpy: innerRecordSpy, tokenUsageFactoryMock: factory }
})

// Capture the last request sent to GoogleGenAI mock
let lastRequest: unknown = undefined

vi.mock('@google/genai', () => {
  class GoogleGenAIMock {
    // mimic constructor signature; config is unused in test
    constructor(_cfg: unknown) {}
    models = {
      generateContent: vi.fn(async (req: unknown) => {
        lastRequest = req
        return {
          text: '{"ok":true}',
          usageMetadata: {
            promptTokenCount: 10,
            candidatesTokenCount: 20,
            totalTokenCount: 30,
          },
        }
      }),
    }
  }
  return { GoogleGenAI: GoogleGenAIMock }
})

vi.mock('@/services/database', () => ({
  db: {
    tokenUsage: tokenUsageFactoryMock,
  },
}))

import { VertexAIClient } from '@/agents/llm/vertexai'

describe('VertexAIClient systemInstruction handling', () => {
  beforeEach(() => {
    lastRequest = undefined
    recordSpy.mockClear()
    tokenUsageFactoryMock.mockClear()
  })

  it('puts system prompt into systemInstruction and excludes system role in contents', async () => {
    const client = new VertexAIClient({
      provider: 'gemini',
      model: 'gemini-2.5-pro',
      project: 'p',
      location: 'us-central1',
    })

    const spec = { schema: z.object({ ok: z.boolean() }), schemaName: 'OkSchema' }

    const res = await client.generateStructured({
      systemPrompt: 'You are a helpful assistant. Follow rules strictly.',
      userPrompt: 'Return {"ok": true}',
      spec,
      options: { maxTokens: 128 },
      telemetry: {
        jobId: 'job-1',
        agentName: 'vertex-test',
        stepName: 'test-step',
        chunkIndex: 4,
      },
    })

    // Ensure parsing success
    expect(res.ok).toBe(true)

    // Validate request shape
    const req = lastRequest as Record<string, unknown>
    expect(req).toBeTruthy()
    expect(req.model).toBe('gemini-2.5-pro')

    // systemInstruction must be present and not placed in contents
    const sys = req.systemInstruction as { role?: string; parts?: Array<{ text: string }> }
    expect(sys).toBeTruthy()
    expect(sys.role).toBe('system')
    expect(sys.parts?.[0]?.text).toContain('You are a helpful assistant')

    const contents = (req.contents as Array<{ role: string; parts: Array<{ text: string }> }>) || []
    // No system role allowed in contents for Vertex AI Gemini
    expect(contents.find((c) => c.role === 'system')).toBeUndefined()
    // One user message expected
    expect(contents.find((c) => c.role === 'user')).toBeTruthy()

    expect(tokenUsageFactoryMock).toHaveBeenCalledTimes(1)
    expect(recordSpy).toHaveBeenCalledWith({
      jobId: 'job-1',
      agentName: 'vertex-test',
      stepName: 'test-step',
      chunkIndex: 4,
      episodeNumber: undefined,
      provider: 'gemini',
      model: 'gemini-2.5-pro',
      promptTokens: 10,
      completionTokens: 20,
      totalTokens: 30,
    })
  })
})
