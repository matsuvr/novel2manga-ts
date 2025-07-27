import { describe, it, expect } from 'vitest'
import { z } from 'zod'
import { 
  TextAnalysisSchema, 
  CharacterSchema,
  SceneSchema,
  DialogueSchema,
  HighlightSchema,
  SituationSchema,
  type TextAnalysis,
  type Character,
  type Scene,
  type Dialogue,
  type Highlight,
  type Situation
} from '../text-analysis'

describe('TextAnalysis Model', () => {
  describe('Character Schema', () => {
    it('should validate valid character data', () => {
      const validCharacter: Character = {
        id: 'char_1',
        name: '太郎',
        description: '主人公の高校生',
        firstAppearance: 0
      }
      
      expect(() => CharacterSchema.parse(validCharacter)).not.toThrow()
    })

    it('should reject invalid character data', () => {
      const invalidCharacter = {
        name: '太郎',
        // missing required fields: id, description, firstAppearance
      }
      
      expect(() => CharacterSchema.parse(invalidCharacter)).toThrow()
    })
  })

  describe('Scene Schema', () => {
    it('should validate valid scene data', () => {
      const validScene: Scene = {
        id: 'scene_1',
        location: '学校の教室',
        time: '午後',
        description: '放課後の静かな教室',
        startIndex: 0,
        endIndex: 500
      }
      
      expect(() => SceneSchema.parse(validScene)).not.toThrow()
    })

    it('should allow optional time field', () => {
      const sceneWithoutTime: Scene = {
        id: 'scene_1',
        location: '公園',
        description: '桜が咲いている公園',
        startIndex: 0,
        endIndex: 300
      }
      
      expect(() => SceneSchema.parse(sceneWithoutTime)).not.toThrow()
    })
  })

  describe('Dialogue Schema', () => {
    it('should validate valid dialogue data', () => {
      const validDialogue: Dialogue = {
        id: 'dlg_1',
        speakerId: 'char_1',
        text: 'おはよう！',
        emotion: 'happy',
        index: 100
      }
      
      expect(() => DialogueSchema.parse(validDialogue)).not.toThrow()
    })

    it('should allow optional emotion field', () => {
      const dialogueWithoutEmotion: Dialogue = {
        id: 'dlg_1',
        speakerId: 'char_2',
        text: 'そうですね',
        index: 200
      }
      
      expect(() => DialogueSchema.parse(dialogueWithoutEmotion)).not.toThrow()
    })
  })

  describe('Highlight Schema', () => {
    it('should validate valid highlight data', () => {
      const validHighlight: Highlight = {
        id: 'hl_1',
        type: 'climax',
        description: '主人公が真実を知る瞬間',
        importance: 5,
        startIndex: 1000,
        endIndex: 1500
      }
      
      expect(() => HighlightSchema.parse(validHighlight)).not.toThrow()
    })

    it('should enforce importance range 1-5', () => {
      const highlightWithInvalidImportance = {
        id: 'hl_1',
        type: 'turning_point',
        description: '物語の転換点',
        importance: 6, // invalid: should be 1-5
        startIndex: 500,
        endIndex: 600
      }
      
      expect(() => HighlightSchema.parse(highlightWithInvalidImportance)).toThrow()
    })

    it('should validate highlight types', () => {
      const validTypes = ['climax', 'turning_point', 'emotional_peak', 'action_sequence']
      
      validTypes.forEach(type => {
        const highlight: Highlight = {
          id: 'hl_test',
          type: type as Highlight['type'],
          description: 'テストハイライト',
          importance: 3,
          startIndex: 0,
          endIndex: 100
        }
        expect(() => HighlightSchema.parse(highlight)).not.toThrow()
      })
    })
  })

  describe('Situation Schema', () => {
    it('should validate valid situation data', () => {
      const validSituation: Situation = {
        id: 'sit_1',
        description: '太郎は教室で一人、窓の外を眺めていた',
        index: 50
      }
      
      expect(() => SituationSchema.parse(validSituation)).not.toThrow()
    })
  })

  describe('TextAnalysis Schema', () => {
    it('should validate complete text analysis data', () => {
      const validAnalysis: TextAnalysis = {
        id: 'analysis_1',
        chunkId: 'chunk_1',
        characters: [
          {
            id: 'char_1',
            name: '太郎',
            description: '主人公',
            firstAppearance: 0
          }
        ],
        scenes: [
          {
            id: 'scene_1',
            location: '教室',
            description: '放課後の教室',
            startIndex: 0,
            endIndex: 100
          }
        ],
        dialogues: [
          {
            id: 'dlg_1',
            speakerId: 'char_1',
            text: 'テストです',
            index: 10
          }
        ],
        highlights: [
          {
            id: 'hl_1',
            type: 'climax',
            description: 'クライマックスシーン',
            importance: 5,
            startIndex: 50,
            endIndex: 80
          }
        ],
        situations: [
          {
            id: 'sit_1',
            description: '状況説明',
            index: 0
          }
        ],
        createdAt: new Date(),
        updatedAt: new Date()
      }
      
      expect(() => TextAnalysisSchema.parse(validAnalysis)).not.toThrow()
    })

    it('should validate empty arrays for optional collections', () => {
      const minimalAnalysis: TextAnalysis = {
        id: 'analysis_2',
        characters: [],
        scenes: [],
        dialogues: [],
        highlights: [],
        situations: [],
        createdAt: new Date(),
        updatedAt: new Date()
      }
      
      expect(() => TextAnalysisSchema.parse(minimalAnalysis)).not.toThrow()
    })

    it('should reject missing required fields', () => {
      const invalidAnalysis = {
        characters: [],
        scenes: [],
        // missing: id, dialogues, highlights, situations, timestamps
      }
      
      expect(() => TextAnalysisSchema.parse(invalidAnalysis)).toThrow()
    })
  })

  describe('5要素の構造検証', () => {
    it('should contain all 5 essential elements', () => {
      const analysis: TextAnalysis = {
        id: 'test_5elements',
        characters: [{ id: 'c1', name: '花子', description: 'ヒロイン', firstAppearance: 0 }],
        scenes: [{ id: 's1', location: '学校', description: '朝の学校', startIndex: 0, endIndex: 100 }],
        dialogues: [{ id: 'd1', speakerId: 'c1', text: 'おはよう', index: 10 }],
        highlights: [{ id: 'h1', type: 'emotional_peak', description: '感動シーン', importance: 4, startIndex: 50, endIndex: 60 }],
        situations: [{ id: 'st1', description: '朝の登校風景', index: 0 }],
        createdAt: new Date(),
        updatedAt: new Date()
      }

      const result = TextAnalysisSchema.parse(analysis)
      
      // 5要素すべてが存在することを確認
      expect(result.characters).toBeDefined()
      expect(result.scenes).toBeDefined()
      expect(result.dialogues).toBeDefined()
      expect(result.highlights).toBeDefined()
      expect(result.situations).toBeDefined()
      
      // 各要素が配列であることを確認
      expect(Array.isArray(result.characters)).toBe(true)
      expect(Array.isArray(result.scenes)).toBe(true)
      expect(Array.isArray(result.dialogues)).toBe(true)
      expect(Array.isArray(result.highlights)).toBe(true)
      expect(Array.isArray(result.situations)).toBe(true)
    })
  })
})