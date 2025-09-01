import type { MangaLayout, Panel } from '@/types/panel-layout'

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
  private dialogueAssets?: Record<string, { image: unknown; width: number; height: number }>

  // Async factory method for proper initialization
  static async create(config: CanvasConfig): Promise<CanvasRenderer> {
    await initializeCanvas()
    return new CanvasRenderer(config)
  }

  constructor(config: CanvasConfig) {
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
    // パネルの位置とサイズを実際のピクセル値に変換
    const x = panel.position.x * this.config.width
    const y = panel.position.y * this.config.height
    const width = panel.size.width * this.config.width
    const height = panel.size.height * this.config.height

    // パネルのフレームを描画
    this.drawFrame(x, y, width, height)

    // パネル内のコンテンツを描画
    if (panel.content) {
      // 状況説明テキストを描画
      this.drawText(panel.content, x + 10, y + 20, {
        maxWidth: width - 20,
        font: `${this.config.defaultFontSize}px ${this.config.font}`,
        color: this.config.textColor,
      })
    }

    // パネル内の対話を吹き出しとして描画（縦書き画像が提供されている場合は画像を使用）
    if (panel.dialogues && panel.dialogues.length > 0) {
      // クリッピング: 吹き出しをパネル枠の内側に限定
      this.ctx.save()
      this.ctx.beginPath()
      this.ctx.rect(x, y, width, height)
      this.ctx.clip()
      try {
        let bubbleY = y + height * 0.2 // 吹き出しの開始Y位置（やや上）
        const maxAreaWidth = width * 0.45
        const maxAreaHeightTotal = height * 0.7
        const perBubbleMaxHeight = Math.max(60, maxAreaHeightTotal / panel.dialogues.length)

        for (let i = 0; i < panel.dialogues.length; i++) {
          const dialogue = panel.dialogues[i]
          const key = `${panel.id}:${i}`
          const asset = this.dialogueAssets?.[key]
          if (!asset) {
            throw new Error(`Vertical dialogue asset missing for ${key}`)
          }
          // ベースのスケール
          let scale = Math.min(maxAreaWidth / asset.width, perBubbleMaxHeight / asset.height, 1)
          let drawW = asset.width * scale
          let drawH = asset.height * scale
          const padding = 10
          // テキストの長方形（パディング含む）を外接する楕円のサイズを計算
          // √2 アルゴリズム: 長方形を外接する楕円は長方形の各辺を √2 で割った半径を持つ
          const textRectW = drawW + padding * 2
          const textRectH = drawH + padding * 2
          let bubbleW = textRectW * Math.sqrt(2)
          let bubbleH = textRectH * Math.sqrt(2)

          // パネル下端に収まるよう自動縮小
          const availableVertical = y + height - bubbleY
          const maxThisBubbleHeight = Math.max(
            30,
            Math.min(perBubbleMaxHeight, availableVertical - 2),
          )
          if (bubbleH > maxThisBubbleHeight) {
            // 楕円が収まるよう縮小
            const shrinkFactor = maxThisBubbleHeight / bubbleH
            scale = Math.min(scale, scale * shrinkFactor)
            drawW = asset.width * scale
            drawH = asset.height * scale
            const textRectW = drawW + padding * 2
            const textRectH = drawH + padding * 2
            bubbleW = textRectW * Math.sqrt(2)
            bubbleH = textRectH * Math.sqrt(2)
          }

          // これでもはみ出す場合は描画を中止
          if (bubbleH <= 0 || bubbleY + bubbleH > y + height) {
            break
          }

          const bx = x + width - bubbleW - width * 0.05 // 右寄せ
          const by = bubbleY

          // 吹き出し背景
          this.ctx.save()
          this.ctx.strokeStyle = '#000000'
          this.ctx.fillStyle = '#ffffff'
          this.ctx.lineWidth = dialogue.emotion === 'shout' ? 3 : 2
          // 形状切替: speech=楕円、thought=雲状、narration=長方形
          const shapeType =
            (dialogue as { type?: 'speech' | 'thought' | 'narration' }).type || 'speech'
          this.drawBubbleShape(shapeType, bx, by, bubbleW, bubbleH)
          this.ctx.restore()

          // 画像貼り付け（中央揃え）
          const imgX = bx + (bubbleW - drawW) / 2
          const imgY = by + (bubbleH - drawH) / 2
          // node-canvas: ctx.drawImage(Image, dx, dy, dWidth, dHeight)
          // browser: HTMLImageElement でも同じ
          this.ctx.drawImage(asset.image as unknown as CanvasImageSource, imgX, imgY, drawW, drawH)

          bubbleY += bubbleH + 10 // 次の吹き出し位置
        }
      } finally {
        // クリッピング解除
        this.ctx.restore()
      }
    }

    // パネル内のSFXテキストを描画（大きめのフォントで背景なし）
    if (panel.sfx && panel.sfx.length > 0) {
      // クリッピング: SFXテキストもパネル枠の内側に限定
      this.ctx.save()
      this.ctx.beginPath()
      this.ctx.rect(x, y, width, height)
      this.ctx.clip()

      try {
        const sfxFontSize = Math.max(24, (this.config.fontSize || 16) * 1.8) // 大きめのフォント
        let sfxY = y + 30 // SFXの開始位置（上部）

        for (let i = 0; i < panel.sfx.length; i++) {
          const rawSfx = panel.sfx[i]

          // 〈〉を削除し、()内の補足テキストを分離
          const cleanedSfx = this.processSfxText(rawSfx)

          // メインSFXテキスト（大きいフォント）
          if (cleanedSfx.main) {
            this.ctx.save()
            this.ctx.font = `bold ${sfxFontSize}px ${this.config.fontFamily || 'Arial, sans-serif'}`
            this.ctx.fillStyle = '#000000'
            this.ctx.strokeStyle = '#ffffff'
            this.ctx.lineWidth = 3
            this.ctx.textAlign = 'center'
            this.ctx.textBaseline = 'top'

            const sfxX = x + width * 0.3 // 左寄り（吹き出しを避ける）

            // 白い縁取り（アウトライン効果）
            this.ctx.strokeText(cleanedSfx.main, sfxX, sfxY)
            // テキスト本体
            this.ctx.fillText(cleanedSfx.main, sfxX, sfxY)

            this.ctx.restore()

            const mainTextHeight = sfxFontSize * 1.2
            sfxY += mainTextHeight

            // 補足テキスト（小さいフォント）
            if (cleanedSfx.supplement) {
              this.ctx.save()
              const supplementFontSize = Math.max(12, sfxFontSize * 0.6)
              this.ctx.font = `${supplementFontSize}px ${this.config.fontFamily || 'Arial, sans-serif'}`
              this.ctx.fillStyle = '#333333'
              this.ctx.textAlign = 'center'
              this.ctx.textBaseline = 'top'

              this.ctx.fillText(cleanedSfx.supplement, sfxX, sfxY)

              this.ctx.restore()
              sfxY += supplementFontSize * 1.2 + 5
            } else {
              sfxY += 10 // 次のSFXとの間隔
            }
          }

          // パネル下端に近づいたら描画を中止
          if (sfxY > y + height - 30) {
            break
          }
        }
      } finally {
        // クリッピング解除
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
   * SFXテキストを処理：〈〉を削除し、()内の補足テキストを分離
   * @param rawSfx 生のSFXテキスト（例：「〈ドーン！〉」「〈バタン（ドアが閉まる音）〉」）
   * @returns メインテキストと補足テキストを分離したオブジェクト
   */
  private processSfxText(rawSfx: string): { main: string; supplement?: string } {
    // 〈〉を削除
    const cleanedText = rawSfx.replace(/[〈〉⟨⟩]/g, '')

    // ()内の補足テキストを検出して分離
    const supplementMatch = cleanedText.match(/^(.*?)（(.+?)）$/)
    if (supplementMatch) {
      return {
        main: supplementMatch[1].trim(),
        supplement: supplementMatch[2].trim(),
      }
    }

    // 半角括弧でも試す
    const supplementMatchHalf = cleanedText.match(/^(.*?)\((.+?)\)$/)
    if (supplementMatchHalf) {
      return {
        main: supplementMatchHalf[1].trim(),
        supplement: supplementMatchHalf[2].trim(),
      }
    }

    // 補足テキストがない場合
    return {
      main: cleanedText.trim(),
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

    this.ctx.strokeStyle = '#000000'
    this.ctx.fillStyle = '#ffffff'
    this.ctx.lineWidth = style === 'shout' ? 3 : 2

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
