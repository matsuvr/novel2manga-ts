// (Deprecated) ChunkDataBuilder test
// 仕様上このレイヤーは撤去済み。暫定的に空のテストスイートを置き、
// 削除マイグレーション完了まではテストランを失敗させない。
import { describe, expect, it } from 'vitest'

describe('chunk-data-builder (deprecated)', () => {
	it('placeholder passes', () => {
		expect(true).toBe(true)
	})
})