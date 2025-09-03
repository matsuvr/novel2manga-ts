import { getAppConfigWithOverrides } from '@/config/app.config'
import type { MangaLayout, Panel } from '@/types/panel-layout'
import { SfxPlacer, type SfxPlacement } from './sfx-placer'
import type { AppCanvasConfig } from '@/types/canvas-config'
import { PanelLayoutCoordinator } from './panel-layout-coordinator'

// Canvas実装の互換性のため、ブラウザとNode.js両方で動作するようにする
const isServer = typeof window === 'undefined'
let createCanvas: ((width: number, height: number) => unknown) | undefined
type NodeCanvasImageLike = {
  src: Buffer | string
  width: number
  height: number
}
let NodeCanvasImageCtor: (new () => NodeCanvasImageLike) | undefined

// node-canvas用の型定義
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
      // サーバーサイドではnode-canvasを使用
      try {
        const canvasModule = await import('canvas')
        createCanvas = canvasModule.createCanvas
        NodeCanvasImageCtor = canvasModule.Image
        canvasInitialized = true
      } catch (error) {
        console.warn('node-canvas not available, Canvas functionality will be limited', error)
      }
    } else {
      canvasInitialized = true
    }
  })()

  return canvasInitPromise
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
  private dialogueAssets?: Record<string, { image: unknown; width: number; height: number }>
  private sfxPlacer: SfxPlacer
  private layoutCoordinator: PanelLayoutCoordinator

  // Async factory method for proper initialization
  static async create(config: CanvasConfig): Promise<CanvasRenderer> {
    await initializeCanvas()
    return new CanvasRenderer(config)
  }

  constructor(config: CanvasConfig) {
    this.appConfig = getAppConfigWithOverrides()
    this.config = {
      backgroundColor: '#ffffff',
      fontFamily: 'Arial, sans-serif',
      fontSize: 16,
      lineColor: '#000000',
      lineWidth: 2,
      textColor: '#000000',
      font: 'Arial, sans-serif',
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
  setDialogueAssets(
    assets: Record<string, { image: unknown; width: number; height: number }>,
  ): void {
    this.dialogueAssets = assets
  }

  /** Create an Image from a PNG buffer (server only). */
  static createImageFromBuffer(buffer: Buffer): {
    image: unknown
    width: number
    height: number
  } {
    if (!isServer || !NodeCanvasImageCtor) {
      throw new Error('createImageFromBuffer is only available on server with node-canvas')
    }
    const img = new NodeCanvasImageCtor()
    // node-canvas Image type is not in DOM libs; assign via shim cast.
    img.src = buffer
    return {
      image: img as unknown,
      width: (img as NodeCanvasImageLike).width,
      height: (img as NodeCanvasImageLike).height,
    }
  }

  drawFrame(x: number, y: number, width: number, height: number): void {
    this.ctx.strokeRect(x, y, width, height)
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

    // 吹き出しを描画し、占有領域を登録
    if (panel.dialogues && panel.dialogues.length > 0) {
      this.ctx.save()
      this.ctx.beginPath()
      this.ctx.rect(x, y, width, height)
      this.ctx.clip()
      try {
        let bubbleY = y + height * 0.2
        const maxAreaWidth = width * 0.45
        const maxAreaHeightTotal = height * 0.7
        const perBubbleMaxHeight = Math.max(60, maxAreaHeightTotal / panel.dialogues.length)

        for (let i = 0; i < panel.dialogues.length; i++) {
          const dialogue = panel.dialogues[i]
          const key = `${panel.id}:${i}`
          const asset = this.dialogueAssets?.[key]
          if (!asset) throw new Error(`Vertical dialogue asset missing for ${key}`)

          let scale = Math.min(maxAreaWidth / asset.width, perBubbleMaxHeight / asset.height, 1)
          let drawW = asset.width * scale
          let drawH = asset.height * scale
          const padding = 10
          const textRectW = drawW + padding * 2
          const textRectH = drawH + padding * 2
          let bubbleW = textRectW * Math.sqrt(2)
          let bubbleH = textRectH * Math.sqrt(2)

          const availableVertical = y + height - bubbleY
          const maxThisBubbleHeight = Math.max(
            30,
            Math.min(perBubbleMaxHeight, availableVertical - 2),
          )
          if (bubbleH > maxThisBubbleHeight) {
            const shrinkFactor = maxThisBubbleHeight / bubbleH
            scale = Math.min(scale, scale * shrinkFactor)
            drawW = asset.width * scale
            drawH = asset.height * scale
            const textRectW2 = drawW + padding * 2
            const textRectH2 = drawH + padding * 2
            bubbleW = textRectW2 * Math.sqrt(2)
            bubbleH = textRectH2 * Math.sqrt(2)
          }
          if (bubbleH <= 0 || bubbleY + bubbleH > y + height) break

          const bx = x + width - bubbleW - width * 0.05
          const by = bubbleY

          // 吹き出し背景
          this.ctx.save()
          this.ctx.strokeStyle = this.appConfig.rendering.canvas.bubble.strokeStyle
          this.ctx.fillStyle = this.appConfig.rendering.canvas.bubble.fillStyle
          this.ctx.lineWidth =
            dialogue.emotion === 'shout'
              ? this.appConfig.rendering.canvas.bubble.shoutLineWidth
              : this.appConfig.rendering.canvas.bubble.normalLineWidth
          const shapeType =
            (dialogue as { type?: 'speech' | 'thought' | 'narration' }).type || 'speech'
          this.drawBubbleShape(shapeType, bx, by, bubbleW, bubbleH)
          this.ctx.restore()

          // 画像（縦書きセリフ）
          const imgX = bx + (bubbleW - drawW) / 2
          const imgY = by + (bubbleH - drawH) / 2
          this.ctx.drawImage(asset.image as unknown as CanvasImageSource, imgX, imgY, drawW, drawH)

          // 占有領域登録
          this.layoutCoordinator.registerDialogueArea(dialogue, {
            x: bx,
            y: by,
            width: bubbleW,
            height: bubbleH,
          })

          // 話者ラベル
          const speakerLabelCfg = this.appConfig.rendering.canvas.speakerLabel
          if (
            speakerLabelCfg?.enabled &&
            typeof dialogue.speaker === 'string' &&
            dialogue.speaker.trim() !== ''
          ) {
            const baseFontSize = this.config.fontSize || 16
            const fontSize = Math.max(10, baseFontSize * (speakerLabelCfg.fontSize || 0.7))
            const paddingLabel = speakerLabelCfg.padding ?? 4
            const bg = speakerLabelCfg.backgroundColor ?? '#ffffff'
            const border = speakerLabelCfg.borderColor ?? '#333333'
            const textColor = speakerLabelCfg.textColor ?? '#333333'
            const offsetXRatio = speakerLabelCfg.offsetX ?? 0.3
            const offsetYRatio = speakerLabelCfg.offsetY ?? 0.7
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
            })
          }

          bubbleY += bubbleH + 10
        }
      } finally {
        this.ctx.restore()
      }
    }

    // SFXを配置・描画し、占有領域を登録
    if (panel.sfx && panel.sfx.length > 0) {
      this.ctx.save()
      this.ctx.beginPath()
      this.ctx.rect(x, y, width, height)
      this.ctx.clip()
      try {
        const sfxPlacements = this.sfxPlacer.placeSfx(panel.sfx, panel, panelBounds)
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
      const contentCfg = (this.appConfig.rendering.canvas as AppCanvasConfig).contentText

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
    const cfg = this.appConfig.rendering.canvas.sfx
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
    if (type === 'narration') {
      this.ctx.beginPath()
      this.ctx.rect(x, y, width, height)
      this.ctx.fill()
      this.ctx.stroke()
    } else if (type === 'thought') {
      const bumps = 8
      const r = Math.max(6, Math.min(width, height) * 0.08)
      const cx = x + width / 2
      const cy = y + height / 2
      const rx = width / 2
      const ry = height / 2
      this.ctx.beginPath()
      let anglePrev = 0
      const pxStart = cx + Math.cos(anglePrev) * rx
      const pyStart = cy + Math.sin(anglePrev) * ry
      this.ctx.moveTo(pxStart, pyStart)
      for (let k = 1; k <= bumps; k++) {
        const angle = (k / bumps) * Math.PI * 2
        const px = cx + Math.cos(angle) * rx
        const py = cy + Math.sin(angle) * ry
        const midAngle = (anglePrev + angle) / 2
        const cx1 = cx + Math.cos(midAngle) * (rx + r)
        const cy1 = cy + Math.sin(midAngle) * (ry + r)
        this.ctx.quadraticCurveTo(cx1, cy1, px, py)
        anglePrev = angle
      }
      this.ctx.closePath()
      this.ctx.fill()
      this.ctx.stroke()
    } else {
      // 楕円の描画: テキスト領域を外接する楕円
      this.ctx.beginPath()
      this.ctx.ellipse(x + width / 2, y + height / 2, width / 2, height / 2, 0, 0, Math.PI * 2)
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
    } = options

    if (!speaker || speaker.trim() === '') return

    this.ctx.save()
    this.ctx.font = `${fontSize}px ${this.config.fontFamily || 'Arial, sans-serif'}`

    // テキストサイズ計測
    const metrics = this.ctx.measureText(speaker)
    const labelWidth = metrics.width + padding * 2
    const labelHeight = fontSize + padding * 2

    // 位置: 吹き出し右上の少し外側
    const labelX = xRightEdge - labelWidth * offsetXRatio
    const labelY = yTopEdge - labelHeight * offsetYRatio

    // 背景（角丸）
    this.drawRoundedRect(labelX, labelY, labelWidth, labelHeight, borderRadius)
    this.ctx.fillStyle = backgroundColor
    this.ctx.fill()

    // 枠線
    this.ctx.strokeStyle = borderColor
    this.ctx.lineWidth = 1
    this.ctx.stroke()

    // テキスト
    this.ctx.fillStyle = textColor
    this.ctx.textAlign = 'center'
    this.ctx.textBaseline = 'middle'
    this.ctx.fillText(speaker, labelX + labelWidth / 2, labelY + labelHeight / 2)

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

    this.ctx.strokeStyle = this.appConfig.rendering.canvas.bubble.strokeStyle
    this.ctx.fillStyle = this.appConfig.rendering.canvas.bubble.fillStyle
    this.ctx.lineWidth =
      style === 'shout'
        ? this.appConfig.rendering.canvas.bubble.shoutLineWidth
        : this.appConfig.rendering.canvas.bubble.normalLineWidth

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
      // node-canvas の場合
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
