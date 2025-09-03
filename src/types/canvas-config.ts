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

export interface BubbleConfig {
  fillStyle: string
  strokeStyle: string
  normalLineWidth: number
  shoutLineWidth: number
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
}

export interface AppCanvasConfig {
  sfx: SfxConfig
  bubble: BubbleConfig
  speakerLabel: SpeakerLabelConfig
  contentText: ContentTextConfig
}
