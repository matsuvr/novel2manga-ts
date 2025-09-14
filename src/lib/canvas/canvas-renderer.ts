import { getAppConfigWithOverrides } from '@/config/app.config'
import type { AppCanvasConfig } from '@/types/canvas-config'
import type { Dialogue, MangaLayout, Panel } from '@/types/panel-layout'
import { wrapJapaneseByBudoux } from '@/utils/jp-linebreak'
import { PanelLayoutCoordinator } from './panel-layout-coordinator'
import { type SfxPlacement, SfxPlacer } from './sfx-placer'

// Canvas実装の互換性のため、ブラウザとNode.js両方で動作するようにする
const isServer = typeof window === 'undefined'
type CanvasModule = typeof import('@napi-rs/canvas')
let createCanvas: CanvasModule['createCanvas'] | undefined
let loadImageFn: CanvasModule['loadImage'] | undefined

/** パネル全幅に対する水平スロット領域の割合。0.9はパネル幅の90%をスロット領域として確保するための値。 */
const HORIZONTAL_SLOT_COVERAGE = 0.9
/** バブルの上端オフセット比率。0.2はバブルをパネル上端から20%下げて配置するための値。 */
const BUBBLE_TOP_OFFSET_RATIO = 0.2
/** バブルエリアの最大高さ比率。0.7はパネル高さの70%までバブルを配置可能とするための値。 */
const MAX_BUBBLE_AREA_HEIGHT_RATIO = 0.7
/** パネル外周のマージン比率。0.05はパネル幅・高さの5%をマージンとして確保するための値。 */
const PANEL_MARGIN_RATIO = 0.05
/** 1つのバブルの最大幅比率。0.45はパネル幅の45%を1バブルの最大幅とするための値。 */
const SINGLE_BUBBLE_MAX_WIDTH_RATIO = 0.45
/** バブル内側のパディング（px単位）。10pxはテキストとバブル枠の間隔を確保するための値。 */
const BUBBLE_PADDING = 10
/** 1つのバブルの最小高さ（px単位）。60pxは短いセリフでもバブルが潰れないようにするための値。 */
const SINGLE_BUBBLE_MIN_HEIGHT = 60
/** バブルの最小高さ（px単位）。30pxは複数バブル時の最小高さを保証するための値。 */
const MIN_BUBBLE_HEIGHT = 30
/** バブル配置時に利用可能な垂直方向の最小マージン（px単位）。2pxはバブル同士が重ならないようにするための値。 */
const AVAILABLE_VERTICAL_MARGIN = 2

// Node.js 向け canvas 実装の型定義
interface NodeCanvasImpl {
  width: number
  height: number
  getContext(contextId: '2d'): CanvasRenderingContext2D
  toDataURL(type?: string, quality?: number): string
  toBuffer(
    callback: (err: Error | null, buffer: Buffer) => void,
    mimeType?: string,
    config?: unknown,
  ): void
  toBuffer(mimeType?: string, config?: unknown): Buffer
}

export type NodeCanvas = NodeCanvasImpl

// Canvas module loading - async initialization needed for ES modules
let canvasInitialized = false
let canvasInitPromise: Promise<void> | null = null

async function initializeCanvas(): Promise<void> {
  if (canvasInitialized) return
  if (canvasInitPromise) return canvasInitPromise

  canvasInitPromise = (async () => {
    if (isServer) {
      // サーバーサイドでは @napi-rs/canvas を使用
      try {
        const canvasModule = await import('@napi-rs/canvas')
        createCanvas = canvasModule.createCanvas
        loadImageFn = canvasModule.loadImage
        // Register Japanese-capable font for server-side rendering so
        // Noto / project fonts are available when calling ctx.fillText.
        // Use a bundled font as a sensible default; allow override via
        // environment variable CANVAS_FONT_PATH if needed.
        try {
          const fontPath = process.env.CANVAS_FONT_PATH || `${__dirname}/../../fonts/NotoSansJP-Light.ttf`
          // @napi-rs/canvas exposes GlobalFonts.register in recent versions
          // Define a narrow interface for the subset we need to avoid `any`.
          interface CanvasModuleWithGlobalFonts {
            GlobalFonts?: {
              register: (path: string, opts?: { family?: string }) => void
            }
          }
          const maybeModule = canvasModule as unknown as CanvasModuleWithGlobalFonts
          if (maybeModule?.GlobalFonts && typeof maybeModule.GlobalFonts.register === 'function') {
            // Prefer the Noto Sans JP family supplied in the repository
            maybeModule.GlobalFonts.register(fontPath, { family: 'NotoSansJP' })
          }
        } catch (fontErr) {
          // Non-fatal: proceed without registered font but log warning
          console.warn('Failed to register server-side canvas font', fontErr)
        }
        canvasInitialized = true
      } catch (error) {
        console.warn('@napi-rs/canvas not available, Canvas functionality will be limited', error)
      }
    } else {
      canvasInitialized = true
    }
  })()

  return canvasInitPromise
}

export interface DialogueAsset {
  image: CanvasImageSource
  width: number
  height: number
}

interface DrawBubbleParams {
  dialogue: Dialogue
  asset: DialogueAsset
  x: number
  y: number
  bubbleWidth: number
  bubbleHeight: number
  imageWidth: number
  imageHeight: number
  bounds: { x: number; y: number; width: number; height: number }
  labelOffsetXRatio?: number
  labelOffsetYRatio?: number
}

export interface CanvasConfig {
  width: number
  height: number
  font?: string
  defaultFontSize?: number
  backgroundColor?: string
  fontFamily?: string
  fontSize?: number
  lineColor?: string
  lineWidth?: number
  textColor?: string
}

export class CanvasRenderer {
  canvas: HTMLCanvasElement | NodeCanvas
  private ctx: CanvasRenderingContext2D
  private config: CanvasConfig
  private appConfig: ReturnType<typeof getAppConfigWithOverrides>
  private dialogueAssets?: Record<string, DialogueAsset>
  // Exposed for tests to spy and validate SFX placement interactions
  public sfxPlacer: SfxPlacer
  private layoutCoordinator: PanelLayoutCoordinator

