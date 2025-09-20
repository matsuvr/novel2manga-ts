import { promises as fs } from 'node:fs'
import path from 'node:path'

import { getLogger } from '@/infrastructure/logging/logger'

import type { LlmClient, LlmClientOptions, LlmMessage, LlmResponse } from './client'

type SanitizedMessage = Pick<LlmMessage, 'role' | 'content'>

interface LlmLogRecord {
  ts: string
  prompt: SanitizedMessage[]
  response: string | null
}

function isLoggingEnabled(): boolean {
  return process.env.LLM_LOGGING === '1'
}

function resolveLogFilePath(): string {
  const customPath = process.env.LLM_LOGGING_PATH
  if (customPath && customPath.trim().length > 0) {
    return path.resolve(customPath)
  }
  const logDir = path.resolve(process.cwd(), 'logs')
  return path.join(logDir, 'llm-interactions.log')
}

function sanitizeMessages(messages: LlmMessage[]): SanitizedMessage[] {
  return messages.map((message) => ({
    role: message.role,
    content: message.content,
  }))
}

class LoggingLlmClient implements LlmClient {
  embeddings?: LlmClient['embeddings']

  private readonly logFilePath: string
  private ensurePathPromise: Promise<void> | null = null

  constructor(private readonly inner: LlmClient, logFilePath: string) {
    this.logFilePath = logFilePath

    if (typeof inner.embeddings === 'function') {
      this.embeddings = inner.embeddings.bind(inner)
    }
  }

  async chat(messages: LlmMessage[], options: LlmClientOptions = {}): Promise<LlmResponse> {
    const prompt = sanitizeMessages(messages)
    try {
      const response = await this.inner.chat(messages, options)
      await this.appendRecord({
        ts: new Date().toISOString(),
        prompt,
        response: response.content,
      })
      return response
    } catch (error) {
      await this.appendRecord({
        ts: new Date().toISOString(),
        prompt,
        response: null,
      })
      getLogger().error('llm_chat_failed', {
        error: error instanceof Error ? error.message : String(error),
      })
      throw error
    }
  }

  private async ensureLogDestination(): Promise<void> {
    if (!this.ensurePathPromise) {
      this.ensurePathPromise = fs
        .mkdir(path.dirname(this.logFilePath), { recursive: true })
        .catch((error) => {
          this.ensurePathPromise = null
          throw error
        })
    }
    await this.ensurePathPromise
  }

  private async appendRecord(record: LlmLogRecord): Promise<void> {
    try {
      await this.ensureLogDestination()
      await fs.appendFile(this.logFilePath, `${JSON.stringify(record)}\n`, 'utf8')
    } catch (error) {
      getLogger().error('llm_log_write_failed', {
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }
}

export function wrapWithLlmLogging(client: LlmClient): LlmClient {
  if (!isLoggingEnabled()) {
    return client
  }
  const logFilePath = resolveLogFilePath()
  return new LoggingLlmClient(client, logFilePath)
}

export function getLlmLogFilePath(): string {
  return resolveLogFilePath()
}
