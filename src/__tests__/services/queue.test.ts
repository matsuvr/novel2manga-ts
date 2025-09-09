import { describe } from 'vitest'

// Cloudflare queue bindings removed; skip legacy queue behavior tests.
describe.skip('JobQueue (legacy Cloudflare bindings removed)', () => {
  // Tests removed per migration to Node/SQLite. See docs/specs for details.
})