  // Async factory method for proper initialization
  static async create(config: CanvasConfig): Promise<CanvasRenderer> {
    await initializeCanvas()
    return new CanvasRenderer(config)
  }

  constructor(config: CanvasConfig) {
    try {
      this.appConfig = getAppConfigWithOverrides()
    } catch {
      // Minimal safe defaults to satisfy tests when app config is not fully wired
      this.appConfig = {
        rendering: {
          canvas: {
            bubble: {
              fillStyle: '#ffffff',
              strokeStyle: '#000000',
              normalLineWidth: 2,
              shoutLineWidth: 3,
              thoughtShape: {
                bumps: 12,
                amplitudeRatio: 0.1,
                randomness: 0.2,
                minRadiusPx: 4,
                prng: { seedScale: 0.01, sinScale: 12.9898, multiplier: 43758.5453 },
              },
              thoughtTail: {
                enabled: true,
                startRadiusRatio: 0.06,
                gapRatio: 0.2,
                angle: -Math.PI / 4,
                count: 2,
                decay: 0.8,
              },
            },
            speakerLabel: {
              enabled: true,
              fontSize: 0.7,
              padding: 4,
              backgroundColor: '#ffffff',
              borderColor: '#333333',
              textColor: '#333333',
              offsetX: 0.3,
              offsetY: 0.7,
              borderRadius: 3,
            },
            contentText: {
              enabled: true,
              fontSize: { min: 10, max: 18 },
              padding: 4,
              lineHeight: 1.2,
              maxWidthRatio: 0.9,
              maxHeightRatio: 0.35,
              placement: { minAreaSize: 48 },
              background: {
                color: 'rgba(255,255,255,0.7)',
                borderColor: '#333',
                borderWidth: 1,
                borderRadius: 4,
              },
              textColor: '#000',
            },
            sfx: {
              enabled: true,
              mainTextStyle: {
                fillStyle: '#000',
                strokeStyle: '#fff',
                lineWidth: 4,
                fontWeight: 'bold' as const,
              },
              supplementTextStyle: {
                fillStyle: '#666',
                strokeStyle: '#fff',
                lineWidth: 2,
                fontWeight: 'normal' as const,
              },
              supplementFontSize: { scaleFactor: 0.35, min: 10 },
              rotation: { enabled: true, maxAngle: 0.15 },
              placement: { avoidOverlap: true, preferredPositions: ['top-left', 'bottom-right'] },
            },
          },
        },
      } as unknown as ReturnType<typeof getAppConfigWithOverrides>
    }
    this.config = {
      backgroundColor: '#ffffff',
      // Prefer bundled Japanese-capable font when available; fall back to Arial
      fontFamily: 'NotoSansJP, GenEiMGothic2, Arial, sans-serif',
      fontSize: 16,
      lineColor: '#000000',
      lineWidth: 2,
      textColor: '#000000',
      font: 'NotoSansJP, GenEiMGothic2, Arial, sans-serif',
      defaultFontSize: 16,
      ...config,
    }

    // サーバーサイドとクライアントサイドの両方で動作するようにCanvas作成
    if (isServer && createCanvas) {
      this.canvas = createCanvas(this.config.width, this.config.height) as NodeCanvas
    } else if (typeof document !== 'undefined') {
      this.canvas = document.createElement('canvas')
      this.canvas.width = this.config.width
      this.canvas.height = this.config.height
    } else {
      throw new Error('Canvas is not available in this environment')
    }

    const ctx = this.canvas.getContext('2d')
    if (!ctx) {
      throw new Error('Failed to get 2D rendering context')
    }
    this.ctx = ctx

    this.setupCanvas()
    this.sfxPlacer = new SfxPlacer()
    this.layoutCoordinator = new PanelLayoutCoordinator()
  }

  // Provide robust defaults in case app config is partially mocked in tests
  private getCanvasCfg() {
    const base = this.appConfig?.rendering?.canvas || {}
    const fallback = {
      bubble: {
        fillStyle: '#ffffff',
        strokeStyle: '#000000',
        normalLineWidth: 2,
        shoutLineWidth: 3,
        thoughtShape: {
          bumps: 12,
          amplitudeRatio: 0.1,
          randomness: 0.2,
          minRadiusPx: 4,
          prng: { seedScale: 0.01, sinScale: 12.9898, multiplier: 43758.5453 },
        },
        thoughtTail: {
          enabled: true,
          startRadiusRatio: 0.06,
          gapRatio: 0.2,
          angle: -Math.PI / 4,
          count: 2,
          decay: 0.8,
        },
      },
      speakerLabel: {
        enabled: true,
        fontSize: 0.7,
        padding: 4,
        backgroundColor: '#ffffff',
        borderColor: '#333333',
        textColor: '#333333',
        offsetX: 0.3,
        offsetY: 0.7,
        borderRadius: 3,
      },
      contentText: {
        enabled: true,
        fontSize: { min: 10, max: 18 },
        padding: 4,
        lineHeight: 1.2,
        maxWidthRatio: 0.9,
        maxHeightRatio: 0.35,
        placement: { minAreaSize: 48 },
        background: {
          color: 'rgba(255,255,255,0.7)',
          borderColor: '#333333',
          borderWidth: 1,
          borderRadius: 4,
        },
        textColor: '#000000',
      },
      sfx: {
        enabled: true,
        mainTextStyle: {
          fillStyle: '#000000',
          strokeStyle: '#ffffff',
          lineWidth: 4,
          fontWeight: 'bold' as const,
        },
        supplementTextStyle: {
          fillStyle: '#666666',
          strokeStyle: '#ffffff',
          lineWidth: 2,
          fontWeight: 'normal' as const,
        },
        supplementFontSize: { scaleFactor: 0.35, min: 10 },
        rotation: { enabled: true, maxAngle: 0.15 },
        placement: { avoidOverlap: true, preferredPositions: ['top-left', 'bottom-right'] },
      },
    }
    // shallow merge + deep for bubble.thoughtShape/prng
    const merged = {
      ...fallback,
      ...base,
      bubble: {
        ...fallback.bubble,
        ...(base.bubble || {}),
        thoughtShape: {
          ...fallback.bubble.thoughtShape,
          ...(base.bubble?.thoughtShape || {}),
          prng: {
            ...fallback.bubble.thoughtShape.prng,
            ...(base.bubble?.thoughtShape?.prng || {}),
          },
        },
        thoughtTail: { ...fallback.bubble.thoughtTail, ...(base.bubble?.thoughtTail || {}) },
      },
      speakerLabel: { ...fallback.speakerLabel, ...(base.speakerLabel || {}) },
      contentText: { ...fallback.contentText, ...(base.contentText || {}) },
      sfx: { ...fallback.sfx, ...(base.sfx || {}) },
    }
    return merged
  }

