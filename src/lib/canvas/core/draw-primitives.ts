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
    if (ctx.ellipse) {
      ctx.ellipse(
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

interface ThoughtBubbleConfig {
  bumps: number
  amplitudeRatio: number
  randomness: number
  minRadiusPx: number
  prng: { seedScale: number; sinScale: number; multiplier: number }
  tail?: { enabled: boolean; count: number; startRadiusRatio: number; decay: number; gapRatio: number; angle: number }
}

/** 雲形の思考バブルを描画 (config は appConfig.rendering.canvas.bubble.thoughtShape を想定) */
export function drawThoughtBubble(
  ctx: Basic2DContext & { quadraticCurveTo?: (...a: number[]) => void; moveTo?: (...a: number[]) => void; lineTo?: (...a: number[]) => void },
  x: number,
  y: number,
  w: number,
  h: number,
  cfg: ThoughtBubbleConfig,
) {
  const cx = x + w / 2
  const cy = y + h / 2
  const baseR = Math.min(w, h) / 2
  const bumps = Math.max(6, cfg.bumps)
  const amp = Math.max(0, cfg.amplitudeRatio)
  const randAmt = Math.max(0, cfg.randomness)
  const prng = (i: number) => {
    const v = Math.sin((i + 1) * cfg.prng.sinScale * 12.9898 + cfg.prng.seedScale) * cfg.prng.multiplier
    return (v - Math.floor(v)) * 2 - 1 // [-1,1]
  }
  ctx.beginPath()
  for (let i = 0; i <= bumps; i++) {
    const t = i / bumps
    const theta = t * Math.PI * 2
    const noise = prng(i) * randAmt
    const r = baseR * (1 + amp * noise)
    const px = cx + Math.cos(theta) * r
    const py = cy + Math.sin(theta) * r
    if (i === 0) {
      ctx.moveTo?.(px, py)
    } else {
      // 曲線 (quadratic) で滑らかに
      const midTheta = theta - (Math.PI * 2) / bumps / 2
      const midR = baseR * (1 + amp * prng(i - 0.5) * randAmt)
      const cpx = cx + Math.cos(midTheta) * midR
      const cpy = cy + Math.sin(midTheta) * midR
      if (ctx.quadraticCurveTo) ctx.quadraticCurveTo(cpx, cpy, px, py)
      else ctx.lineTo?.(px, py)
    }
  }
  ctx.fill()
  ctx.stroke()

  // Tail (小さな円を並べる)
  if (cfg.tail?.enabled) {
    const { count, startRadiusRatio, decay, gapRatio, angle } = cfg.tail
    const startR = baseR * startRadiusRatio
    const tailCx = cx + Math.cos(angle) * (baseR + startR * gapRatio)
    const tailCy = cy + Math.sin(angle) * (baseR + startR * gapRatio)
    for (let i = 0; i < count; i++) {
      const r = Math.max(cfg.minRadiusPx, startR * decay ** i)
      const tx = tailCx + Math.cos(angle) * i * r * (1 + gapRatio)
      const ty = tailCy + Math.sin(angle) * i * r * (1 + gapRatio)
      ctx.beginPath()
      if (ctx.ellipse) ctx.ellipse(tx, ty, r, r, 0, 0, Math.PI * 2)
      else ctx.rect(tx - r, ty - r, r * 2, r * 2)
      ctx.fill()
      ctx.stroke()
    }
  }
}

