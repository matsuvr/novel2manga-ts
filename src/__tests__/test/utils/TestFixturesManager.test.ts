/**
 * TestFixturesManager Test Suite
 *
 * Tests for the TestFixturesManager functionality including
 * entity creation, workflow setup, and scenario fixtures.
 */

import { beforeEach, describe, expect, it } from 'vitest'
import { testFixturesManager } from '../../utils/TestFixturesManagerImpl'

describe('TestFixturesManager', () => {
  let fixturesManager = testFixturesManager

  describe('Entity Creation', () => {
    it('should create a user with default values', () => {
      const user = fixturesManager.createUser()

      expect(user).toMatchObject({
        name: 'Test User',
        emailNotifications: 1,
        theme: 'light',
        language: 'ja',
      })
      expect(user.id).toMatch(/^user-\d+-[a-z0-9]+$/)
      expect(user.email).toMatch(/^test-\d+-[a-z0-9]+@example\.com$/)
      expect(user.createdAt).toBeDefined()
    })
  })
})