  private setupCanvas(): void {
    this.canvas.width = this.config.width
    this.canvas.height = this.config.height

    // 背景を塗りつぶし
    if (this.config.backgroundColor) {
      this.ctx.fillStyle = this.config.backgroundColor
      this.ctx.fillRect(0, 0, this.config.width, this.config.height)
    }

    // デフォルト設定
    this.ctx.font = `${this.config.fontSize || 16}px ${this.config.fontFamily || 'Arial, sans-serif'}`
    this.ctx.strokeStyle = this.config.lineColor || '#000000'
    this.ctx.lineWidth = this.config.lineWidth || 2
  }

  /**
   * Provide pre-rendered vertical text images for dialogues.
   * Key convention: `${panelId}:${dialogueIndex}`
   */
  setDialogueAssets(assets: Record<string, DialogueAsset>): void {
    this.dialogueAssets = assets
  }

  /** Create an Image from a PNG buffer (server only). */
  static async createImageFromBuffer(buffer: Buffer): Promise<DialogueAsset> {
    if (!isServer || !loadImageFn) {
      throw new Error('createImageFromBuffer is only available on server with @napi-rs/canvas')
    }
    const img = await loadImageFn(buffer)
    const width = img.width
    const height = img.height

    return {
      image: img as unknown as CanvasImageSource,
      width,
      height,
    }
  }

  drawFrame(x: number, y: number, width: number, height: number): void {
    this.ctx.strokeRect(x, y, width, height)
  }

  /** Testing helper: expose layout coordinator */
  getLayoutCoordinator(): PanelLayoutCoordinator {
    return this.layoutCoordinator
  }

  private drawDialogueBubble({
    dialogue,
    asset,
    x: bx,
    y: by,
    bubbleWidth: bubbleW,
    bubbleHeight: bubbleH,
    imageWidth: drawW,
    imageHeight: drawH,
    bounds,
    labelOffsetXRatio,
    labelOffsetYRatio,
  }: DrawBubbleParams): void {
    // 吹き出し背景
    this.ctx.save()
    const canvasCfg = this.getCanvasCfg()
    this.ctx.strokeStyle = canvasCfg.bubble.strokeStyle
    this.ctx.fillStyle = canvasCfg.bubble.fillStyle
    this.ctx.lineWidth =
      dialogue.emotion === 'shout'
        ? canvasCfg.bubble.shoutLineWidth
        : canvasCfg.bubble.normalLineWidth
    const shapeType = dialogue.type || 'speech'
    this.drawBubbleShape(shapeType, bx, by, bubbleW, bubbleH)
    this.ctx.restore()

    // 画像（縦書きセリフ）
    const imgX = bx + (bubbleW - drawW) / 2
    const imgY = by + (bubbleH - drawH) / 2
    this.ctx.drawImage(asset.image, imgX, imgY, drawW, drawH)

    // 占有領域登録
    this.layoutCoordinator.registerDialogueArea(dialogue, {
      x: bx,
      y: by,
      width: bubbleW,
      height: bubbleH,
    })

    // 話者ラベル
    const speakerLabelCfg = this.getCanvasCfg().speakerLabel
    const dialogueType = dialogue.type
    const shouldShowLabel =
      speakerLabelCfg?.enabled === true &&
      dialogueType !== 'narration' &&
      typeof dialogue.speaker === 'string' &&
      dialogue.speaker.trim() !== ''
    if (shouldShowLabel) {
      const baseFontSize = this.config.fontSize || 16
      const fontSize = Math.max(10, baseFontSize * (speakerLabelCfg.fontSize || 0.7))
      const paddingLabel = speakerLabelCfg.padding ?? 4
      const bg = speakerLabelCfg.backgroundColor ?? '#ffffff'
      const border = speakerLabelCfg.borderColor ?? '#333333'
      const textColor = speakerLabelCfg.textColor ?? '#333333'
      const offsetXRatio = labelOffsetXRatio ?? speakerLabelCfg.offsetX ?? 0.3
      const offsetYRatio = labelOffsetYRatio ?? speakerLabelCfg.offsetY ?? 0.7
      const borderRadius = speakerLabelCfg.borderRadius ?? 3
      this.drawSpeakerLabel(dialogue.speaker, bx + bubbleW, by, {
        fontSize,
        padding: paddingLabel,
        backgroundColor: bg,
        borderColor: border,
        textColor,
        offsetXRatio,
        offsetYRatio,
        borderRadius,
        clampBounds: bounds,
      })
    }
  }

