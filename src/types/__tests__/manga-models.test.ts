import { describe, expect, it } from 'vitest'
import {
  type Episode,
  EpisodeSchema,
  getJapaneseReadingOrder,
  type MangaPage,
  MangaPageSchema,
  type Panel,
  type PanelLayout,
  PanelLayoutSchema,
  PanelSchema,
  type ReadingOrder,
  ReadingOrderSchema,
  sortPanelsByReadingOrder,
} from '../manga-models'

describe('Manga Models', () => {
  describe('Episode Schema', () => {
    it('should validate valid episode data', () => {
      const validEpisode: Episode = {
        id: 'ep_1',
        novelId: 'novel_1',
        episodeNumber: 1,
        title: '第1話：始まりの物語',
        chapters: ['chap_1', 'chap_2'],
        climaxPoint: 1500,
        startIndex: 0,
        endIndex: 3000,
        createdAt: new Date(),
        updatedAt: new Date(),
      }

      expect(() => EpisodeSchema.parse(validEpisode)).not.toThrow()
    })

    it('should allow optional climaxPoint', () => {
      const episodeWithoutClimax: Episode = {
        id: 'ep_2',
        novelId: 'novel_1',
        episodeNumber: 2,
        title: '第2話：日常編',
        chapters: ['chap_3'],
        startIndex: 3000,
        endIndex: 6000,
        createdAt: new Date(),
        updatedAt: new Date(),
      }

      expect(() => EpisodeSchema.parse(episodeWithoutClimax)).not.toThrow()
    })

    it('should reject invalid episode number', () => {
      const invalidEpisode = {
        id: 'ep_1',
        novelId: 'novel_1',
        episodeNumber: 0, // should be positive
        title: '無効なエピソード',
        chapters: [],
        startIndex: 0,
        endIndex: 100,
        createdAt: new Date(),
        updatedAt: new Date(),
      }

      expect(() => EpisodeSchema.parse(invalidEpisode)).toThrow()
    })
  })

  describe('Panel Schema', () => {
    it('should validate valid panel data', () => {
      const validPanel: Panel = {
        id: 'panel_1',
        pageId: 'page_1',
        position: { x: 0, y: 0 },
        size: { width: 200, height: 300 },
        panelType: 'normal',
        content: {
          sceneId: 'scene_1',
          dialogueIds: ['dlg_1', 'dlg_2'],
          situationId: 'sit_1',
        },
        readingOrder: 1,
      }

      expect(() => PanelSchema.parse(validPanel)).not.toThrow()
    })

    it('should validate all panel types', () => {
      const panelTypes: Panel['panelType'][] = ['normal', 'action', 'emphasis']

      panelTypes.forEach((type) => {
        const panel: Panel = {
          id: 'panel_test',
          pageId: 'page_1',
          position: { x: 0.25, y: 0.33 }, // Normalized coordinates [0,1]
          size: { width: 0.375, height: 0.67 }, // Normalized size [0,1]
          panelType: type,
          content: {
            sceneId: 'scene_1',
          },
          readingOrder: 1,
        }
        expect(() => PanelSchema.parse(panel)).not.toThrow()
      })
    })

    it('should allow optional content fields', () => {
      const minimalPanel: Panel = {
        id: 'panel_2',
        pageId: 'page_1',
        position: { x: 0.525, y: 0.0 }, // Normalized coordinates [0,1]
        size: { width: 0.475, height: 1.0 }, // Normalized size [0,1]
        panelType: 'normal',
        content: {}, // all fields optional
        readingOrder: 2,
      }

      expect(() => PanelSchema.parse(minimalPanel)).not.toThrow()
    })
  })

  describe('PanelLayout Schema', () => {
    it('should validate valid panel layout', () => {
      const validLayout: PanelLayout = {
        type: 'grid',
        columns: 2,
        rows: 3,
        gutterSize: 10,
        margin: { top: 20, right: 15, bottom: 20, left: 15 },
      }

      expect(() => PanelLayoutSchema.parse(validLayout)).not.toThrow()
    })

    it('should validate all layout types', () => {
      const layoutTypes: PanelLayout['type'][] = ['grid', 'free', 'vertical', 'horizontal']

      layoutTypes.forEach((type) => {
        const layout: PanelLayout = {
          type,
          columns: type === 'grid' ? 2 : undefined,
          rows: type === 'grid' ? 2 : undefined,
          gutterSize: 5,
          margin: { top: 10, right: 10, bottom: 10, left: 10 },
        }
        expect(() => PanelLayoutSchema.parse(layout)).not.toThrow()
      })
    })
  })

  describe('MangaPage Schema', () => {
    it('should validate valid manga page data', () => {
      const validPage: MangaPage = {
        id: 'page_1',
        episodeId: 'ep_1',
        pageNumber: 1,
        layoutFile: 'novels/novel_123/episodes/1/pages/1/layout.yaml',
        previewImageFile: 'novels/novel_123/episodes/1/pages/1/preview.png',
        panels: [
          {
            id: 'panel_1',
            pageId: 'page_1',
            position: { x: 0, y: 0 },
            size: { width: 200, height: 150 },
            panelType: 'normal',
            content: { sceneId: 'scene_1' },
            readingOrder: 1,
          },
        ],
        createdAt: new Date(),
        updatedAt: new Date(),
      }

      expect(() => MangaPageSchema.parse(validPage)).not.toThrow()
    })

    it('should allow empty panels array', () => {
      const pageWithoutPanels: MangaPage = {
        id: 'page_2',
        episodeId: 'ep_1',
        pageNumber: 2,
        layoutFile: 'novels/novel_123/episodes/1/pages/2/layout.yaml',
        panels: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      }

      expect(() => MangaPageSchema.parse(pageWithoutPanels)).not.toThrow()
    })
  })

  describe('Japanese Reading Order', () => {
    it('should calculate correct reading order for grid layout', () => {
      const panels: Panel[] = [
        {
          id: 'p1',
          pageId: 'page',
          position: { x: 0, y: 0 },
          size: { width: 0.25, height: 0.33 }, // Normalized size [0,1]
          panelType: 'normal',
          content: {},
          readingOrder: 0,
        },
        {
          id: 'p2',
          pageId: 'page',
          position: { x: 0.5, y: 0.0 }, // Normalized coordinates [0,1]
          size: { width: 0.25, height: 0.33 }, // Normalized size [0,1]
          panelType: 'normal',
          content: {},
          readingOrder: 0,
        },
        {
          id: 'p3',
          pageId: 'page',
          position: { x: 0.0, y: 0.5 }, // Normalized coordinates [0,1]
          size: { width: 0.25, height: 0.33 }, // Normalized size [0,1]
          panelType: 'normal',
          content: {},
          readingOrder: 0,
        },
        {
          id: 'p4',
          pageId: 'page',
          position: { x: 0.5, y: 0.5 }, // Normalized coordinates [0,1]
          size: { width: 0.25, height: 0.33 }, // Normalized size [0,1]
          panelType: 'normal',
          content: {},
          readingOrder: 0,
        },
      ]

      const order = getJapaneseReadingOrder(panels)

      // 日本式: 右上(p2) → 左上(p1) → 右下(p3) → 左下(p4)
      expect(order).toEqual({
        p2: 1,
        p1: 2,
        p4: 3,
        p3: 4,
      })
    })

    it('should handle panels at the same vertical position', () => {
      const panels: Panel[] = [
        {
          id: 'p1',
          pageId: 'page',
          position: { x: 0.0, y: 0.33 }, // Normalized coordinates [0,1]
          size: { width: 0.25, height: 0.33 }, // Normalized size [0,1]
          panelType: 'normal',
          content: {},
          readingOrder: 0,
        },
        {
          id: 'p2',
          pageId: 'page',
          position: { x: 0.375, y: 0.33 }, // Normalized coordinates [0,1]
          size: { width: 0.25, height: 0.33 }, // Normalized size [0,1]
          panelType: 'normal',
          content: {},
          readingOrder: 0,
        },
        {
          id: 'p3',
          pageId: 'page',
          position: { x: 0.75, y: 0.33 }, // Normalized coordinates [0,1]
          size: { width: 0.25, height: 0.33 }, // Normalized size [0,1]
          panelType: 'normal',
          content: {},
          readingOrder: 0,
        },
      ]

      const order = getJapaneseReadingOrder(panels)

      // 同じ高さの場合: 右(p3) → 中(p2) → 左(p1)
      expect(order.p3).toBe(1)
      expect(order.p2).toBe(2)
      expect(order.p1).toBe(3)
    })

    it('should sort panels by reading order', () => {
      const panels: Panel[] = [
        {
          id: 'p1',
          pageId: 'page',
          position: { x: 0, y: 0 },
          size: { width: 0.25, height: 0.33 }, // Normalized size [0,1]
          panelType: 'normal',
          content: {},
          readingOrder: 3,
        },
        {
          id: 'p2',
          pageId: 'page',
          position: { x: 0.5, y: 0.0 }, // Normalized coordinates [0,1]
          size: { width: 0.25, height: 0.33 }, // Normalized size [0,1]
          panelType: 'normal',
          content: {},
          readingOrder: 1,
        },
        {
          id: 'p3',
          pageId: 'page',
          position: { x: 0.25, y: 0.33 }, // Normalized coordinates [0,1]
          size: { width: 0.25, height: 0.33 }, // Normalized size [0,1]
          panelType: 'normal',
          content: {},
          readingOrder: 2,
        },
      ]

      const sorted = sortPanelsByReadingOrder(panels)

      expect(sorted[0].id).toBe('p2')
      expect(sorted[1].id).toBe('p3')
      expect(sorted[2].id).toBe('p1')
    })

    it('should apply Japanese reading order to panels', () => {
      const panels: Panel[] = [
        {
          id: 'p1',
          pageId: 'page',
          position: { x: 0, y: 0 },
          size: { width: 0.25, height: 0.33 }, // Normalized size [0,1]
          panelType: 'normal',
          content: {},
          readingOrder: 0,
        },
        {
          id: 'p2',
          pageId: 'page',
          position: { x: 0.5, y: 0.0 }, // Normalized coordinates [0,1]
          size: { width: 0.25, height: 0.33 }, // Normalized size [0,1]
          panelType: 'normal',
          content: {},
          readingOrder: 0,
        },
        {
          id: 'p3',
          pageId: 'page',
          position: { x: 0.25, y: 0.5 }, // Normalized coordinates [0,1]
          size: { width: 0.25, height: 0.33 }, // Normalized size [0,1]
          panelType: 'normal',
          content: {},
          readingOrder: 0,
        },
      ]

      const order = getJapaneseReadingOrder(panels)
      const sorted = sortPanelsByReadingOrder(
        panels.map((p) => ({ ...p, readingOrder: order[p.id] })),
      )

      expect(sorted[0].id).toBe('p2') // 右上
      expect(sorted[1].id).toBe('p1') // 左上
      expect(sorted[2].id).toBe('p3') // 下
    })
  })

  describe('ReadingOrder Schema', () => {
    it('should validate reading order mapping', () => {
      const validOrder: ReadingOrder = {
        panel_1: 1,
        panel_2: 2,
        panel_3: 3,
      }

      expect(() => ReadingOrderSchema.parse(validOrder)).not.toThrow()
    })

    it('should reject non-positive order numbers', () => {
      const invalidOrder = {
        panel_1: 0,
        panel_2: -1,
      }

      expect(() => ReadingOrderSchema.parse(invalidOrder)).toThrow()
    })
  })
})
