import { vi } from 'vitest'

/**
 * Create a reusable mock of CanvasRenderingContext2D with the methods used by CanvasRenderer.
 * Any method not explicitly listed can be added later without breaking existing tests.
 */
export function createCanvas2DMock(overrides?: { strokeRect?: any }) {
  const ctx: Partial<CanvasRenderingContext2D> & Record<string, any> = {
    // state
    fillStyle: '#ffffff',
    strokeStyle: '#000000',
    lineWidth: 1,
    font: '16px sans-serif',

    // path & geometry
    beginPath: vi.fn(),
    closePath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    rect: vi.fn(),
    quadraticCurveTo: vi.fn(),
    ellipse: vi.fn(),
    arc: vi.fn(),

    // transform
    translate: vi.fn(),
    rotate: vi.fn(),
    scale: vi.fn(),

    // draw ops
    fill: vi.fn(),
    stroke: vi.fn(),
    fillRect: vi.fn(),
  strokeRect: overrides?.strokeRect ?? vi.fn(),
    drawImage: vi.fn(),
    clip: vi.fn(),

    // text
    strokeText: vi.fn(),
    fillText: vi.fn(),
    measureText: vi.fn().mockReturnValue({ width: 100 }),

    // state stack
    save: vi.fn(),
    restore: vi.fn(),

    // image smoothing placeholders
    imageSmoothingEnabled: true,
  }

  return ctx as unknown as CanvasRenderingContext2D
}

export function createCanvasElementMock(width = 1200, height = 1684) {
  const context = createCanvas2DMock()
  const canvas = {
    width,
    height,
    getContext: (id: string) => (id === '2d' ? context : null),
    toDataURL: vi.fn().mockReturnValue('data:image/png;base64,iVBORw0KGgo='),
    toBuffer: vi.fn().mockReturnValue(Buffer.from('iVBORw0KGgo=', 'base64')),
  }
  return { canvas: canvas as unknown as HTMLCanvasElement, context }
}