  drawPanel(panel: Panel): void {
    // レイアウトコーディネーターをリセット
    this.layoutCoordinator.reset()

    // パネルの位置とサイズを実際のピクセル値に変換
    const x = panel.position.x * this.config.width
    const y = panel.position.y * this.config.height
    const width = panel.size.width * this.config.width
    const height = panel.size.height * this.config.height
    const panelBounds = { x, y, width, height }

    // パネルのフレームを描画
    this.drawFrame(x, y, width, height)

    // クリップ（モック環境では未実装のことがある）
    const canClip = typeof (this.ctx as unknown as { clip?: unknown }).clip === 'function'
    if (canClip && this.hasRect(this.ctx)) {
      this.ctx.beginPath()
      this.ctx.rect(x, y, width, height)
        ; (this.ctx as unknown as CanvasRenderingContext2D & { clip: () => void }).clip()
    }

    // 吹き出しを描画し、占有領域を登録
    if (panel.dialogues && panel.dialogues.length > 0) {
      this.ctx.save()
      this.ctx.beginPath()
      if (canClip && this.hasRect(this.ctx)) {
        this.ctx.rect(x, y, width, height)
        this.ctx.clip()
      } else {
        // 一部のテストモックで rect が未実装のことがあるため、クリップをスキップ
        // フレームは既に drawFrame 済みであるため視覚上の影響は小さい
      }
      try {
        if (panel.dialogues.length > 1) {
          const slotWidth = (width * HORIZONTAL_SLOT_COVERAGE) / panel.dialogues.length
          const bubbleY = y + height * BUBBLE_TOP_OFFSET_RATIO
          const maxAreaHeight = height * MAX_BUBBLE_AREA_HEIGHT_RATIO

          for (let i = 0; i < panel.dialogues.length; i++) {
            const dialogue = panel.dialogues[i]
            const key = `${panel.id}:${i}`
            const asset = this.dialogueAssets?.[key]
            if (!asset) throw new Error(`Dialogue asset missing for ${key}`)

            const targetDrawWidth = slotWidth / Math.sqrt(2) - BUBBLE_PADDING * 2
            const widthScale = targetDrawWidth > 0 ? targetDrawWidth / asset.width : 0
            const targetDrawHeight = maxAreaHeight / Math.sqrt(2) - BUBBLE_PADDING * 2
            const heightScale = targetDrawHeight > 0 ? targetDrawHeight / asset.height : 0
            const scale = Math.min(widthScale, heightScale, 1)
            if (scale <= 0) continue

            const drawW = asset.width * scale
            const drawH = asset.height * scale
            const bubbleW = (drawW + BUBBLE_PADDING * 2) * Math.sqrt(2)
            const bubbleH = (drawH + BUBBLE_PADDING * 2) * Math.sqrt(2)

            const slotX = x + width * PANEL_MARGIN_RATIO + slotWidth * i
            const bx = slotX + (slotWidth - bubbleW) / 2
            const by = bubbleY
            const slotBounds = { x: slotX, y, width: slotWidth, height }

            this.drawDialogueBubble({
              dialogue,
              asset,
              x: bx,
              y: by,
              bubbleWidth: bubbleW,
              bubbleHeight: bubbleH,
              imageWidth: drawW,
              imageHeight: drawH,
              bounds: slotBounds,
              // 水平配置の場合、ラベル（セリフ）のX方向のオフセット比率は常に1（右端）に設定します。
              // これは、バブルが横に並ぶため、ラベルをバブルの右側に寄せて配置するためです。
              // 縦配置や他の配置ではこの値が異なる場合があります（例: 0.5で中央寄せなど）。
              labelOffsetXRatio: 1,
            })
          }
        } else if (panel.dialogues.length === 1) {
          const dialogue = panel.dialogues[0]
          const key = `${panel.id}:0`
          const asset = this.dialogueAssets?.[key]
          if (!asset) throw new Error(`Dialogue asset missing for ${key}`)

          const bubbleY = y + height * BUBBLE_TOP_OFFSET_RATIO
          const maxAreaWidth = width * SINGLE_BUBBLE_MAX_WIDTH_RATIO
          const maxAreaHeightTotal = height * MAX_BUBBLE_AREA_HEIGHT_RATIO
          const perBubbleMaxHeight = Math.max(SINGLE_BUBBLE_MIN_HEIGHT, maxAreaHeightTotal)

          let scale = Math.min(maxAreaWidth / asset.width, perBubbleMaxHeight / asset.height, 1)
          let drawW = asset.width * scale
          let drawH = asset.height * scale
          let bubbleW = (drawW + BUBBLE_PADDING * 2) * Math.sqrt(2)
          let bubbleH = (drawH + BUBBLE_PADDING * 2) * Math.sqrt(2)

          const availableVertical = y + height - bubbleY
          const maxThisBubbleHeight = Math.max(
            MIN_BUBBLE_HEIGHT,
            Math.min(perBubbleMaxHeight, availableVertical - AVAILABLE_VERTICAL_MARGIN),
          )
          if (bubbleH > maxThisBubbleHeight) {
            const targetDrawH = maxThisBubbleHeight / Math.sqrt(2) - BUBBLE_PADDING * 2
            const newScale = targetDrawH > 0 ? targetDrawH / asset.height : 0
            scale = Math.min(scale, newScale)

            drawW = asset.width * scale
            drawH = asset.height * scale
            bubbleW = (drawW + BUBBLE_PADDING * 2) * Math.sqrt(2)
            bubbleH = (drawH + BUBBLE_PADDING * 2) * Math.sqrt(2)
          }

          if (bubbleH > 0 && bubbleY + bubbleH <= y + height) {
            const bx = x + width - bubbleW - width * PANEL_MARGIN_RATIO
            const by = bubbleY

            this.drawDialogueBubble({
              dialogue,
              asset,
              x: bx,
              y: by,
              bubbleWidth: bubbleW,
              bubbleHeight: bubbleH,
              imageWidth: drawW,
              imageHeight: drawH,
              bounds: panelBounds,
            })
          }
        }
      } finally {
        this.ctx.restore()
      }
    }

    // SFXを配置・描画し、占有領域を登録
    if (panel.sfx && panel.sfx.length > 0) {
      this.ctx.save()
      this.ctx.beginPath()
      if (canClip && this.hasRect(this.ctx)) {
        this.ctx.rect(x, y, width, height)
        this.ctx.clip()
      }
      try {
        const preOccupied = this.layoutCoordinator.getOccupiedAreas().map((area) => ({
          x: area.x,
          y: area.y,
          width: area.width,
          height: area.height,
        }))
        const sfxPlacements = this.sfxPlacer.placeSfx(panel.sfx, panel, panelBounds, preOccupied)
        for (const placement of sfxPlacements) {
          this.drawSfxWithPlacement(placement)
          const estBounds = {
            width: Math.max(1, placement.text.length * placement.fontSize * 0.8),
            height: placement.fontSize * (placement.supplement ? 1.8 : 1.2),
          }
          this.layoutCoordinator.registerSfxArea(placement, estBounds)
        }
      } finally {
        this.ctx.restore()
      }
    }

    // 説明テキストの最適配置と描画
    if (panel.content && panel.content.trim() !== '') {
      const contentCfg = this.getCanvasCfg().contentText as AppCanvasConfig['contentText']

      if (contentCfg.enabled !== false) {
        const placement = this.layoutCoordinator.calculateContentTextPlacement(
          panel.content,
          panelBounds,
          this.ctx,
          {
            minFontSize: contentCfg.fontSize.min,
            maxFontSize: contentCfg.fontSize.max,
            padding: contentCfg.padding,
            lineHeight: contentCfg.lineHeight,
            maxWidthRatio: contentCfg.maxWidthRatio,
            maxHeightRatio: contentCfg.maxHeightRatio,
            minAreaSize: contentCfg.placement.minAreaSize,
          },
        )
        if (placement) {
          this.ctx.save()
          // 背景ボックス
          this.ctx.fillStyle = contentCfg.background.color
          this.ctx.strokeStyle = contentCfg.background.borderColor
          this.ctx.lineWidth = contentCfg.background.borderWidth
          this.drawRoundedRect(
            placement.x - contentCfg.padding / 2,
            placement.y - contentCfg.padding / 2,
            placement.width + contentCfg.padding,
            placement.height + contentCfg.padding,
            contentCfg.background.borderRadius,
          )
          this.ctx.fill()
          this.ctx.stroke()

          // テキスト
          this.ctx.font = `${placement.fontSize}px ${this.config.fontFamily || 'Arial, sans-serif'}`
          this.ctx.fillStyle = contentCfg.textColor
          this.ctx.textAlign = 'left'
          this.ctx.textBaseline = 'top'
          let cy = placement.y
          for (const line of placement.lines) {
            this.ctx.fillText(line, placement.x, cy)
            cy += placement.fontSize * contentCfg.lineHeight
          }
          this.ctx.restore()

          this.layoutCoordinator.registerContentArea({
            x: placement.x,
            y: placement.y,
            width: placement.width,
            height: placement.height,
          })
        }
      }
    }
  }

