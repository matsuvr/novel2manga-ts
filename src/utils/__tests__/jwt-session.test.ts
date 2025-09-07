import { describe, expect, it, vi } from 'vitest'
import { extractBearerToken, verifySessionToken } from '../jwt-session'

describe('extractBearerToken', () => {
  it('Bearerトークンを抽出できる', () => {
    expect(extractBearerToken('Bearer abc')).toBe('abc')
  })

  it('余分なスペースや大文字小文字を許容する', () => {
    expect(extractBearerToken('  bearer   XYZ  ')).toBe('XYZ')
  })

  it('不正なヘッダーはnullを返す', () => {
    expect(extractBearerToken('Basic abc')).toBeNull()
  })
})

describe('verifySessionToken', () => {
  it('シークレット未設定時はnullを返しエラーをログする', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const result = await verifySessionToken('token', undefined)
    expect(result).toBeNull()
    expect(spy).toHaveBeenCalled()
    spy.mockRestore()
  })
})
