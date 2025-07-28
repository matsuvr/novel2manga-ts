import { describe, it, expect } from 'vitest'
import {
  NovelSchema,
  ChunkSchema,
  ChunkAnalysisSchema,
  NovelAnalysisSchema,
  getR2FilePath,
  type Novel,
  type Chunk,
  type ChunkAnalysis,
  type NovelAnalysis,
  type ChunkStatus,
  type JobStatus
} from '../novel-models'

describe('Novel Models', () => {
  describe('Novel Schema', () => {
    it('should validate valid novel data', () => {
      const validNovel: Novel = {
        id: 'novel_123e4567-e89b-12d3-a456-426614174000',
        title: 'テスト小説',
        originalTextFile: 'novels/novel_123e4567-e89b-12d3-a456-426614174000/original.txt',
        totalLength: 50000,
        createdAt: new Date(),
        updatedAt: new Date()
      }
      
      expect(() => NovelSchema.parse(validNovel)).not.toThrow()
    })

  })

  describe('Chunk Schema', () => {
    it('should validate valid chunk data', () => {
      const validChunk: Chunk = {
        id: 'chunk_1',
        novelId: 'novel_123',
        chunkIndex: 0,
        textFile: 'novels/novel_123/chunks/chunk_0.txt',
        startIndex: 0,
        endIndex: 10000,
        status: 'pending'
      }
      
      expect(() => ChunkSchema.parse(validChunk)).not.toThrow()
    })

    it('should validate all chunk statuses', () => {
      const statuses: ChunkStatus[] = ['pending', 'processing', 'completed', 'failed']
      
      statuses.forEach(status => {
        const chunk: Chunk = {
          id: 'chunk_test',
          novelId: 'novel_123',
          chunkIndex: 1,
          textFile: 'novels/novel_123/chunks/chunk_1.txt',
          startIndex: 10000,
          endIndex: 20000,
          status
        }
        expect(() => ChunkSchema.parse(chunk)).not.toThrow()
      })
    })
  })

  describe('ChunkAnalysis Schema', () => {
    it('should validate valid chunk analysis data', () => {
      const validAnalysis: ChunkAnalysis = {
        id: 'analysis_1',
        chunkId: 'chunk_1',
        analysisFile: 'novels/novel_123/analysis/chunk_0.json',
        processedAt: new Date(),
        summary: {
          characterCount: 5,
          sceneCount: 3,
          dialogueCount: 20,
          highlightCount: 2,
          situationCount: 10
        }
      }
      
      expect(() => ChunkAnalysisSchema.parse(validAnalysis)).not.toThrow()
    })

    it('should enforce non-negative counts in summary', () => {
      const invalidAnalysis = {
        id: 'analysis_1',
        chunkId: 'chunk_1',
        analysisFile: 'novels/novel_123/analysis/chunk_0.json',
        processedAt: new Date(),
        summary: {
          characterCount: -1, // Invalid
          sceneCount: 3,
          dialogueCount: 20,
          highlightCount: 2,
          situationCount: 10
        }
      }
      
      expect(() => ChunkAnalysisSchema.parse(invalidAnalysis)).toThrow()
    })
  })

  describe('NovelAnalysis Schema', () => {
    it('should validate valid novel analysis data', () => {
      const validAnalysis: NovelAnalysis = {
        id: 'novel_analysis_1',
        novelId: 'novel_123',
        analysisFile: 'novels/novel_123/analysis/integrated.json',
        summary: {
          totalCharacters: 15,
          totalScenes: 10,
          totalDialogues: 100,
          totalHighlights: 8,
          totalSituations: 50
        },
        createdAt: new Date(),
        updatedAt: new Date()
      }
      
      expect(() => NovelAnalysisSchema.parse(validAnalysis)).not.toThrow()
    })
  })

  describe('R2 File Path Helper', () => {
    const novelId = 'novel_123e4567-e89b-12d3-a456-426614174000'

    it('should generate correct original text file path', () => {
      const path = getR2FilePath(novelId, 'original')
      expect(path).toBe('novels/novel_123e4567-e89b-12d3-a456-426614174000/original.txt')
    })

    it('should generate correct chunk file path', () => {
      const path = getR2FilePath(novelId, 'chunk', { chunkIndex: 5 })
      expect(path).toBe('novels/novel_123e4567-e89b-12d3-a456-426614174000/chunks/chunk_5.txt')
    })

    it('should generate correct chunk analysis file path', () => {
      const path = getR2FilePath(novelId, 'chunk-analysis', { chunkIndex: 3 })
      expect(path).toBe('novels/novel_123e4567-e89b-12d3-a456-426614174000/analysis/chunk_3.json')
    })

    it('should generate correct integrated analysis file path', () => {
      const path = getR2FilePath(novelId, 'integrated-analysis')
      expect(path).toBe('novels/novel_123e4567-e89b-12d3-a456-426614174000/analysis/integrated.json')
    })

    it('should generate correct layout file path', () => {
      const path = getR2FilePath(novelId, 'layout', { episodeNumber: 1, pageNumber: 3 })
      expect(path).toBe('novels/novel_123e4567-e89b-12d3-a456-426614174000/episodes/1/pages/3/layout.yaml')
    })

    it('should generate correct preview image file path', () => {
      const path = getR2FilePath(novelId, 'preview', { episodeNumber: 2, pageNumber: 5 })
      expect(path).toBe('novels/novel_123e4567-e89b-12d3-a456-426614174000/episodes/2/pages/5/preview.png')
    })

    it('should throw error for invalid file type', () => {
      // @ts-expect-error - テスト用の無効な値
      expect(() => getR2FilePath(novelId, 'invalid')).toThrow()
    })

    it('should throw error when required options are missing', () => {
      expect(() => getR2FilePath(novelId, 'chunk')).toThrow()
      expect(() => getR2FilePath(novelId, 'layout', { episodeNumber: 1 })).toThrow()
    })
  })

  describe('File Path Validation', () => {
    it('should validate R2 file paths in models', () => {
      const novel: Novel = {
        id: 'novel_123',
        title: 'Test',
        originalTextFile: getR2FilePath('novel_123', 'original'),
        totalLength: 1000,
        createdAt: new Date(),
        updatedAt: new Date()
      }

      const chunk: Chunk = {
        id: 'chunk_1',
        novelId: 'novel_123',
        chunkIndex: 0,
        textFile: getR2FilePath('novel_123', 'chunk', { chunkIndex: 0 }),
        startIndex: 0,
        endIndex: 5000,
        status: 'pending'
      }

      expect(() => NovelSchema.parse(novel)).not.toThrow()
      expect(() => ChunkSchema.parse(chunk)).not.toThrow()
    })
  })
})