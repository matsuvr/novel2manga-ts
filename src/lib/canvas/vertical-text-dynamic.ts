import { appConfig } from '@/config/app.config'

/**
 * 動的に 1 行あたりの最大文字数 (縦書き) をパネル高さ比率から算出する。
 * Legacy MangaPageRenderer.computeMaxCharsPerLine のロジックを新パイプライン用に抽出/簡約。
 * 目的:
 *  - 縦に小さいコマでは行長を短くし、画像の極端な縮小/潰れを防ぐ
 *  - 十分な高さのコマでは設定上限(maxCharsPerLine)まで許容
 */
export function computeDynamicMaxCharsPerLine(panelHeightRatio: number): number {
  const vt = appConfig.rendering.verticalText
  const defaults = vt?.defaults || { fontSize: 24, lineHeight: 1.6, padding: 12, maxCharsPerLine: 14 }
  const dyn = vt?.dynamicCoverage as { enabled: boolean; heightCoverage: number; minCharsPerLine: number } | undefined
  const enabled = dyn ? dyn.enabled : false
  const minChars = dyn ? dyn.minCharsPerLine : 4
  const defaultMax = defaults.maxCharsPerLine || 14

  if (!enabled) {
    if (panelHeightRatio <= 0.2) return Math.max(minChars, 6)
    if (panelHeightRatio <= 0.3) return Math.max(minChars, 8)
    return defaultMax
  }

  // === Dynamic path ===
  // (Algorithm mirroring legacy implementation intentionally to ensure identical behavior)
  const pageHeightRatio = panelHeightRatio // normalized height already 0..1
  const tinyThreshold = 0.12
  const smallThreshold = 0.2
  if (pageHeightRatio <= tinyThreshold) return minChars
  if (pageHeightRatio <= smallThreshold) {
    return Math.min(defaultMax, Math.max(minChars + 1,  (minChars + 1)))
  }
  // Middle / Large panels – allow up to defaultMax but never below minChars+1
  return Math.max(minChars + 1, Math.min(defaultMax, defaultMax))
}
