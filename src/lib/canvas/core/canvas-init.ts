import path from 'node:path'
import { createCanvas, GlobalFonts, loadImage } from '@napi-rs/canvas'
import { getLogger } from '@/infrastructure/logging/logger'

let initialized = false

/**
 * Ensure fonts are registered exactly once (idempotent).
 * Existing CanvasRenderer performed registration at module top-level; we centralize it here
 * so that pure rendering functions can rely on a single guarded entry point.
 */
export function ensureCanvasInited(): void {
  if (initialized) return
  const logger = getLogger().withContext({ service: 'canvas-core', method: 'ensureCanvasInited' })
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
        } catch (e) {
          logger.warn('font_variant_register_failed', { variant: fam, error: e instanceof Error ? e.message : String(e) })
        }
      }
    }
    registerPair(lightFontPath, ['Noto Sans JP', 'NotoSansJP'])
    registerPair(semiBoldFontPath, ['Noto Sans JP SemiBold', 'NotoSansJP-SemiBold'])
  } catch (e) {
    logger.warn('font_registration_failed', { error: e instanceof Error ? e.message : String(e) })
  }
  initialized = true
}

export { createCanvas, loadImage }
