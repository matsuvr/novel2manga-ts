import { existsSync } from 'node:fs'
import { appendFile, mkdir } from 'node:fs/promises'
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

  const candidateDirectories: string[] = []
  const seen = new Set<string>()

  const addCandidate = (rawDir: string | undefined): void => {
    if (!rawDir) {
      return
    }
    const normalized = path.resolve(rawDir)
    if (seen.has(normalized)) {
      return
    }
    seen.add(normalized)
    candidateDirectories.push(normalized)
  }

  const customDir = process.env.LLM_LOGGING_DIR
  if (customDir && customDir.trim().length > 0) {
    addCandidate(customDir)
  }

  if (existsSync('/app/logs') || existsSync('/app')) {
    addCandidate(path.join('/app', 'logs'))
  }

  const baseCandidates = [process.env.NOVEL2MANGA_PROJECT_ROOT, process.env.INIT_CWD, process.env.PWD]
  for (const base of baseCandidates) {
    if (base && base.trim().length > 0) {
      addCandidate(path.join(base, 'logs'))
    }
  }

  addCandidate(path.join(process.cwd(), 'logs'))

  const targetDirectory = candidateDirectories[0]
  return path.join(targetDirectory, 'llm-interactions.log')
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
      this.ensurePathPromise = mkdir(path.dirname(this.logFilePath), { recursive: true })
        // ensurePathPromise is declared as Promise<void>, so map the result to undefined
        .then(() => undefined)
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
      await appendFile(this.logFilePath, `${JSON.stringify(record)}\n`, 'utf8')
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
