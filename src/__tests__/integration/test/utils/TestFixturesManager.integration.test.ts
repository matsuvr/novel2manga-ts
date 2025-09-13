import { describe, expect, it } from 'vitest'
import { testFixturesManager } from '@/test/utils/TestFixturesManager'

describe('TestFixturesManager (integration)', () => {
  it('create processing state fixtures produces numeric flags', () => {
    const fixtures = testFixturesManager.createProcessingStateFixtures()
    const layoutStatus = fixtures.layoutStatus!
    expect(layoutStatus[0].isGenerated).toBe(1)
    expect(layoutStatus[1].isGenerated).toBe(0)
  })
})