  drawText(
    text: string,
    x: number,
    y: number,
    options?: { maxWidth?: number; font?: string; color?: string },
  ): void {
    const {
      maxWidth,
      font = `${this.config.fontSize || 16}px ${this.config.fontFamily || 'Arial, sans-serif'}`,
      color = this.config.textColor || '#000000',
    } = options || {}

    this.ctx.save()

    this.ctx.font = font
    this.ctx.fillStyle = color
    this.ctx.textAlign = 'left'
    this.ctx.textBaseline = 'top'

    if (maxWidth) {
      const fontSize = parseInt(font.split('px')[0], 10) || 16
      this.drawMultilineText(text, x, y, maxWidth, 1000, fontSize)
    } else {
      this.ctx.fillText(text, x, y)
    }

    this.ctx.restore()
  }

  private drawMultilineText(
    text: string,
    x: number,
    y: number,
    maxWidth: number,
    maxHeight: number,
    fontSize: number,
  ): void {
    const lines = this.wrapText(text, maxWidth)
    const lineHeight = fontSize * 1.2
    const totalHeight = lines.length * lineHeight

    if (totalHeight > maxHeight) {
      // テキストが高さ制限を超える場合は省略
      const maxLines = Math.floor(maxHeight / lineHeight)
      lines.splice(maxLines - 1)
      if (lines.length > 0) {
        lines[lines.length - 1] =
          `${lines[lines.length - 1].substring(0, lines[lines.length - 1].length - 3)}...`
      }
    }

    let currentY = y
    for (const line of lines) {
      this.ctx.fillText(line, x, currentY)
      currentY += lineHeight
    }
  }

  // 一部のテストモック環境で CanvasRenderingContext2D.rect が未実装の場合があるため、型ガードを用意
  private hasRect(ctx: CanvasRenderingContext2D): ctx is CanvasRenderingContext2D & {
    rect: (x: number, y: number, w: number, h: number) => void
  } {
    return typeof (ctx as { rect?: unknown }).rect === 'function'
  }

  private wrapText(text: string, maxWidth: number): string[] {
    const words = text.split('')
    const lines: string[] = []
    let currentLine = ''

    for (const char of words) {
      const testLine = currentLine + char
      const metrics = this.ctx.measureText(testLine)

      if (metrics.width > maxWidth && currentLine !== '') {
        lines.push(currentLine)
        currentLine = char
      } else {
        currentLine = testLine
      }
    }

    if (currentLine) {
      lines.push(currentLine)
    }

    return lines
  }

  /**
   * 計算された配置情報に基づいてSFXを描画
   */
  private drawSfxWithPlacement(placement: SfxPlacement): void {
    const cfg = this.getCanvasCfg().sfx
    this.ctx.save()

    // 回転適用
    if (cfg.rotation?.enabled && placement.rotation) {
      this.ctx.translate(placement.x, placement.y)
      this.ctx.rotate(placement.rotation)
      this.ctx.translate(-placement.x, -placement.y)
    }

    // メインSFX
    const weightMain = cfg.mainTextStyle?.fontWeight === 'bold' ? 'bold' : 'normal'
    this.ctx.font = `${weightMain} ${placement.fontSize}px ${this.config.fontFamily || 'Arial, sans-serif'}`
    this.ctx.fillStyle = cfg.mainTextStyle?.fillStyle || '#000000'
    this.ctx.strokeStyle = cfg.mainTextStyle?.strokeStyle || '#ffffff'
    this.ctx.lineWidth = cfg.mainTextStyle?.lineWidth ?? 4
    this.ctx.textAlign = 'left'
    this.ctx.textBaseline = 'top'
    this.ctx.strokeText(placement.text, placement.x, placement.y)
    this.ctx.fillText(placement.text, placement.x, placement.y)

    // 補足テキスト
    if (placement.supplement) {
      const ratio = cfg.supplementFontSize?.scaleFactor ?? 0.35
      const minSup = cfg.supplementFontSize?.min ?? 10
      const supSize = Math.max(minSup, placement.fontSize * ratio)
      const weightSup = cfg.supplementTextStyle?.fontWeight === 'bold' ? 'bold' : 'normal'
      this.ctx.font = `${weightSup} ${supSize}px ${this.config.fontFamily || 'Arial, sans-serif'}`
      this.ctx.fillStyle = cfg.supplementTextStyle?.fillStyle || '#666666'
      this.ctx.strokeStyle = cfg.supplementTextStyle?.strokeStyle || '#ffffff'
      this.ctx.lineWidth = cfg.supplementTextStyle?.lineWidth ?? 2
      this.ctx.textAlign = 'left'
      this.ctx.textBaseline = 'top'
      const supX = placement.x
      const supY = placement.y + placement.fontSize * 1.1
      this.ctx.strokeText(placement.supplement, supX, supY)
      this.ctx.fillText(placement.supplement, supX, supY)
    }

    this.ctx.restore()
  }

