import { appendFile, mkdir } from 'node:fs/promises'
import path from 'node:path'
import { getLogger } from '@/infrastructure/logging/logger'
import { getLlmLogFilePath, isLlmLoggingEnabled } from '@/llm/logging'

import type { GenerateStructuredParams, LlmClient, LlmProvider } from './types'

interface StructuredPromptSnapshot {
  provider: LlmProvider
  schemaName: string
  systemPrompt?: string
  userPrompt: string
  telemetry?: {
    jobId?: string
    agentName?: string
    stepName?: string
    chunkIndex?: number
    episodeNumber?: number
  }
}

interface StructuredLogRecord {
  ts: string
  kind: 'structured'
  prompt: StructuredPromptSnapshot
  response: string | null
  error?: string
}

class StructuredLoggingLlmClient implements LlmClient {
  readonly provider: LlmProvider

  private ensurePathPromise: Promise<void> | null = null

  constructor(private readonly inner: LlmClient, private readonly logFilePath: string) {
    this.provider = inner.provider
  }

  async generateStructured<T>(params: GenerateStructuredParams<T>): Promise<T> {
    const promptSnapshot = this.createPromptSnapshot(params)
    try {
      const result = await this.inner.generateStructured(params)
      await this.appendRecord({
        ts: new Date().toISOString(),
        kind: 'structured',
        prompt: promptSnapshot,
        response: safeSerialize(result),
      })
      return result
    } catch (error) {
      await this.appendRecord({
        ts: new Date().toISOString(),
        kind: 'structured',
        prompt: promptSnapshot,
        response: null,
        error: error instanceof Error ? error.message : String(error),
      })
      throw error
    }
  }

  private createPromptSnapshot<T>(params: GenerateStructuredParams<T>): StructuredPromptSnapshot {
    const snapshot: StructuredPromptSnapshot = {
      provider: this.inner.provider,
      schemaName: params.spec.schemaName,
      userPrompt: params.userPrompt,
    }

    const trimmedSystemPrompt = params.systemPrompt?.trim()
    if (trimmedSystemPrompt) {
      snapshot.systemPrompt = trimmedSystemPrompt
    }

    const telemetry = params.telemetry
    if (telemetry) {
      const { jobId, agentName, stepName, chunkIndex, episodeNumber } = telemetry
      if (
        jobId !== undefined ||
        agentName !== undefined ||
        stepName !== undefined ||
        chunkIndex !== undefined ||
        episodeNumber !== undefined
      ) {
        snapshot.telemetry = {
          jobId,
          agentName,
          stepName,
          chunkIndex,
          episodeNumber,
        }
      }
    }

    return snapshot
  }

  private async ensureLogDestination(): Promise<void> {
    if (!this.ensurePathPromise) {
      this.ensurePathPromise = mkdir(path.dirname(this.logFilePath), { recursive: true })
        .then(() => undefined)
        .catch((error) => {
          this.ensurePathPromise = null
          throw error
        })
    }
    await this.ensurePathPromise
  }

  private async appendRecord(record: StructuredLogRecord): Promise<void> {
    try {
      await this.ensureLogDestination()
      await appendFile(this.logFilePath, `${JSON.stringify(record)}\n`, 'utf8')
    } catch (error) {
      getLogger()
        .withContext({ service: 'llm-structured-logging', provider: this.provider })
        .error('llm_structured_log_write_failed', {
          error: error instanceof Error ? error.message : String(error),
        })
    }
  }
}

function safeSerialize(value: unknown): string | null {
  try {
    return JSON.stringify(value)
  } catch {
    return null
  }
}

export function maybeWrapStructuredLogging(client: LlmClient): LlmClient {
  if (!isLlmLoggingEnabled()) {
    return client
  }
  const logFilePath = getLlmLogFilePath()
  return new StructuredLoggingLlmClient(client, logFilePath)
}
