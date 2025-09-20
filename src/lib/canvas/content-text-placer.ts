import type { ContentTextPlacement } from './panel-layout-coordinator'
import { PanelLayoutCoordinator } from './panel-layout-coordinator'

/**
 * 説明テキスト（状況説明）の配置ヘルパー。
 * 現状は PanelLayoutCoordinator を薄くラップし、将来の戦略切替点を用意する。
 */
export class ContentTextPlacer {
  private coordinator: PanelLayoutCoordinator

  constructor(coordinator?: PanelLayoutCoordinator) {
    this.coordinator = coordinator ?? new PanelLayoutCoordinator()
  }

  reset(): void {
    this.coordinator.reset()
  }

  calculate(
    content: string,
    panelBounds: { x: number; y: number; width: number; height: number },
    ctx: CanvasRenderingContext2D,
    config: {
      minFontSize: number
      maxFontSize: number
      padding: number
      lineHeight: number
      maxWidthRatio?: number
      maxHeightRatio?: number
      minAreaSize?: number
      fontFamily?: string
    },
  ): ContentTextPlacement | null {
    return this.coordinator.calculateContentTextPlacement(content, panelBounds, ctx, config)
  }
}
