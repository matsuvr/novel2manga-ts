import fs, { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { z } from 'zod'

import { maybeWrapStructuredLogging } from '@/agents/llm/logging'
import type { GenerateStructuredParams, LlmClient } from '@/agents/llm/types'

describe('maybeWrapStructuredLogging', () => {
  let tempDir: string
  let originalLogging: string | undefined
  let originalPath: string | undefined

  beforeEach(() => {
    tempDir = mkdtempSync(path.join(tmpdir(), 'agent-llm-logging-'))
    originalLogging = process.env.LLM_LOGGING
    originalPath = process.env.LLM_LOGGING_PATH
    delete process.env.LLM_LOGGING
    delete process.env.LLM_LOGGING_PATH
  })

  afterEach(() => {
    if (typeof originalLogging === 'string') {
      process.env.LLM_LOGGING = originalLogging
    } else {
      delete process.env.LLM_LOGGING
    }
    if (typeof originalPath === 'string') {
      process.env.LLM_LOGGING_PATH = originalPath
    } else {
      delete process.env.LLM_LOGGING_PATH
    }
    fs.rmSync(tempDir, { recursive: true, force: true })
  })

  it('returns the original client when logging is disabled', async () => {
    const baseClient: LlmClient = {
      provider: 'fake',
      async generateStructured<T>(params: GenerateStructuredParams<T>): Promise<T> {
        return params.spec.schema.parse({ ok: true })
      },
    }

    const wrapped = maybeWrapStructuredLogging(baseClient)
    expect(wrapped).toBe(baseClient)

    const schema = z.object({ ok: z.boolean() })
    const result = await wrapped.generateStructured({
      systemPrompt: 'system',
      userPrompt: 'prompt',
      spec: { schema, schemaName: 'TestSchema' },
      options: { maxTokens: 100 },
    })

    expect(result).toEqual({ ok: true })
  })

  it('writes structured generation logs when enabled', async () => {
    process.env.LLM_LOGGING = '1'
    const logPath = path.join(tempDir, 'structured.log')
    process.env.LLM_LOGGING_PATH = logPath

    const baseClient: LlmClient = {
      provider: 'openai',
      async generateStructured<T>(params: GenerateStructuredParams<T>): Promise<T> {
        return params.spec.schema.parse({ message: 'hello' })
      },
    }

    const wrapped = maybeWrapStructuredLogging(baseClient)
    expect(wrapped).not.toBe(baseClient)

    const schema = z.object({ message: z.string() })
    const result = await wrapped.generateStructured({
      systemPrompt: 'You are a helper',
      userPrompt: 'Return a greeting',
      spec: { schema, schemaName: 'Greeting' },
      options: { maxTokens: 128 },
      telemetry: {
        jobId: 'job-123',
        agentName: 'test-agent',
        stepName: 'step-1',
        chunkIndex: 0,
        episodeNumber: 1,
      },
    })

    expect(result).toEqual({ message: 'hello' })

    const raw = fs.readFileSync(logPath, 'utf8').trim()
    const entries = raw.split('\n').filter((line) => line.length > 0)
    expect(entries).toHaveLength(1)

    const record = JSON.parse(entries[0]) as {
      kind: string
      prompt: {
        provider: string
        schemaName: string
        systemPrompt?: string
        userPrompt: string
        telemetry?: Record<string, unknown>
      }
      response: string | null
    }

    expect(record.kind).toBe('structured')
    expect(record.prompt.provider).toBe('openai')
    expect(record.prompt.schemaName).toBe('Greeting')
    expect(record.prompt.systemPrompt).toBe('You are a helper')
    expect(record.prompt.userPrompt).toBe('Return a greeting')
    expect(record.prompt.telemetry).toMatchObject({
      jobId: 'job-123',
      agentName: 'test-agent',
      stepName: 'step-1',
      chunkIndex: 0,
      episodeNumber: 1,
    })
    expect(record.response).toBe(JSON.stringify({ message: 'hello' }))
  })

  it('records errors when the underlying client throws', async () => {
    process.env.LLM_LOGGING = '1'
    const logPath = path.join(tempDir, 'failure.log')
    process.env.LLM_LOGGING_PATH = logPath

    const baseClient: LlmClient = {
      provider: 'cerebras',
      async generateStructured<T>(_params: GenerateStructuredParams<T>): Promise<T> {
        throw new Error('network timeout')
      },
    }

    const wrapped = maybeWrapStructuredLogging(baseClient)

    const schema = z.object({ value: z.string() })

    await expect(async () => {
      await wrapped.generateStructured({
        systemPrompt: undefined,
        userPrompt: 'Return value',
        spec: { schema, schemaName: 'ValueSchema' },
        options: { maxTokens: 64 },
      })
    }).rejects.toThrow('network timeout')

    const raw = fs.readFileSync(logPath, 'utf8').trim()
    const record = JSON.parse(raw) as {
      response: string | null
      error?: string
    }

    expect(record.response).toBeNull()
    expect(record.error).toBe('network timeout')
  })
})
