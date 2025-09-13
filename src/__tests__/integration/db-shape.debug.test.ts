import { describe, it } from 'vitest'
import { createTestDatabase, getTestDatabase } from './helpers/test-database'

describe('DEBUG: Test DB shape', () => {
  it('logs db shape', async () => {
    await createTestDatabase()
    const raw = getTestDatabase() as unknown as Record<string, unknown>
    console.log('DEBUG: db keys=', Object.keys(raw))
    console.log('DEBUG: has select=', typeof raw.select)
    console.log('DEBUG: has insert=', typeof raw.insert)
    console.log('DEBUG: has transaction=', typeof raw.transaction)
    console.log('DEBUG: proto names=', Object.getOwnPropertyNames(Object.getPrototypeOf(raw)))
    console.dir(raw, { depth: 4 })
  })
})
