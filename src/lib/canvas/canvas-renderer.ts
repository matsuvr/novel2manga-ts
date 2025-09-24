import path from 'node:path'
// Server-only: we now rely exclusively on @napi-rs/canvas
import { createCanvas, GlobalFonts, loadImage as loadImageFn } from '@napi-rs/canvas'
import { appConfig, getAppConfigWithOverrides } from '@/config/app.config'
import { getLogger } from '@/infrastructure/logging/logger'
import type { AppCanvasConfig } from '@/types/canvas-config'
import type { Dialogue, MangaLayout, Panel } from '@/types/panel-layout'
import type { VerticalTextBounds } from '@/types/vertical-text'
import { wrapJapaneseByBudoux } from '@/utils/jp-linebreak'
import { PanelLayoutCoordinator } from './panel-layout-coordinator'
import { type SfxPlacement, SfxPlacer } from './sfx-placer'

/** パネル全幅に対する水平スロット領域の割合。0.9はパネル幅の90%をスロット領域として確保するための値。 */
const HORIZONTAL_SLOT_COVERAGE = 0.9
/** 複数バブル配置時のカラム間スペース比率（パネル幅に対する割合）。狭すぎると重なり、広すぎると無駄領域。 */
const BUBBLE_COLUMN_GAP_RATIO = 0.01
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
const DEFAULT_CANVAS_RENDERING_CONFIG = appConfig.rendering.canvas
const DEFAULT_SPEAKER_LABEL_CONFIG = DEFAULT_CANVAS_RENDERING_CONFIG.speakerLabel

/** 話者ラベルのフォント倍率（ベースフォントに対する比率）。 */
const SPEAKER_LABEL_FONT_RATIO = DEFAULT_SPEAKER_LABEL_CONFIG.fontSize
/** 話者ラベルの内側パディング（px）。 */
const SPEAKER_LABEL_PADDING = DEFAULT_SPEAKER_LABEL_CONFIG.padding
/** 話者ラベルの角丸半径（px）。 */
const SPEAKER_LABEL_BORDER_RADIUS = DEFAULT_SPEAKER_LABEL_CONFIG.borderRadius

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

// Register fonts synchronously at module load (server-only environment)
(() => {
  try {
    const projectRoot = process.cwd()
    const fontsDir = process.env.CANVAS_FONTS_DIR || path.join(projectRoot, 'fonts')
    const lightFontPath = process.env.CANVAS_FONT_PATH || path.join(fontsDir, 'NotoSansJP-Light.ttf')
    const semiBoldFontPath = process.env.CANVAS_FONT_PATH_SEMIBOLD || path.join(fontsDir, 'NotoSansJP-SemiBold.ttf')
    const registerPair = (fp: string, familyVariants: string[]) => {
      for (const fam of familyVariants) {
        try {
          if (typeof (GlobalFonts as unknown as { registerFromPath?: unknown }).registerFromPath === 'function') {
            ;(GlobalFonts as unknown as { registerFromPath: (p: string, f: string) => void }).registerFromPath(fp, fam)
          } else if (typeof (GlobalFonts as unknown as { register?: unknown }).register === 'function') {
            ;(GlobalFonts as unknown as { register: (p: string, opts?: { family?: string }) => void }).register(fp, { family: fam })
          }
        } catch {
          // ignore individual font registration errors
        }
      }
    }
    registerPair(lightFontPath, ['Noto Sans JP', 'NotoSansJP'])
    registerPair(semiBoldFontPath, ['Noto Sans JP SemiBold', 'NotoSansJP-SemiBold'])
  } catch (e) {
    getLogger()
      .withContext({ service: 'canvas-renderer', phase: 'font_register_sync' })
      .warn('font_registration_failed', { error: e instanceof Error ? e.message : String(e) })
  }
})()