  /**
   * Draws a bubble shape (ellipse, rectangle, or cloud) at the specified position
   * @private
   */
  private drawBubbleShape(
    type: 'speech' | 'thought' | 'narration',
    x: number,
    y: number,
    width: number,
    height: number,
  ): void {
    // Helper: draw a rectangle path even when ctx.rect is unavailable in mocks
    const drawRectPath = (xx: number, yy: number, w: number, h: number) => {
      this.ctx.beginPath()
      this.ctx.moveTo(xx, yy)
      this.ctx.lineTo(xx + w, yy)
      this.ctx.lineTo(xx + w, yy + h)
      this.ctx.lineTo(xx, yy + h)
      this.ctx.closePath()
    }

    if (type === 'narration') {
      if (this.hasRect(this.ctx)) {
        this.ctx.beginPath()
        this.ctx.rect(x, y, width, height)
      } else {
        drawRectPath(x, y, width, height)
      }
      this.ctx.fill()
      this.ctx.stroke()
    } else if (type === 'thought') {
      // より“グネグネ”した雲形に強化（楕円外周の中点を外側に膨らませる）
      const cfg = this.getCanvasCfg().bubble.thoughtShape
      const bumps = Math.max(6, cfg.bumps)
      const cx = x + width / 2
      const cy = y + height / 2
      const rx = width / 2
      const ry = height / 2

      // 基本ふくらみ量（短い方の半径に対する比率を使用）
      const baseBulge = Math.max(cfg.minRadiusPx, Math.min(rx, ry) * cfg.amplitudeRatio)

      // 疑似乱数はテスト安定性のために決定論的（x,y,w,h依存）
      const prngCfg = this.getCanvasCfg().bubble.thoughtShape.prng
      const seedConst = (cx + cy + rx + ry) * prngCfg.seedScale
      const prand = (i: number): number => {
        const s = Math.sin((i + 1) * prngCfg.sinScale * seedConst) * prngCfg.multiplier
        return s - Math.floor(s)
      }

      this.ctx.beginPath()
      let anglePrev = 0
      const pxStart = cx + Math.cos(anglePrev) * rx
      const pyStart = cy + Math.sin(anglePrev) * ry
      this.ctx.moveTo(pxStart, pyStart)
      for (let k = 1; k <= bumps; k++) {
        const angle = (k / bumps) * Math.PI * 2
        const px = cx + Math.cos(angle) * rx
        const py = cy + Math.sin(angle) * ry
        // 中点方向に、こぶのふくらみ（ばらつき付き）を付与
        const midAngle = (anglePrev + angle) / 2
        const jitter = (prand(k) - 0.5) * 2 // [-1, 1]
        const bulge = baseBulge * (1 + cfg.randomness * jitter)
        const cpx = cx + Math.cos(midAngle) * (rx + bulge)
        const cpy = cy + Math.sin(midAngle) * (ry + bulge)
        this.ctx.quadraticCurveTo(cpx, cpy, px, py)
        anglePrev = angle
      }
      this.ctx.closePath()
      this.ctx.fill()
      this.ctx.stroke()

      // 尾泡（小さな丸を2〜3個）
      const tailCfg = this.getCanvasCfg().bubble.thoughtTail
      if (tailCfg?.enabled) {
        const shortR = Math.min(rx, ry)
        const baseRadius = Math.max(2, shortR * tailCfg.startRadiusRatio)
        const gap = shortR * tailCfg.gapRatio
        const angle = tailCfg.angle
        // 尾泡開始位置: 吹き出しの外周から少し外側
        let tx = cx + Math.cos(angle) * (Math.max(rx, ry) * 0.2 + rx)
        let ty = cy + Math.sin(angle) * (Math.max(rx, ry) * 0.2 + ry)
        const hasArc = typeof (this.ctx as unknown as { arc?: unknown }).arc === 'function'
        for (let i = 0; i < Math.max(1, tailCfg.count); i++) {
          const r = baseRadius * Math.max(0.1, tailCfg.decay) ** i
          this.ctx.beginPath()
          if (hasArc) {
            ; (
              this.ctx as unknown as CanvasRenderingContext2D & {
                arc: typeof CanvasRenderingContext2D.prototype.arc
              }
            ).arc(tx, ty, r, 0, Math.PI * 2)
          } else {
            // Fallback: approximate small circles with a rounded rectangle path
            const rr = r * 2
            const kx = tx - r
            const ky = ty - r
            this.ctx.moveTo(kx + r, ky)
            this.ctx.lineTo(kx + rr, ky)
            this.ctx.lineTo(kx + rr, ky + rr)
            this.ctx.lineTo(kx, ky + rr)
            this.ctx.closePath()
          }
          this.ctx.closePath()
          this.ctx.fill()
          this.ctx.stroke()
          tx += Math.cos(angle) * gap
          ty += Math.sin(angle) * gap
        }
      }
    } else {
      // 楕円の描画: テキスト領域を外接する楕円（未実装環境では矩形で代替）
      this.ctx.beginPath()
      const hasEllipse =
        typeof (this.ctx as unknown as { ellipse?: unknown }).ellipse === 'function'
      if (hasEllipse) {
        this.ctx.ellipse(x + width / 2, y + height / 2, width / 2, height / 2, 0, 0, Math.PI * 2)
      } else {
        if (this.hasRect(this.ctx)) {
          this.ctx.rect(x, y, width, height)
        } else {
          drawRectPath(x, y, width, height)
        }
      }
      this.ctx.fill()
      this.ctx.stroke()
    }
  }

