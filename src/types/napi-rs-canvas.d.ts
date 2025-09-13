declare module '@napi-rs/canvas' {
  interface Canvas {
    width: number
    height: number
    getContext(contextId: '2d'): CanvasRenderingContext2D
    toDataURL(type?: string, quality?: number): string
    toBuffer(mimeType?: string, config?: unknown): Buffer
  }

  export type Image = CanvasImageSource & { width: number; height: number }

  export function createCanvas(width: number, height: number): Canvas
  export function loadImage(
    source: string | ArrayBufferLike | Buffer | Uint8Array | URL | Image,
    options?: unknown,
  ): Promise<Image>

  export const GlobalFonts: {
    registerFromPath(path: string, family: string): void
  }
}
