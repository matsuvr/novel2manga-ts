import { describe, expect, it } from 'vitest'

// Legacy client layer fully removed. Keep a trivial skipped suite so historical filename doesn't break any tooling.
// Can be deleted once references are cleaned.
describe.skip('legacy llm client (removed)', () => {
  it('placeholder', () => {
    expect(true).toBe(true)
  })
})

