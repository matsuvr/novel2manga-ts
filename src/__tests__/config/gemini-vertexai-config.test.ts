import { describe, expect, it, afterEach } from 'vitest'
import { getLLMProviderConfig } from '@/config/llm.config'

const ENV_PROJECT = 'VERTEX_AI_PROJECT'
const ENV_LOCATION = 'VERTEX_AI_LOCATION'
const ENV_KEY_PATH = 'GOOGLE_APPLICATION_CREDENTIALS'

describe('getLLMProviderConfig gemini', () => {
  const original = {
    project: process.env[ENV_PROJECT],
    location: process.env[ENV_LOCATION],
    key: process.env[ENV_KEY_PATH],
  }

  afterEach(() => {
    process.env[ENV_PROJECT] = original.project
    process.env[ENV_LOCATION] = original.location
    process.env[ENV_KEY_PATH] = original.key
  })

  it('throws when required Vertex AI env vars are missing', () => {
    delete process.env[ENV_PROJECT]
    delete process.env[ENV_LOCATION]
    delete process.env[ENV_KEY_PATH]
    expect(() => getLLMProviderConfig('gemini')).toThrowError(/Missing required environment/)
  })

  it('returns config when env vars are set', () => {
    process.env[ENV_PROJECT] = 'p'
    process.env[ENV_LOCATION] = 'us-central1'
    process.env[ENV_KEY_PATH] = '/tmp/key.json'

    const cfg = getLLMProviderConfig('gemini')
    expect(cfg.vertexai).toBeDefined()
    expect(cfg.vertexai?.project).toBe('p')
    expect(cfg.vertexai?.location).toBe('us-central1')
  })
})
