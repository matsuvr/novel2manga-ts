import type { NextRequest } from 'next/server'
import { describe, expect, it } from 'vitest'
import { detectDemoMode } from '@/utils/request-mode'

function mockRequest(url: string): NextRequest {
	return { url } as unknown as NextRequest
}

describe('detectDemoMode', () => {
	it('detects via query', () => {
		const req = mockRequest('http://localhost:3000/api/x?demo=1')
		expect(detectDemoMode(req, {})).toBe(true)
	})

	it('detects via body.mode', () => {
		const req = mockRequest('http://localhost:3000/api/x')
		expect(detectDemoMode(req, { mode: 'demo' })).toBe(true)
	})

	it('returns false otherwise', () => {
		const req = mockRequest('http://localhost:3000/api/x')
		expect(detectDemoMode(req, {})).toBe(false)
	})
})


