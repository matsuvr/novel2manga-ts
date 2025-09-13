/**
 * Simple Fixture Test
 *
 * Basic test to verify fixtures work correctly
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { users } from '@/db/schema'
import type { TestDatabase } from '../../index'
import { testDatabaseManager, testFixturesManager } from '../../index'

describe('Simple Fixture Test', () => {
  let testDb: TestDatabase

  beforeAll(async () => {
    testDb = await testDatabaseManager.createTestDatabase({
      testSuiteName: 'simple-fixture-test',
      useMemory: true,
      cleanupOnExit: true,
    })
  })

  afterAll(async () => {
    await testDatabaseManager.cleanupDatabase('simple-fixture-test')
  })

  it('should create a user fixture', () => {
    const user = testFixturesManager.createUser()

    expect(user).toBeDefined()
    expect(user.id).toBeDefined()
    expect(user.name).toBe('Test User')
    expect(user.email).toContain('@example.com')

    console.log('Created user:', user)
  })
})
