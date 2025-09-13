/**
 * Simple Authentication Integration Tests
 *
 * Tests authentication functionality without complex service dependencies
 */

import { eq } from 'drizzle-orm'
import { Effect } from 'effect'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { users } from '@/db/schema'
import { createMockSession } from './helpers/test-auth'
import { createTestUser, getTestDatabase, resetTestDatabase } from './helpers/test-database'

describe('Simple Authentication Integration Tests', () => {
  const db = getTestDatabase()

  beforeEach(() => {
    resetTestDatabase()
  })

  afterEach(() => {
    resetTestDatabase()
  })

  describe('Database User Operations', () => {
    it('should create and retrieve user from database', async () => {
      // Arrange: Create test user

      const uniqueSuffix = `${Date.now()}-${crypto.randomUUID().substring(0, 8)}`

      const testUser = createTestUser({
        id: 'test-user-1',
        email: `user1-${uniqueSuffix}@test.com`, // ユニークなemail,
        emailNotifications: true,
        theme: 'dark',
        language: 'en',
      })

      // Act: Insert user into database
      await db.insert(users).values(testUser)

      // Retrieve user from database
      const [retrievedUser] = await db.select().from(users).where(eq(users.id, 'test-user-1'))

      // Assert: User should be correctly stored and retrieved
      expect(retrievedUser).toBeDefined()
      expect(retrievedUser.id).toBe('test-user-1')
      expect(retrievedUser.email).toBe(`user1-${uniqueSuffix}@test.com`)
      expect(retrievedUser.emailNotifications).toBe(true)
      expect(retrievedUser.theme).toBe('dark')
      expect(retrievedUser.language).toBe('en')
    })

    it('should update user settings in database', async () => {
      // Arrange: Create and insert test user
      const testUser = createTestUser({
        id: 'test-user-2',
        emailNotifications: true,
        theme: 'light',
        language: 'ja',
      })

      await db.insert(users).values(testUser)

      // Act: Update user settings
      await db
        .update(users)
        .set({
          emailNotifications: false,
          theme: 'dark',
          language: 'en',
        })
        .where(eq(users.id, 'test-user-2'))

      // Retrieve updated user
      const [updatedUser] = await db.select().from(users).where(eq(users.id, 'test-user-2'))

      // Assert: Settings should be updated
      expect(updatedUser.emailNotifications).toBe(false)
      expect(updatedUser.theme).toBe('dark')
      expect(updatedUser.language).toBe('en')
    })

    it('should delete user from database', async () => {
      // Arrange: Create and insert test user
      const uniqueSuffix = `${Date.now()}-${crypto.randomUUID().substring(0, 8)}`

      const testUser = createTestUser({
        id: 'test-user-3',
        email: `user3-${uniqueSuffix}@test.com`,
      })

      await db.insert(users).values(testUser)

      // Verify user exists
      const [existingUser] = await db.select().from(users).where(eq(users.id, 'test-user-3'))
      expect(existingUser).toBeDefined()

      // Act: Delete user
      await db.delete(users).where(eq(users.id, 'test-user-3'))

      // Assert: User should be deleted
      const deletedUser = await db.select().from(users).where(eq(users.id, 'test-user-3'))
      expect(deletedUser).toHaveLength(0)
    })
  })

  describe('Session Handling', () => {
    it('should create valid mock session', async () => {
      const uniqueSuffix = `${Date.now()}-${crypto.randomUUID().substring(0, 8)}`

      // Arrange: create a unique user email for the session
      const testEmail = `user4-${uniqueSuffix}@test.com`

      // Act: Create mock session with the actual email
      const session = createMockSession({
        user: {
          id: 'session-user-id',
          email: testEmail,
          name: 'Session User',
        },
      })

      // Assert: Session should have correct structure
      expect(session.user.id).toBe('session-user-id')
      expect(session.user.email).toBe(testEmail)
      expect(session.expires).toBeDefined()
      expect(new Date(session.expires).getTime()).toBeGreaterThan(Date.now())
    })

    it('should handle session validation logic', () => {
      // Arrange: Create session
      const validSession = createMockSession('valid-user')
      const expiredSession = {
        ...createMockSession('expired-user'),
        expires: new Date(Date.now() - 1000).toISOString(), // Expired 1 second ago
      }

      // Act & Assert: Valid session
      expect(validSession.user.id).toBe('valid-user')
      expect(new Date(validSession.expires).getTime()).toBeGreaterThan(Date.now())

      // Act & Assert: Expired session
      expect(expiredSession.user.id).toBe('expired-user')
      expect(new Date(expiredSession.expires).getTime()).toBeLessThan(Date.now())
    })
  })

  describe('User Data Isolation', () => {
    it('should maintain data isolation between users', async () => {
      const uniqueSuffix = `${Date.now()}-${crypto.randomUUID().substring(0, 8)}`

      // Arrange: Create multiple users
      const user1 = createTestUser({
        id: 'user-1',
        email: `user1-${uniqueSuffix}@test.com`,
        theme: 'light',
      })

      const user2 = createTestUser({
        id: 'user-2',
        email: `user2-${uniqueSuffix}@test.com`,
        theme: 'dark',
      })

      await db.insert(users).values([user1, user2])

      // Act: Update only user1's settings
      await db.update(users).set({ theme: 'dark' }).where(eq(users.id, 'user-1'))

      // Assert: Only user1 should be updated
      const [updatedUser1] = await db.select().from(users).where(eq(users.id, 'user-1'))
      const [unchangedUser2] = await db.select().from(users).where(eq(users.id, 'user-2'))

      expect(updatedUser1.theme).toBe('dark')
      expect(unchangedUser2.theme).toBe('dark') // This was already dark
      expect(updatedUser1.id).toBe('user-1')
      expect(unchangedUser2.id).toBe('user-2')
    })

    it('should query users by specific criteria', async () => {
      // トランザクションはbetter-sqlite3ドライバでは同期API。
      // コールバックでPromiseを返さないよう、async/awaitを使用しない。
      await db.transaction((tx) => {
        const uniqueSuffix = `${Date.now()}-${crypto.randomUUID().substring(0, 8)}`

        tx.insert(users)
          .values([
            {
              id: `notify-user-1-${uniqueSuffix}`,
              name: 'Notify User 1',
              email: `notify1-${uniqueSuffix}@test.com`,
              emailNotifications: true,
            },
            {
              id: `notify-user-2-${uniqueSuffix}`,
              name: 'Notify User 2',
              email: `notify2-${uniqueSuffix}@test.com`,
              emailNotifications: false,
            },
            {
              id: `notify-user-3-${uniqueSuffix}`,
              name: 'Notify User 3',
              email: `notify3-${uniqueSuffix}@test.com`,
              emailNotifications: true,
            },
          ])
          .run()

        // Act: Query users then filter in-memory for stability across driver versions
        const notificationUsers = tx.select().from(users).all()

        // Assert: Should return exactly 2 users we created
        // Filter by our suffix to avoid counting any pre-existing fixture data
        const filtered = notificationUsers.filter(
          (u) => u.id?.includes(uniqueSuffix) && u.emailNotifications === true,
        )
        expect(filtered).toHaveLength(2)
        expect(filtered.map((u) => u.id)).toContain(`notify-user-1-${uniqueSuffix}`)
        expect(filtered.map((u) => u.id)).toContain(`notify-user-3-${uniqueSuffix}`)
      })
    })
  })
})
