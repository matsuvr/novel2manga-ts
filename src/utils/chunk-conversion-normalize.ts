import { ChunkConversionCharacterIdPattern } from '@/types/chunk-conversion'

interface NormalizationResult<T> {
  applied: boolean
  normalized: T
  reason?: string
}

// 部分的にアクセスするための補助型（厳格な依存を避ける）
interface CharacterLike { id: unknown }
interface SituationLike { characterId?: unknown | null }
interface DialogueLineLike { speaker?: unknown }
interface PanelLike { dialogue?: DialogueLineLike[] }

// 数値 or 数値文字列の id を c<number> に正規化する (全件数値の場合のみ安全適用)
export function normalizeCharacterIds<T extends {
  memory?: { characters?: Array<{ id: unknown }> }
  situations?: Array<{ characterId?: unknown | null }>
  script?: Array<{ dialogue?: Array<{ speaker?: unknown }> }>
}>(input: T): NormalizationResult<T> {
  try {
    const chars = input.memory?.characters ?? []
    if (chars.length === 0) return { applied: false, normalized: input }

    const ids = chars.map((c) => c.id)
    const allAreNumericLike = ids.every(
      (id) =>
        (typeof id === 'number' && Number.isFinite(id) && id >= 0) ||
        (typeof id === 'string' && /^\d+$/.test(id)),
    )
    const anyAlreadyPrefixed = ids.some(
      (id) => typeof id === 'string' && ChunkConversionCharacterIdPattern.test(id),
    )
    if (!allAreNumericLike || anyAlreadyPrefixed) {
      return { applied: false, normalized: input }
    }

    // マッピング生成
    const map = new Map<unknown, string>()
    ids.forEach((raw) => {
      const n = typeof raw === 'number' ? raw : Number(raw)
      map.set(raw, `c${n}`)
    })

    const clone: T = JSON.parse(JSON.stringify(input))
    if (clone.memory?.characters) {
      const updated = (clone.memory.characters as CharacterLike[]).map((c) => ({
        ...(c as object),
        id: map.get(c.id) ?? c.id,
      })) as unknown as typeof clone.memory.characters
      clone.memory.characters = updated
    }
    if (Array.isArray(clone.situations)) {
      const updated = (clone.situations as SituationLike[]).map((s) => ({
        ...(s as object),
        characterId: s.characterId != null ? map.get(s.characterId) ?? s.characterId : s.characterId,
      })) as unknown as typeof clone.situations
      clone.situations = updated
    }
    if (Array.isArray(clone.script)) {
      const updated = (clone.script as PanelLike[]).map((p) => ({
        ...(p as object),
        dialogue: Array.isArray(p.dialogue)
          ? p.dialogue.map((d) => ({
              ...(d as object),
              speaker:
                d.speaker && d.speaker !== '不明'
                  ? map.get(d.speaker) ?? d.speaker
                  : d.speaker,
            }))
          : p.dialogue,
      })) as unknown as typeof clone.script
      clone.script = updated
    }
    return { applied: true, normalized: clone, reason: 'All character IDs were numeric-like' }
  } catch {
    return { applied: false, normalized: input }
  }
}
