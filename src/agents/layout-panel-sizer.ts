export class LayoutPanelSizer {
  calculate(
    templatePanel: { size: { width: number; height: number } },
    suggestedSize: 'small' | 'medium' | 'large' | 'extra-large',
  ) {
    let sizeMultiplier = 1.0
    if (suggestedSize === 'extra-large') sizeMultiplier = 1.5
    else if (suggestedSize === 'large') sizeMultiplier = 1.2
    else if (suggestedSize === 'small') sizeMultiplier = 0.8

    return {
      width: Math.min(templatePanel.size.width * sizeMultiplier, 1.0),
      height: Math.min(templatePanel.size.height * sizeMultiplier, 1.0),
    }
  }
}
