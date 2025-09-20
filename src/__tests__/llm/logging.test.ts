import fs, { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { LlmClient, LlmMessage, LlmResponse } from '@/llm'
import { getLlmLogFilePath, wrapWithLlmLogging } from '@/llm/logging'

describe('wrapWithLlmLogging', () => {
  let tempDir: string
  let originalInitCwd: string | undefined
  let originalPwd: string | undefined

  beforeEach(() => {
    tempDir = mkdtempSync(path.join(tmpdir(), 'llm-logging-test-'))
    originalInitCwd = process.env.INIT_CWD
    originalPwd = process.env.PWD
    delete process.env.LLM_LOGGING
    delete process.env.LLM_LOGGING_PATH
    delete process.env.LLM_LOGGING_DIR
  })

  afterEach(() => {
    delete process.env.LLM_LOGGING
    delete process.env.LLM_LOGGING_PATH
    delete process.env.LLM_LOGGING_DIR
    if (typeof originalInitCwd === 'string') {
      process.env.INIT_CWD = originalInitCwd
    } else {
      delete process.env.INIT_CWD
    }
    if (typeof originalPwd === 'string') {
      process.env.PWD = originalPwd
    } else {
      delete process.env.PWD
    }
    fs.rmSync(tempDir, { recursive: true, force: true })
    vi.restoreAllMocks()
  })

  it('returns the original client when logging is disabled', async () => {
    const baseClient: LlmClient = {
      chat: vi.fn(async () => ({ content: 'ok' } satisfies LlmResponse)),
    }

    const wrapped = wrapWithLlmLogging(baseClient)

    expect(wrapped).toBe(baseClient)

    const messages: LlmMessage[] = [{ role: 'user', content: 'hello' }]
    const response = await wrapped.chat(messages)

    expect(response.content).toBe('ok')
    expect(baseClient.chat).toHaveBeenCalledTimes(1)
    expect(fs.existsSync(path.join(tempDir, 'llm.log'))).toBe(false)
  })

  it('writes prompt and response to the log file when enabled', async () => {
    process.env.LLM_LOGGING = '1'
    const logPath = path.join(tempDir, 'interaction.log')
    process.env.LLM_LOGGING_PATH = logPath

    const baseClient: LlmClient = {
      chat: vi.fn(async () => ({ content: 'response text' } satisfies LlmResponse)),
    }

    const wrapped = wrapWithLlmLogging(baseClient)

    const messages: LlmMessage[] = [
      { role: 'system', content: 'system message' },
      { role: 'user', content: 'user prompt' },
    ]

    const result = await wrapped.chat(messages)
    expect(result.content).toBe('response text')

    const raw = fs.readFileSync(logPath, 'utf8').trim()
    const lines = raw.split('\n').filter((line) => line.length > 0)
    expect(lines).toHaveLength(1)

    const record = JSON.parse(lines[0]) as {
      ts: string
      prompt: Array<{ role: LlmMessage['role']; content: string }>
      response: string | null
    }

    expect(typeof record.ts).toBe('string')
    expect(record.prompt).toEqual(messages.map(({ role, content }) => ({ role, content })))
    expect(record.response).toBe('response text')
  })

  it('records the prompt even when the underlying client throws', async () => {
    process.env.LLM_LOGGING = '1'
    const logPath = path.join(tempDir, 'error.log')
    process.env.LLM_LOGGING_PATH = logPath

    const baseClient: LlmClient = {
      chat: vi.fn(async () => {
        throw new Error('network failure')
      }),
    }

    const wrapped = wrapWithLlmLogging(baseClient)

    await expect(wrapped.chat([{ role: 'user', content: 'failed prompt' }])).rejects.toThrow(
      'network failure',
    )

    const raw = fs.readFileSync(logPath, 'utf8').trim()
    const record = JSON.parse(raw) as {
      prompt: Array<{ role: LlmMessage['role']; content: string }>
      response: string | null
    }

    expect(record.prompt).toEqual([{ role: 'user', content: 'failed prompt' }])
    expect(record.response).toBeNull()
  })

  it('prefers the /app/logs mount when available (docker)', () => {
    process.env.LLM_LOGGING = '1'
    delete process.env.LLM_LOGGING_PATH
    delete process.env.LLM_LOGGING_DIR
    process.env.INIT_CWD = '/app'
    process.env.PWD = '/app'

    const result = getLlmLogFilePath()
    expect(result).toBe(path.join('/app/logs', 'llm-interactions.log'))
  })
})
