export interface ContentTextConfig {
  enabled: boolean
  fontSize: {
    min: number
    max: number
    default: number
  }
  padding: number
  lineHeight: number
  background: {
    color: string
    borderColor: string
    borderWidth: number
    borderRadius: number
  }
  textColor: string
  placement: {
    strategy: string
    preferredAreas: string[]
    minAreaSize: number
  }
  maxWidthRatio: number
  maxHeightRatio: number
}

export interface SfxConfig {
  enabled: boolean
  mainFontSize: {
    min: number
    max: number
    scaleFactor: number
  }
  supplementFontSize: {
    scaleFactor: number
    min: number
  }
  mainTextStyle: {
    fillStyle: string
    strokeStyle: string
    lineWidth: number
    fontWeight: 'bold' | 'normal'
  }
  supplementTextStyle: {
    fillStyle: string
    strokeStyle: string
    lineWidth: number
    fontWeight: 'bold' | 'normal'
  }
  rotation: {
    enabled: boolean
    maxAngle: number
  }
  placement: {
    avoidOverlap: boolean
    preferredPositions: string[]
  }
}

export interface ThoughtBubbleShapeConfig {
  /** 雲の“こぶ”の数（大きいほど細かくグネグネ） */
  bumps: number
  /** 各こぶの基本ふくらみ量（短径に対する比率） */
  amplitudeRatio: number
  /** こぶ毎のふくらみの揺らぎ（0..1） */
  randomness: number
  /** ふくらみの最小ピクセル値（くずれ防止） */
  minRadiusPx: number
}

export interface ThoughtBubbleTailConfig {
  /** 尾泡を描画するか（デフォルト: true） */
  enabled: boolean
  /** 尾泡の個数（2〜4推奨） */
  count: number
  /** 最大尾泡の半径（吹き出し短径に対する比率） */
  startRadiusRatio: number
  /** 尾泡の半径減衰率（0..1） */
  decay: number
  /** 円間の距離（吹き出し短径に対する比率） */
  gapRatio: number
  /** 尾泡の方向（ラジアン, 0=右, π/2=下, π=左, -π/2=上） */
  angle: number
}

export interface BubbleConfig {
  fillStyle: string
  strokeStyle: string
  normalLineWidth: number
  shoutLineWidth: number
  /** thought（心の声）用の雲形パラメータ */
  thoughtShape: ThoughtBubbleShapeConfig
  /** thought（心の声）用の尾泡パラメータ */
  thoughtTail: ThoughtBubbleTailConfig
}

export interface SpeakerLabelConfig {
  enabled: boolean
  fontSize: number
  padding: number
  backgroundColor: string
  borderColor: string
  textColor: string
  offsetX: number
  offsetY: number
  borderRadius: number
  /** 1行あたりの最大文字数（BudouXで安全に折り返し） */
  maxCharsPerLine?: number
}

export interface AppCanvasConfig {
  sfx: SfxConfig
  bubble: BubbleConfig
  speakerLabel: SpeakerLabelConfig
  contentText: ContentTextConfig
}
