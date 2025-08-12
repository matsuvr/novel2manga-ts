import { describe, expect, it } from 'vitest'
import { isSceneDomainModel, normalizeToSceneCore, SceneCoreSchema, SceneFlexibleSchema, sceneLegacyFlags } from '@/domain/models/scene'
import { ValidationError } from '@/utils/api-error'

describe('domain/models/scene', () => {
  describe('isSceneDomainModel', () => {
    it('returns true for flexible scene with partial fields', () => {
      const partial = { location: 'Tokyo', description: 'Desc (missing ids)' }
      expect(isSceneDomainModel(partial)).toBe(true)
    })

    it('returns false for non-object', () => {
      expect(isSceneDomainModel(null)).toBe(false)
      expect(isSceneDomainModel('str')).toBe(false)
    })
  })

  describe('normalizeToSceneCore', () => {
    const base = {
      id: 's1',
      location: 'Forest',
      description: 'A quiet forest',
      startIndex: 10,
      endIndex: 50,
    }

    it('passes valid core scene', () => {
      const scene = normalizeToSceneCore(base)
      expect(scene).toMatchObject(base)
    })

    it('fails with missing required fields and throws ValidationError', () => {
      expect(() => normalizeToSceneCore({ location: 'X' })).toThrow(ValidationError)
      try {
        normalizeToSceneCore({ location: 'X' })
      } catch (e) {
        if (e instanceof ValidationError) {
          expect(e.details?.code).toBe('INVALID_INPUT')
          expect(Array.isArray(e.details?.missingFields)).toBe(true)
        }
      }
    })

    it('captures invalid type fields separately from missing fields', () => {
      try {
        normalizeToSceneCore({ id: 123, // invalid type
          location: 'Loc', description: 'D', startIndex: '0', endIndex: 10 } as any)
      } catch (e) {
        expect(e).toBeInstanceOf(ValidationError)
        if (e instanceof ValidationError) {
          // invalidTypeFields が含まれていること
          expect(e.details?.invalidTypeFields).toBeDefined()
          expect(Array.isArray(e.details?.invalidTypeFields)).toBe(true)
          // id と startIndex の型不一致が検出されること（順不同）
          const fields = e.details?.invalidTypeFields as string[]
          expect(fields).toEqual(expect.arrayContaining(['id', 'startIndex']))
        }
      }
    })
  })

  describe('schemas', () => {
    it('SceneFlexibleSchema allows partial', () => {
      const parsed = SceneFlexibleSchema.parse({ description: 'only desc' })
      expect(parsed.description).toBe('only desc')
    })

    it('SceneCoreSchema enforces required fields', () => {
      expect(() => SceneCoreSchema.parse({ id: 'x' })).toThrow()
    })
  })

  describe('sceneLegacyFlags', () => {
    it('returns boolean flags based on presence of time/location strings', () => {
      const flags = sceneLegacyFlags({ location: 'Tokyo', time: 'Night' })
      expect(flags).toEqual({ hasTime: true, hasLocation: true })
      const flags2 = sceneLegacyFlags({ location: '  ', time: '' })
      expect(flags2).toEqual({ hasTime: false, hasLocation: false })
    })
  })
})
