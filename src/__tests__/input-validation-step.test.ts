import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { InputValidationStep } from '@/services/application/steps/input-validation-step'
import type { StepContext } from '@/services/application/steps'
import { getLogger } from '@/infrastructure/logging/logger'
import type { StoragePorts } from '@/infrastructure/storage/ports'

vi.mock('@/agents/structured-generator', () => ({
  getLlmStructuredGenerator: vi.fn(),
}))

import { getLlmStructuredGenerator } from '@/agents/structured-generator'

const dummyContext: StepContext = {
  jobId: 'job',
  novelId: 'novel',
  logger: getLogger().withContext({ test: 'input-validation' }),
  ports: {} as unknown as StoragePorts,
}

describe('InputValidationStep', () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  it('returns SHORT for short input', async () => {
    const step = new InputValidationStep()
    const res = await step.validate('abc', dummyContext)
    expect(res.success).toBe(true)
    if (res.success) {
      expect(res.data.status).toBe('SHORT')
    }
  })

  it('classifies non narrative', async () => {
    const mockGen = vi.fn().mockResolvedValue({
      isNarrative: false,
      kind: 'manual',
      confidence: 0.9,
      reason: 'not story',
    })
    vi.mocked(getLlmStructuredGenerator).mockReturnValue({
      generateObjectWithFallback: mockGen,
    } as any)
    const step = new InputValidationStep()
    const res = await step.validate('これは説明書です。'.repeat(200), dummyContext)
    expect(res.success).toBe(true)
    if (res.success) {
      expect(res.data.status).toBe('NON_NARRATIVE')
      expect(res.data.consentRequired).toBe('EXPLAINER')
    }
  })

  it('classifies narrative as OK', async () => {
    const mockGen = vi.fn().mockResolvedValue({
      isNarrative: true,
      kind: 'novel',
      confidence: 0.8,
      reason: 'story',
    })
    vi.mocked(getLlmStructuredGenerator).mockReturnValue({
      generateObjectWithFallback: mockGen,
    } as any)
    const step = new InputValidationStep()
    const res = await step.validate('物語のテキストがここにあります。'.repeat(200), dummyContext)
    expect(res.success).toBe(true)
    if (res.success) {
      expect(res.data.status).toBe('OK')
    }
  })
})