export interface DialogueAsset {
  image: CanvasImageSource
  width: number
  height: number
  contentBounds?: VerticalTextBounds
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
  // ランタイム描画メトリクス
  private metrics: {
    dialogue: {
      count: number
      totalScale: number
      maxScale: number
      minScale: number
      perBubble: Array<{ panelId: number | string; index: number; scale: number; w: number; h: number }>
    }
    panels: {
      count: number
      totalUnusedSlotRatio: number
    }
    sfx: {
      count: number
      placementAttempts: number
    }
    timestamps: { start: number; end?: number }
  }

  // Factory kept async for backward compatibility with call sites
  static async create(config: CanvasConfig): Promise<CanvasRenderer> {
    return new CanvasRenderer(config)
  }

  constructor(config: CanvasConfig) {
    try {
      this.appConfig = getAppConfigWithOverrides()
    } catch (error) {
      getLogger()
        .withContext({ service: 'canvas-renderer', phase: 'config_load' })
        .error('app_config_load_failed', {
          error: error instanceof Error ? error.message : String(error),
        })
      this.appConfig = appConfig
    }
    this.config = {
      backgroundColor: '#ffffff',
      // Prefer bundled Japanese-capable font when available; fall back to Arial
      // Include both 'Noto Sans JP' and 'NotoSansJP' aliases for compatibility
      fontFamily: '"Noto Sans JP", NotoSansJP, GenEiMGothic2, Arial, sans-serif',
      fontSize: 16,
      lineColor: '#000000',
      lineWidth: 2,
      textColor: '#000000',
      font: 'NotoSansJP, GenEiMGothic2, Arial, sans-serif',
      defaultFontSize: 16,
      ...config,
    }

    // Server-only canvas creation
    this.canvas = createCanvas(this.config.width, this.config.height) as NodeCanvas

    const ctx = this.canvas.getContext('2d')
    if (!ctx) {
      throw new Error('Failed to get 2D rendering context')
    }
    this.ctx = ctx

    this.setupCanvas()
    this.sfxPlacer = new SfxPlacer()
    this.layoutCoordinator = new PanelLayoutCoordinator()
    this.metrics = {
      dialogue: { count: 0, totalScale: 0, maxScale: 0, minScale: Number.POSITIVE_INFINITY, perBubble: [] },
      panels: { count: 0, totalUnusedSlotRatio: 0 },
      sfx: { count: 0, placementAttempts: 0 },
      timestamps: { start: Date.now() },
    }
  }

