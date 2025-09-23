// measure-text-cache: CanvasRenderingContext2D#measureText の結果幅を LRU でキャッシュ
// 新パイプライン最適化用。フォント変更が頻繁でない前提で key = `${font}|${text}`。

export interface MeasureTextCacheStats {
  hits: number
  misses: number
  size: number
  capacity: number
}

interface Entry { key: string; width: number; prev?: Entry; next?: Entry }

export class MeasureTextCache {
  private map = new Map<string, Entry>()
  private head?: Entry
  private tail?: Entry
  private _hits = 0
  private _misses = 0
  constructor(private readonly capacity: number) {}

  stats(): MeasureTextCacheStats { return { hits: this._hits, misses: this._misses, size: this.map.size, capacity: this.capacity } }

  private touch(e: Entry) {
    if (this.head === e) return
    // detach
    if (e.prev) e.prev.next = e.next
    if (e.next) e.next.prev = e.prev
    if (this.tail === e) this.tail = e.prev
    // link front
    e.prev = undefined
    e.next = this.head
    if (this.head) this.head.prev = e
    this.head = e
    if (!this.tail) this.tail = e
  }

  private evictIfNeeded() {
    if (this.map.size <= this.capacity) return
    const victim = this.tail
    if (!victim) return
    if (victim.prev) victim.prev.next = undefined
    this.tail = victim.prev
    if (this.head === victim) this.head = undefined
    this.map.delete(victim.key)
  }

  getOrMeasure(ctx: CanvasRenderingContext2D, text: string): number {
    const font = ctx.font || ''
    const key = `${font}|${text}`
    const found = this.map.get(key)
    if (found) {
      this._hits++
      this.touch(found)
      return found.width
    }
    this._misses++
    const width = ctx.measureText(text).width
    const entry: Entry = { key, width }
    this.map.set(key, entry)
    // insert at head
    entry.next = this.head
    if (this.head) this.head.prev = entry
    this.head = entry
    if (!this.tail) this.tail = entry
    this.evictIfNeeded()
    return width
  }
}

// グローバルキャッシュ (ページレンダリング間で共有) – 容量は将来 config 化可
export const globalMeasureTextCache = new MeasureTextCache(2000)

export function measureTextWidthCached(ctx: CanvasRenderingContext2D, text: string): number {
  return globalMeasureTextCache.getOrMeasure(ctx, text)
}
