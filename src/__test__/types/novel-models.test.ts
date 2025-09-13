import { describe, expect, it } from 'vitest'
import { type Chunk, ChunkSchema, type Novel, NovelSchema } from '../database-models'

describe('Novel Models', () => {
  describe('Novel Schema', () => {
    it('should validate valid novel data', () => {
      const validNovel: Novel = {
        id: 'novel_123e4567-e89b-12d3-a456-426614174000',
        title: 'Test Novel',
        author: 'Test Author',
        originalTextPath: 'novels/novel_123e4567-e89b-12d3-a456-426614174000/original.txt',
        textLength: 50000,
        language: 'ja',
        metadataPath: 'novels/novel_123e4567-e89b-12d3-a456-426614174000/metadata.json',
        createdAt: new Date(),
        updatedAt: new Date(),
      }

      expect(() => NovelSchema.parse(validNovel)).not.toThrow()
    })

    it('should validate novel with optional fields', () => {
      const validNovel: Novel = {
        id: 'novel_123',
        title: 'Test Novel',
        author: 'Test Author',
        originalTextPath: 'novels/novel_123/original.txt',
        textLength: 10000,
        language: 'ja',
        createdAt: new Date(),
        updatedAt: new Date(),
      }

      expect(() => NovelSchema.parse(validNovel)).not.toThrow()
    })
  })

  describe('Chunk Schema', () => {
    it('should validate valid chunk data', () => {
      const validChunk: Chunk = {
        id: 'chunk_1',
        novelId: 'novel_123',
        jobId: 'job_123',
        chunkIndex: 0,
        contentPath: 'novels/novel_123/chunks/chunk_0.txt',
        startPosition: 0,
        endPosition: 10000,
        wordCount: 2000,
        createdAt: new Date(),
      }

      expect(() => ChunkSchema.parse(validChunk)).not.toThrow()
    })

    it('should validate chunk without optional fields', () => {
      const chunk: Chunk = {
        id: 'chunk_test',
        novelId: 'novel_123',
        jobId: 'job_123',
        chunkIndex: 1,
        contentPath: 'novels/novel_123/chunks/chunk_1.txt',
        startPosition: 10000,
        endPosition: 20000,
        createdAt: new Date(),
      }
      expect(() => ChunkSchema.parse(chunk)).not.toThrow()
    })
  })

  describe('File Path Validation', () => {
    it('should validate file paths in models', () => {
      const novel: Novel = {
        id: 'novel_123',
        title: 'Test',
        originalTextPath: 'novels/novel_123/original.txt',
        textLength: 1000,
        language: 'ja',
        createdAt: new Date(),
        updatedAt: new Date(),
      }

      const chunk: Chunk = {
        id: 'chunk_1',
        novelId: 'novel_123',
        jobId: 'job_123',
        chunkIndex: 0,
        contentPath: 'novels/novel_123/chunks/chunk_0.txt',
        startPosition: 0,
        endPosition: 5000,
        createdAt: new Date(),
      }

      expect(() => NovelSchema.parse(novel)).not.toThrow()
      expect(() => ChunkSchema.parse(chunk)).not.toThrow()
    })
  })
})
