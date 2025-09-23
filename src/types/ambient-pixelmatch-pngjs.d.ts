// Minimal ambient declarations for pixelmatch & pngjs when @types are absent
declare module 'pixelmatch' {
  interface PixelmatchOptions {
    threshold?: number
    includeAA?: boolean
    alpha?: number
  }
  function pixelmatch(
    img1: Uint8Array | Buffer,
    img2: Uint8Array | Buffer,
    output: Uint8Array | Buffer,
    width: number,
    height: number,
    options?: PixelmatchOptions,
  ): number
  export default pixelmatch
}

declare module 'pngjs' {
  interface PNGOptions { width?: number; height?: number }
  export class PNG {
    width: number
    height: number
    data: Buffer
    constructor(opts?: PNGOptions)
    static sync: {
      read(data: Buffer): PNG
      write(png: PNG): Buffer
    }
  }
}