  // Provide robust defaults in case app config is partially mocked in tests
  private getCanvasCfg() {
    const base: Partial<AppCanvasConfig> = (this.appConfig?.rendering?.canvas || {}) as Partial<AppCanvasConfig>
    const fallback = DEFAULT_CANVAS_RENDERING_CONFIG
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
  this.ctx.font = `${this.config.fontSize || 16}px ${this.config.fontFamily || '"Noto Sans JP", NotoSansJP, sans-serif'}`
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

  // --- Safety clamp ------------------------------------------------------
  // 縦書きテキスト画像(drawW/drawH)が算出済みバブルより大きい場合、
  // 少なくとも画像+パディングが収まるサイズに拡張（稀に contentBounds 推定誤差で発生）。
  let finalBubbleW = bubbleW
  let finalBubbleH = bubbleH
  const pad = BUBBLE_PADDING * 0.5 // ここでは最低限の内側余白を確保（既存 padding 設計への影響最小化）
  if (drawW + pad * 2 > finalBubbleW) finalBubbleW = drawW + pad * 2
  if (drawH + pad * 2 > finalBubbleH) finalBubbleH = drawH + pad * 2

  this.drawBubbleShape(shapeType, bx, by, finalBubbleW, finalBubbleH)
    this.ctx.restore()

    // 画像（縦書きセリフ）
  const imgX = bx + (finalBubbleW - drawW) / 2
  const imgY = by + (finalBubbleH - drawH) / 2
    this.ctx.drawImage(asset.image, imgX, imgY, drawW, drawH)

    // 占有領域登録
    this.layoutCoordinator.registerDialogueArea(dialogue, {
      x: bx,
      y: by,
      width: finalBubbleW,
      height: finalBubbleH,
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
      const fontRatio = speakerLabelCfg.fontSize ?? SPEAKER_LABEL_FONT_RATIO
      const fontSize = Math.max(10, baseFontSize * fontRatio)
      const paddingLabel = speakerLabelCfg.padding ?? SPEAKER_LABEL_PADDING
      const bg = speakerLabelCfg.backgroundColor ?? '#ffffff'
      const border = speakerLabelCfg.borderColor ?? '#333333'
      const textColor = speakerLabelCfg.textColor ?? '#333333'
      const offsetXRatio = labelOffsetXRatio ?? speakerLabelCfg.offsetX ?? 0.3
      const offsetYRatio = labelOffsetYRatio ?? speakerLabelCfg.offsetY ?? 0.7
      const borderRadius = speakerLabelCfg.borderRadius ?? SPEAKER_LABEL_BORDER_RADIUS
      this.drawSpeakerLabel(dialogue.speaker, bx + finalBubbleW, by, {
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
    this.metrics.panels.count += 1
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
    const shouldClipPanel = canClip && this.hasRect(this.ctx)
    if (shouldClipPanel) {
      this.ctx.save()
      this.ctx.beginPath()
      this.ctx.rect(x, y, width, height)
      ;(this.ctx as unknown as CanvasRenderingContext2D & { clip: () => void }).clip()
    }

    try {
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
            // --- Improved multi-dialogue layout ---
            // 読み順（縦書き日本語）は右→左。従来コードは2個時のみ反転 / 3個以上は左→右で不正。
            // ここで常に右端から左へカラムを割り当てる。
            const dialogueCount = panel.dialogues.length
            const usableWidth = width * HORIZONTAL_SLOT_COVERAGE
            const gap = width * BUBBLE_COLUMN_GAP_RATIO
            const totalGap = gap * (dialogueCount - 1)
            const slotWidth = (usableWidth - totalGap) / dialogueCount

            const bubbleTop = y + height * BUBBLE_TOP_OFFSET_RATIO
            const maxBubbleAreaHeight = height * MAX_BUBBLE_AREA_HEIGHT_RATIO

            // 右端スロットのX開始位置（margin考慮）
            const rightEdgeStart = x + width - width * PANEL_MARGIN_RATIO - slotWidth

            for (let logicalIndex = 0; logicalIndex < dialogueCount; logicalIndex++) {
              // logicalIndex: 0 が右端
              const dialogue = panel.dialogues[logicalIndex]
              const key = `${panel.id}:${logicalIndex}`
              const asset = this.dialogueAssets?.[key]
              if (!asset) throw new Error(`Dialogue asset missing for ${key}`)

              const slotX = rightEdgeStart - (slotWidth + gap) * logicalIndex

              // スケール計算（幅・高さを別々に制限、等比）
              const effective = this.getEffectiveDialogueDimensions(asset)
              const maxDrawW = Math.max(1, slotWidth - BUBBLE_PADDING * 2)
              const maxDrawH = Math.max(1, maxBubbleAreaHeight - BUBBLE_PADDING * 2)
              const widthBasis = Math.max(1, effective.width)
              const heightBasis = Math.max(1, effective.height)
              const scale = Math.min(maxDrawW / widthBasis, maxDrawH / heightBasis, 1)
              const drawW = Math.max(1, asset.width * scale)
              const drawH = Math.max(1, asset.height * scale)

              // バブルサイズ（余白含む）。コンテンツ境界に基づき必要寸法を確保。
              const bubbleW = Math.max(1, effective.width * scale + BUBBLE_PADDING * 2)
              const bubbleH = Math.max(1, effective.height * scale + BUBBLE_PADDING * 2)

              // 横方向センタリング（slot幅内）
              const bx = slotX + (slotWidth - bubbleW) / 2
              const by = bubbleTop

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
                // ラベルは右側に添わせる（縦書きの視線導線上自然）。
                labelOffsetXRatio: 1,
              })

              // メトリクス更新 (unused slot ratio = (slotWidth - bubbleW)/slotWidth)
              const unusedRatio = slotWidth > 0 ? Math.max(0, (slotWidth - bubbleW) / slotWidth) : 0
              this.metrics.panels.totalUnusedSlotRatio += unusedRatio / dialogueCount // per panel average component
              this.metrics.dialogue.count += 1
              this.metrics.dialogue.totalScale += scale
              this.metrics.dialogue.maxScale = Math.max(this.metrics.dialogue.maxScale, scale)
              this.metrics.dialogue.minScale = Math.min(this.metrics.dialogue.minScale, scale)
              this.metrics.dialogue.perBubble.push({ panelId: panel.id, index: logicalIndex, scale, w: drawW, h: drawH })
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
            const effective = this.getEffectiveDialogueDimensions(asset)
            const widthBasis = Math.max(1, effective.width)
            const heightBasis = Math.max(1, effective.height)

            let scale = Math.min(maxAreaWidth / widthBasis, perBubbleMaxHeight / heightBasis, 1)
            scale = Math.max(0, Math.min(1, scale))
            let drawW = Math.max(1, asset.width * scale)
            let drawH = Math.max(1, asset.height * scale)
            let baseBubbleW = Math.max(1, effective.width * scale + BUBBLE_PADDING * 2)
            let baseBubbleH = Math.max(1, effective.height * scale + BUBBLE_PADDING * 2)
            let bubbleW = baseBubbleW * Math.SQRT2
            let bubbleH = baseBubbleH * Math.SQRT2

            const availableVertical = y + height - bubbleY
            const maxThisBubbleHeight = Math.max(
              MIN_BUBBLE_HEIGHT,
              Math.min(perBubbleMaxHeight, availableVertical - AVAILABLE_VERTICAL_MARGIN),
            )
            if (bubbleH > maxThisBubbleHeight) {
              const targetBaseHeight = maxThisBubbleHeight / Math.SQRT2
              const allowable = (targetBaseHeight - BUBBLE_PADDING * 2) / heightBasis
              const newScale = allowable > 0 ? Math.min(scale, allowable) : 0
              if (newScale < scale) {
                scale = Math.max(0, newScale)
                drawW = Math.max(1, asset.width * scale)
                drawH = Math.max(1, asset.height * scale)
                baseBubbleW = Math.max(1, effective.width * scale + BUBBLE_PADDING * 2)
                baseBubbleH = Math.max(1, effective.height * scale + BUBBLE_PADDING * 2)
                bubbleW = baseBubbleW * Math.SQRT2
                bubbleH = baseBubbleH * Math.SQRT2
              }
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

              // single-bubble: unused horizontal ratio is always 0 (slot == bubble)
              this.metrics.panels.totalUnusedSlotRatio += 0
              const scale = drawW / asset.width
              this.metrics.dialogue.count += 1
              this.metrics.dialogue.totalScale += scale
              this.metrics.dialogue.maxScale = Math.max(this.metrics.dialogue.maxScale, scale)
              this.metrics.dialogue.minScale = Math.min(this.metrics.dialogue.minScale, scale)
              this.metrics.dialogue.perBubble.push({ panelId: panel.id, index: 0, scale, w: drawW, h: drawH })
            }
          }
        } finally {
          this.ctx.restore()
        }
      }

      // SFXを配置・描画し、占有領域を登録
      if (panel.sfx && panel.sfx.length > 0) {
        this.metrics.sfx.count += panel.sfx.length
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
          // placementAttempts を概算 (各 SFX 固定 1 + 予備探索は placer 側で後日 exposing 予定、現状は count と同じ)
          this.metrics.sfx.placementAttempts += sfxPlacements.length
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
          const contentFontFamily =
            this.config.fontFamily || '"Noto Sans JP", NotoSansJP, sans-serif'
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
              fontFamily: contentFontFamily,
            },
          )
          if (placement) {
            const panelX = panelBounds.x
            const panelY = panelBounds.y
            const panelRight = panelBounds.x + panelBounds.width
            const panelBottom = panelBounds.y + panelBounds.height

            const bounding = placement.boundingBox ?? {
              x: placement.x - contentCfg.padding,
              y: placement.y - contentCfg.padding,
              width: placement.width + contentCfg.padding * 2,
              height: placement.height + contentCfg.padding * 2,
            }

            const clampedBounding = {
              x: Math.max(panelX, bounding.x),
              y: Math.max(panelY, bounding.y),
              width: 0,
              height: 0,
            }
            clampedBounding.width = Math.max(
              0,
              Math.min(panelRight, bounding.x + bounding.width) - clampedBounding.x,
            )
            clampedBounding.height = Math.max(
              0,
              Math.min(panelBottom, bounding.y + bounding.height) - clampedBounding.y,
            )

            const hasContentArea = clampedBounding.width > 0 && clampedBounding.height > 0

            this.ctx.save()
            this.ctx.font = `${placement.fontSize}px ${contentFontFamily}`
            this.ctx.fillStyle = contentCfg.textColor
            this.ctx.textAlign = 'left'
            this.ctx.textBaseline = 'top'

            if (hasContentArea && this.hasRect(this.ctx)) {
              this.ctx.save()
              this.ctx.beginPath()
              this.ctx.rect(
                clampedBounding.x,
                clampedBounding.y,
                clampedBounding.width,
                clampedBounding.height,
              )
              this.ctx.clip()

              let cy = Math.max(clampedBounding.y, placement.y)
              const textStartX = Math.max(clampedBounding.x, placement.x)
              const maxCy = clampedBounding.y + clampedBounding.height - placement.fontSize
              for (const line of placement.lines) {
                if (cy > maxCy) break
                this.ctx.fillText(line, textStartX, cy)
                cy += placement.fontSize * contentCfg.lineHeight
              }

              this.ctx.restore()
            } else {
              let cy = Math.max(panelY, placement.y)
              const textStartX = Math.max(panelX, placement.x)
              const maxCy = panelBottom - placement.fontSize
              for (const line of placement.lines) {
                if (cy > maxCy) break
                this.ctx.fillText(line, textStartX, cy)
                cy += placement.fontSize * contentCfg.lineHeight
              }
            }

            this.ctx.restore()

            if (hasContentArea) {
              this.layoutCoordinator.registerContentArea(clampedBounding)
            }
          }
        }
      }
    } finally {
      if (shouldClipPanel) {
        this.ctx.restore()
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
  font = `${this.config.fontSize || 16}px ${this.config.fontFamily || '"Noto Sans JP", NotoSansJP, sans-serif'}`,
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
  // Use dedicated SemiBold family registered as 'Noto Sans JP SemiBold' for SFX main text
  const weightMain = cfg.mainTextStyle?.fontWeight === 'bold' ? 'bold' : 'normal'
  const sfxFamily = 'Noto Sans JP SemiBold'
  this.ctx.font = `${weightMain} ${placement.fontSize}px ${sfxFamily}, ${this.config.fontFamily || 'Noto Sans JP'}, sans-serif`
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
  this.ctx.font = `${weightSup} ${supSize}px ${sfxFamily}, ${this.config.fontFamily || 'Noto Sans JP'}, sans-serif`
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
   * コンテンツ境界を考慮した実効的なアセット幅・高さを算出
   */
  private getEffectiveDialogueDimensions(asset: DialogueAsset): { width: number; height: number } {
    const baseWidth = Math.max(1, asset.width)
    const baseHeight = Math.max(1, asset.height)
    const bounds = asset.contentBounds
    if (!bounds) {
      return { width: baseWidth, height: baseHeight }
    }

    const overflowLeft = Math.max(0, -bounds.x)
    const overflowRight = Math.max(0, bounds.x + bounds.width - asset.width)
    const overflowTop = Math.max(0, -bounds.y)
    const overflowBottom = Math.max(0, bounds.y + bounds.height - asset.height)

    const effectiveWidth = Math.max(baseWidth, bounds.width + overflowLeft + overflowRight)
    const effectiveHeight = Math.max(baseHeight, bounds.height + overflowTop + overflowBottom)

    return {
      width: Math.max(1, effectiveWidth),
      height: Math.max(1, effectiveHeight),
    }
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
            ;(
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
  const family = this.config.fontFamily || '"Noto Sans JP", NotoSansJP, sans-serif'
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
  this.ctx.font = `${fontSize}px ${this.config.fontFamily || '"Noto Sans JP", NotoSansJP, sans-serif'}`
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
    // Server-only implementation
    const nodeCanvas = this.canvas as NodeCanvas
    try {
  getLogger().withContext({ service: 'canvas-renderer' }).debug('server_to_data_url_attempt')
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
        getLogger()
          .withContext({ service: 'canvas-renderer' })
          .debug('buffer_created_from_data_url', { bytes: binaryBuffer.length })

        // PNG署名を確認
        const pngSignature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
        const hasPngSignature = binaryBuffer.subarray(0, 8).equals(pngSignature)
        getLogger()
          .withContext({ service: 'canvas-renderer' })
          .debug('png_signature_valid', { valid: hasPngSignature })

        const binaryAb = binaryBuffer.buffer.slice(
          binaryBuffer.byteOffset,
          binaryBuffer.byteOffset + binaryBuffer.byteLength,
        ) as ArrayBuffer
        const blob = new Blob([binaryAb], { type })
        getLogger()
          .withContext({ service: 'canvas-renderer' })
          .debug('blob_created_successfully', { bytes: blob.size })
        return blob
    } catch (dataUrlError) {
        getLogger()
          .withContext({ service: 'canvas-renderer' })
          .error('to_data_url_failed', {
            error:
              dataUrlError instanceof Error ? dataUrlError.message : String(dataUrlError),
          })

        // フォールバック: toBuffer を試行
      return new Promise<Blob>((resolve, reject) => {
          try {
            if ('toBuffer' in nodeCanvas && typeof nodeCanvas.toBuffer === 'function') {
              getLogger()
                .withContext({ service: 'canvas-renderer' })
                .debug('fallback_to_buffer_method')
              nodeCanvas.toBuffer(
                (err: Error | null, buffer: Buffer) => {
                  if (err) {
                    getLogger()
                      .withContext({ service: 'canvas-renderer' })
                      .error('to_buffer_callback_error', {
                        error: err instanceof Error ? err.message : String(err),
                      })
                    reject(err)
                  } else if (!buffer) {
                    getLogger()
                      .withContext({ service: 'canvas-renderer' })
                      .error('to_buffer_returned_empty')
                    reject(new Error('Buffer is null or undefined'))
                  } else {
                    getLogger()
                      .withContext({ service: 'canvas-renderer' })
                      .debug('buffer_created_via_callback', { bytes: buffer.length })
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
            getLogger()
              .withContext({ service: 'canvas-renderer' })
              .error('to_buffer_setup_failed', {
                error: bufferError instanceof Error ? bufferError.message : String(bufferError),
              })
            reject(bufferError)
          }
      })
    }
  }

  /**
   * Clean up canvas resources to prevent memory leaks
   */
  cleanup(): void {
    try {
      this.ctx.clearRect(0, 0, this.config.width, this.config.height)
      const nodeCanvas = this.canvas as NodeCanvas
      nodeCanvas.width = 0
      nodeCanvas.height = 0
    } catch (error) {
      getLogger()
        .withContext({ service: 'canvas-renderer' })
        .warn('canvas_cleanup_failed', {
          error: error instanceof Error ? error.message : String(error),
        })
    }
  }
}
