import { test, expect } from '@playwright/test'

test('GET /api/health returns 200', async ({ request }) => {
  const base = process.env.API_BASE_URL || 'http://localhost:3000/api'
  const res = await request.get(`${base}/health`)
  expect(res.status()).toBe(200)
  const json = await res.json()
  expect(json).toMatchObject({ status: 'ok' })
})
