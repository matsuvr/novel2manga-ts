import type { Panel as PanelData, Position, Size } from '@/types/panel-layout'

export interface PanelInit {
  content: string
  dialogues?: { speaker: string; text: string }[]
  sourceChunkIndex: number
  importance: number
  suggestedSize: 'small' | 'medium' | 'large' | 'extra-large'
}

export class Panel {
  public readonly id: number
  public readonly content: string
  public readonly dialogues?: { speaker: string; text: string }[]
  public readonly sourceChunkIndex: number
  public readonly importance: number
  private _position: Position = { x: 0, y: 0 }
  private _size: Size = { width: 0, height: 0 }

  constructor(id: number, init: PanelInit) {
    this.id = id
    this.content = init.content
    this.dialogues = init.dialogues
    this.sourceChunkIndex = init.sourceChunkIndex
    this.importance = init.importance
  }

  applyTemplate(style: { position: Position; size: Size }): void {
    this._position = style.position
    this._size = style.size
  }

  get position(): Position {
    return this._position
  }

  get size(): Size {
    return this._size
  }

  toJSON(): PanelData {
    return {
      id: this.id,
      position: this._position,
      size: this._size,
      content: this.content,
      dialogues: this.dialogues,
      sourceChunkIndex: this.sourceChunkIndex,
      importance: this.importance,
    }
  }
}
