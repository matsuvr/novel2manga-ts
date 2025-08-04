import type { MangaLayout, Panel } from '@/types/panel-layout'

export interface CanvasRenderConfig {
  width: number
  height: number
  backgroundColor?: string
  fontFamily?: string
  fontSize?: number
  lineColor?: string
  lineWidth?: number
}

export interface TextRenderOptions {
  x: number
  y: number
  maxWidth?: number
  maxHeight?: number
  fontSize?: number
  fontFamily?: string
  color?: string
  align?: 'left' | 'center' | 'right'
  verticalAlign?: 'top' | 'middle' | 'bottom'
}

export interface SpeechBubbleOptions {
  x: number
  y: number
  width: number
  height: number
  tailX?: number
  tailY?: number
  borderColor?: string
  backgroundColor?: string
  borderWidth?: number
  borderRadius?: number
}

export class CanvasRenderer {
  private canvas: HTMLCanvasElement
  private ctx: CanvasRenderingContext2D
  private config: CanvasRenderConfig

  constructor(canvas: HTMLCanvasElement, config: CanvasRenderConfig) {
    this.canvas = canvas
    this.config = config

    const ctx = canvas.getContext('2d')
    if (!ctx) {
      throw new Error('Failed to get 2D rendering context')
    }
    this.ctx = ctx

    this.initializeCanvas()
  }

  private initializeCanvas(): void {
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

  drawFrame(x: number, y: number, width: number, height: number): void {
    this.ctx.strokeRect(x, y, width, height)
  }

  drawPanel(panel: Panel): void {
    this.drawFrame(panel.x, panel.y, panel.width, panel.height)
  }

  drawText(text: string, options: TextRenderOptions): void {
    const {
      x,
      y,
      maxWidth,
      maxHeight,
      fontSize = this.config.fontSize || 16,
      fontFamily = this.config.fontFamily || 'Arial, sans-serif',
      color = '#000000',
      align = 'left',
      verticalAlign = 'top',
    } = options

    this.ctx.save()

    this.ctx.font = `${fontSize}px ${fontFamily}`
    this.ctx.fillStyle = color
    this.ctx.textAlign = align
    this.ctx.textBaseline = verticalAlign

    if (maxWidth && maxHeight) {
      this.drawMultilineText(text, x, y, maxWidth, maxHeight, fontSize)
    } else {
      this.ctx.fillText(text, x, y, maxWidth)
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
          lines[lines.length - 1].substring(0, lines[lines.length - 1].length - 3) + '...'
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

  drawSpeechBubble(options: SpeechBubbleOptions): void {
    const {
      x,
      y,
      width,
      height,
      tailX,
      tailY,
      borderColor = '#000000',
      backgroundColor = '#ffffff',
      borderWidth = 2,
      borderRadius = 8,
    } = options

    this.ctx.save()

    this.ctx.strokeStyle = borderColor
    this.ctx.fillStyle = backgroundColor
    this.ctx.lineWidth = borderWidth

    // 角丸矩形を描画
    this.drawRoundedRect(x, y, width, height, borderRadius)

    // しっぽがある場合は描画
    if (tailX !== undefined && tailY !== undefined) {
      this.drawBubbleTail(x, y, width, height, tailX, tailY)
    }

    this.ctx.restore()
  }

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

    this.ctx.fill()
    this.ctx.stroke()
  }

  private drawBubbleTail(
    bubbleX: number,
    bubbleY: number,
    bubbleWidth: number,
    bubbleHeight: number,
    tailX: number,
    tailY: number,
  ): void {
    // バブルの中心から一番近い辺上の点を計算
    const centerX = bubbleX + bubbleWidth / 2
    const centerY = bubbleY + bubbleHeight / 2

    let attachX: number, attachY: number

    // しっぽの接続点を決定
    if (tailX < bubbleX) {
      // 左側
      attachX = bubbleX
      attachY = Math.max(bubbleY, Math.min(bubbleY + bubbleHeight, tailY))
    } else if (tailX > bubbleX + bubbleWidth) {
      // 右側
      attachX = bubbleX + bubbleWidth
      attachY = Math.max(bubbleY, Math.min(bubbleY + bubbleHeight, tailY))
    } else if (tailY < bubbleY) {
      // 上側
      attachX = Math.max(bubbleX, Math.min(bubbleX + bubbleWidth, tailX))
      attachY = bubbleY
    } else {
      // 下側
      attachX = Math.max(bubbleX, Math.min(bubbleX + bubbleWidth, tailX))
      attachY = bubbleY + bubbleHeight
    }

    // しっぽを描画
    this.ctx.beginPath()
    this.ctx.moveTo(attachX, attachY)
    this.ctx.lineTo(tailX, tailY)
    this.ctx.lineTo(attachX + (centerX - attachX) * 0.3, attachY + (centerY - attachY) * 0.3)
    this.ctx.closePath()
    this.ctx.fill()
    this.ctx.stroke()
  }

  renderMangaLayout(layout: MangaLayout): void {
    // 背景をクリア
    this.initializeCanvas()

    // 全体のフレームを描画
    this.drawFrame(0, 0, this.config.width, this.config.height)

    // 各パネルを描画
    for (const panel of layout.panels) {
      this.drawPanel(panel)
    }
  }

  clear(): void {
    this.ctx.clearRect(0, 0, this.config.width, this.config.height)
    this.initializeCanvas()
  }

  getImageData(): ImageData {
    return this.ctx.getImageData(0, 0, this.config.width, this.config.height)
  }

  toDataURL(type?: string, quality?: number): string {
    return this.canvas.toDataURL(type, quality)
  }

  toBlob(callback: BlobCallback, type?: string, quality?: number): void {
    this.canvas.toBlob(callback, type, quality)
  }
}
