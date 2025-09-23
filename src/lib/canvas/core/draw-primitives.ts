// @napi-rs/canvas does not export the DOM CanvasRenderingContext2D type. We rely on the
// lib DOM type being available via TS lib settings. For isolation (and to avoid pulling in
// full DOM in some test builds) define a structural subset we actually use.
export interface Basic2DContext {
  strokeRect(x: number, y: number, w: number, h: number): void
  fillStyle: string | CanvasGradient | CanvasPattern
  fillRect(x: number, y: number, w: number, h: number): void
  beginPath(): void
  rect(x: number, y: number, w: number, h: number): void
  ellipse?(x: number, y: number, rx: number, ry: number, rotation: number, start: number, end: number): void
  fill(): void
  stroke(): void
}

export function drawPanelFrame(ctx: Basic2DContext, x: number, y: number, w: number, h: number) {
  ctx.strokeRect(x, y, w, h)
}

export function fillBackgroundWhite(ctx: Basic2DContext, w: number, h: number) {
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, w, h)
}

export interface BubbleShapeInput { x: number; y: number; width: number; height: number; type: 'speech' | 'thought' | 'narration' }

// Minimal bubble shape (ellipse/rect) – detailed cloud logic stays in legacy renderer until migrated
export function drawBasicBubble(ctx: Basic2DContext, input: BubbleShapeInput) {
  const { x, y, width, height, type } = input
  ctx.beginPath()
  if (type === 'narration') {
    ctx.rect(x, y, width, height)
  } else {
    const hasEllipse = typeof (ctx as unknown as { ellipse?: unknown }).ellipse === 'function'
    if (hasEllipse) {
      ;(ctx as unknown as CanvasRenderingContext2D & { ellipse: typeof CanvasRenderingContext2D.prototype.ellipse }).ellipse(
        x + width / 2,
        y + height / 2,
        width / 2,
        height / 2,
        0,
        0,
        Math.PI * 2,
      )
    } else {
      ctx.rect(x, y, width, height)
    }
  }
  ctx.fill()
  ctx.stroke()
}