  /**
   * 角丸長方形のパスを作成（話者ラベル用）
   */
  private drawRoundedRect(
    x: number,
    y: number,
    width: number,
    height: number,
    radius: number,
  ): void {
    this.ctx.beginPath()
    this.ctx.moveTo(x + radius, y)
    this.ctx.lineTo(x + width - radius, y)
    this.ctx.quadraticCurveTo(x + width, y, x + width, y + radius)
    this.ctx.lineTo(x + width, y + height - radius)
    this.ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height)
    this.ctx.lineTo(x + radius, y + height)
    this.ctx.quadraticCurveTo(x, y + height, x, y + height - radius)
    this.ctx.lineTo(x, y + radius)
    this.ctx.quadraticCurveTo(x, y, x + radius, y)
    this.ctx.closePath()
  }

  /**
   * 話者ラベルを吹き出しの右上に描画
   */
  private drawSpeakerLabel(
    speaker: string,
    xRightEdge: number,
    yTopEdge: number,
    options: {
      fontSize?: number
      padding?: number
      backgroundColor?: string
      borderColor?: string
      textColor?: string
      offsetXRatio?: number
      offsetYRatio?: number
      borderRadius?: number
      clampBounds?: { x: number; y: number; width: number; height: number }
    } = {},
  ): void {
    const {
      fontSize = 12,
      padding = 4,
      backgroundColor = '#ffffff',
      borderColor = '#333333',
      textColor = '#333333',
      offsetXRatio = 0.3,
      offsetYRatio = 0.7,
      borderRadius = 3,
      clampBounds,
    } = options

    if (!speaker || speaker.trim() === '') return

    this.ctx.save()
    // 改行（1行最大文字数）
    const maxChars = this.getCanvasCfg().speakerLabel.maxCharsPerLine ?? 5
    const linesRaw = wrapJapaneseByBudoux(speaker, maxChars)
    const lines = linesRaw.length > 0 ? linesRaw : [speaker]

    // 動的スケーリング（パネル内に収める）
    const family = this.config.fontFamily || 'Arial, sans-serif'
    const minFontSize = 8
    let fs = Math.max(minFontSize, fontSize)
    let lhRatio = 1.2
    const minLhRatio = 1.05

    const measureWith = (f: number): number => {
      this.ctx.font = `${f}px ${family}`
      let maxW = 0
      for (const line of lines) {
        const w = this.ctx.measureText(line).width
        if (w > maxW) maxW = w
      }
      return maxW
    }

    let textMaxWidth = measureWith(fs)
    let lineHeight = Math.ceil(fs * lhRatio)
    let labelWidth = textMaxWidth + padding * 2
    let labelHeight = lines.length * lineHeight + padding * 2

    if (options.clampBounds) {
      // 収まり判定とスケール計算
      const availW = Math.max(1, options.clampBounds.width - 4)
      const availH = Math.max(1, options.clampBounds.height - 4)

      // 幅・高さのスケーリング係数を計算
      const widthScale =
        labelWidth > availW ? (availW - padding * 2) / Math.max(1, textMaxWidth) : 1
      const fsByWidth = Math.floor(fs * Math.min(1, widthScale))

      const fsMaxByHeight = Math.floor((availH - padding * 2) / Math.max(1, lines.length * lhRatio))
      const fsByHeight = Math.min(fs, fsMaxByHeight)

      // フォントサイズを最小限まで下げる
      const newFs = Math.max(minFontSize, Math.min(fsByWidth, fsByHeight))

      // 必要に応じて行間も圧縮
      if (newFs === minFontSize) {
        const lhNeeded = (availH - padding * 2) / Math.max(1, lines.length * newFs)
        lhRatio = Math.max(minLhRatio, Math.min(lhRatio, lhNeeded))
      }

      // 再計測
      fs = newFs
      textMaxWidth = measureWith(fs)
      lineHeight = Math.ceil(fs * lhRatio)
      labelWidth = textMaxWidth + padding * 2
      labelHeight = lines.length * lineHeight + padding * 2
    } else {
      // 非クランプ時もフォント設定だけは適用
      this.ctx.font = `${fs}px ${family}`
    }

    // 位置: 吹き出し右上の少し外側
    let labelX = xRightEdge - labelWidth * offsetXRatio
    let labelY = yTopEdge - labelHeight * offsetYRatio

    if (clampBounds) {
      const maxX = clampBounds.x + clampBounds.width - labelWidth
      const maxY = clampBounds.y + clampBounds.height - labelHeight
      labelX = Math.max(Math.min(labelX, maxX), clampBounds.x)
      labelY = Math.max(Math.min(labelY, maxY), clampBounds.y)
    }

    // 背景（角丸）
    this.drawRoundedRect(labelX, labelY, labelWidth, labelHeight, borderRadius)
    this.ctx.fillStyle = backgroundColor
    this.ctx.fill()

    // 枠線
    this.ctx.strokeStyle = borderColor
    this.ctx.lineWidth = 1
    this.ctx.stroke()

    // テキスト（中央揃え、行ごとに描画）
    this.ctx.fillStyle = textColor
    this.ctx.textAlign = 'center'
    this.ctx.textBaseline = 'middle'
    const cx = labelX + labelWidth / 2
    for (let i = 0; i < lines.length; i++) {
      const lineCy = labelY + padding + i * lineHeight + lineHeight / 2
      this.ctx.fillText(lines[i], cx, lineCy)
    }

    this.ctx.restore()
  }

  drawSpeechBubble(
    text: string,
    x: number,
    y: number,
    options?: {
      maxWidth?: number
      style?: string
      type?: 'speech' | 'thought' | 'narration'
    },
  ): void {
    // Legacy text-bubble drawer (kept for non-dialogue uses). Vertical text path uses pre-rendered images.
    const { maxWidth = 200, style = 'normal', type = 'speech' } = options || {}

    // テキストサイズを測定して吹き出しサイズを決定
    const fontSize = this.config.fontSize || 16
    const lines = this.wrapText(text, maxWidth - 20)
    const lineHeight = fontSize * 1.2
    const width = Math.min(
      maxWidth,
      Math.max(...lines.map((line) => this.ctx.measureText(line).width)) + 20,
    )
    const height = lines.length * lineHeight + 20

    this.ctx.save()

    const bubbleCfg = this.getCanvasCfg().bubble
    this.ctx.strokeStyle = bubbleCfg.strokeStyle
    this.ctx.fillStyle = bubbleCfg.fillStyle
    this.ctx.lineWidth = style === 'shout' ? bubbleCfg.shoutLineWidth : bubbleCfg.normalLineWidth

    this.drawBubbleShape(type, x, y, width, height)

    // テキストを描画
    this.ctx.fillStyle = '#000000'
    this.ctx.font = `${fontSize}px ${this.config.fontFamily || 'Arial, sans-serif'}`
    let textY = y + 15
    for (const line of lines) {
      this.ctx.fillText(line, x + 10, textY)
      textY += lineHeight
    }

    this.ctx.restore()
  }

  renderMangaLayout(layout: MangaLayout): void {
    // 背景をクリア
    this.setupCanvas()

    // 全体のフレームを描画
    this.drawFrame(0, 0, this.config.width, this.config.height)

    // 各ページのパネルを描画（現在は最初のページのみ対応）
    if (layout.pages.length > 0) {
      const firstPage = layout.pages[0]
      for (const panel of firstPage.panels) {
        this.drawPanel(panel)
      }
    }
  }

  async toBlob(type: string = 'image/png', quality?: number): Promise<Blob> {
    if (isServer) {
      // サーバー側の canvas 実装
      const nodeCanvas = this.canvas as NodeCanvas

      // toDataURL を優先的に使用（より安定している）
      try {
        console.log('Using toDataURL method for server-side rendering')
        const dataUrl = nodeCanvas.toDataURL(type, quality)

        if (!dataUrl || dataUrl === 'data:,' || !dataUrl.includes(',')) {
          throw new Error('toDataURL returned empty or invalid data')
        }

        // data URLからBlobに変換
        const base64Data = dataUrl.split(',')[1]
        if (!base64Data) {
          throw new Error('Invalid data URL format - no base64 data found')
        }

        const binaryBuffer = Buffer.from(base64Data, 'base64')
        console.log('Buffer created from dataURL:', binaryBuffer.length, 'bytes')

        // PNG署名を確認
        const pngSignature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
        const hasPngSignature = binaryBuffer.subarray(0, 8).equals(pngSignature)
        console.log('PNG signature valid:', hasPngSignature)

        const binaryAb = binaryBuffer.buffer.slice(
          binaryBuffer.byteOffset,
          binaryBuffer.byteOffset + binaryBuffer.byteLength,
        ) as ArrayBuffer
        const blob = new Blob([binaryAb], { type })
        console.log('Blob created successfully:', blob.size, 'bytes')
        return blob
      } catch (dataUrlError) {
        console.error(
          'toDataURL failed:',
          dataUrlError instanceof Error ? dataUrlError.message : String(dataUrlError),
        )

        // フォールバック: toBuffer を試行
        return new Promise<Blob>((resolve, reject) => {
          try {
            if ('toBuffer' in nodeCanvas && typeof nodeCanvas.toBuffer === 'function') {
              console.log('Falling back to toBuffer method')
              nodeCanvas.toBuffer(
                (err: Error | null, buffer: Buffer) => {
                  if (err) {
                    console.error('toBuffer callback error:', err)
                    reject(err)
                  } else if (!buffer) {
                    console.error('toBuffer returned null/undefined buffer')
                    reject(new Error('Buffer is null or undefined'))
                  } else {
                    console.log('Buffer created via toBuffer callback:', buffer.length, 'bytes')
                    const ab = buffer.buffer.slice(
                      buffer.byteOffset,
                      buffer.byteOffset + buffer.byteLength,
                    ) as ArrayBuffer
                    const blob = new Blob([ab], { type })
                    resolve(blob)
                  }
                },
                type.replace('image/', ''),
                quality ? { quality } : undefined,
              )
            } else {
              reject(new Error('Neither toDataURL nor toBuffer are working'))
            }
          } catch (bufferError) {
            console.error('toBuffer setup failed:', bufferError)
            reject(bufferError)
          }
        })
      }
    } else {
      // ブラウザの場合
      const htmlCanvas = this.canvas as HTMLCanvasElement
      return new Promise<Blob>((resolve, reject) => {
        if ('toBlob' in htmlCanvas && typeof htmlCanvas.toBlob === 'function') {
          htmlCanvas.toBlob(
            (blob: Blob | null) => {
              if (blob) {
                resolve(blob)
              } else {
                reject(new Error('Failed to create blob'))
              }
            },
            type,
            quality,
          )
        } else {
          // toBlob未サポートの場合はtoDataURLから変換
          try {
            const dataUrl = htmlCanvas.toDataURL(type, quality)
            fetch(dataUrl)
              .then((res) => res.blob())
              .then(resolve)
              .catch(reject)
          } catch (err) {
            reject(new Error(`Failed to create blob from dataURL: ${err}`))
          }
        }
      })
    }
  }

  /**
   * Clean up canvas resources to prevent memory leaks
   */
  cleanup(): void {
    try {
      // Clear the canvas
      this.ctx.clearRect(0, 0, this.config.width, this.config.height)

      // Reset canvas state
      this.ctx.restore()
      this.ctx.resetTransform()

      // For Node.js canvas, manually clear if possible
      if (isServer && this.canvas) {
        const nodeCanvas = this.canvas as NodeCanvas
        // Set canvas dimensions to 0 to release memory
        nodeCanvas.width = 0
        nodeCanvas.height = 0
      }
    } catch (error) {
      console.warn('Failed to cleanup canvas resources:', error)
    }
  }
}
