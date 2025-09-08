import { removablePrefixes } from '@/config/storage-paths.config'

/**
 * ストレージキー/パスの正規化
 * - 既知の基底ディレクトリ接頭辞（novels/, chunks/, analysis/, layouts/, renders/, outputs/）を剥がす
 * - 先頭のスラッシュを除去
 * - 連続するスラッシュを1つに畳み込む（ただし先頭は除去済みのため対象外）
 * - 入力が空/空白のみの場合はそのまま返す
 */
export function normalizeStoragePath(input: string | null | undefined): string | null {
  if (input == null) return null
  const raw = String(input).trim()
  if (raw.length === 0) return raw

  // 先頭スラッシュ除去
  let out = raw.replace(/^\/+/, '')

  // 既知の接頭辞を繰り返し除去（入れ子や重複に対処）
  let changed = true
  while (changed) {
    changed = false
    for (const prefix of removablePrefixes) {
      if (out.startsWith(prefix)) {
        out = out.slice(prefix.length)
        changed = true
      }
    }
  }

  // 連続スラッシュを1つに（グローバル）
  out = out.replace(/\/+/g, '/')
  // 念のため先頭スラッシュを再度除去（接頭辞除去後に先頭に現れるケース対策）
  out = out.replace(/^\/+/, '')

  return out
}

/**
 * 正規化を適用し、値が変わる場合のみ更新対象として返す
 */
export function normalizeIfChanged(value: string | null | undefined): {
  next: string | null
  changed: boolean
} {
  const normalized = normalizeStoragePath(value)
  // 値の同一性は文字列として比較（nullはそのまま）
  const before = value == null ? null : String(value)
  const after = normalized
  return { next: after, changed: before !== after }
}
