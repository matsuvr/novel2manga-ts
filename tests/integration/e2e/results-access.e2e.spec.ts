import { randomUUID } from 'node:crypto'
import { expect, test } from '@playwright/test'
import { encode } from 'next-auth/jwt'
import { getDatabaseService } from '@/services/db-factory'
import { getBaseURL } from '../utils/getBaseURL'

// next-auth v5 は AUTH_SECRET を利用するため、テスト側も AUTH_SECRET に合わせる
const secret = process.env.AUTH_SECRET || 'test-secret'

test('results pages enforce user access control', async ({ page }) => {
  const db = getDatabaseService()
  const novel1 = randomUUID()
  await db.ensureNovel(novel1, {
    title: 'N1',
    author: '',
    originalTextPath: 'n1.txt',
    textLength: 10,
    language: 'ja',
    metadataPath: null,
  })
  const job1 = await db.createJob({ novelId: novel1, title: 'Job1', userId: 'user1' })

  const novel2 = randomUUID()
  await db.ensureNovel(novel2, {
    title: 'N2',
    author: '',
    originalTextPath: 'n2.txt',
    textLength: 10,
    language: 'ja',
    metadataPath: null,
  })
  await db.createJob({ novelId: novel2, title: 'Job2', userId: 'user2' })

  const baseURL = getBaseURL()

  // Login as user1 and confirm listing
  // NextAuth v5のJWT設定に合わせて、saltを削除（サーバー側設定と一致させる）
  const token1 = await encode({ token: { sub: 'user1', email: 'user1@example.com' }, secret })
  await page.context().addCookies([{ name: 'authjs.session-token', value: token1, url: baseURL }])
  await page.goto('/results', { waitUntil: 'domcontentloaded' })
  await expect(page.locator('text=Job1')).toBeVisible()
  await expect(page.locator('text=Job2')).not.toBeVisible()

  // Login as user2 and attempt to access user1 job detail
  await page.context().clearCookies()
  const token2 = await encode({ token: { sub: 'user2', email: 'user2@example.com' }, secret })
  await page.context().addCookies([{ name: 'authjs.session-token', value: token2, url: baseURL }])
  const response = await page.goto(`/results/${job1}`)
  expect(response?.status()).toBe(404)
})
