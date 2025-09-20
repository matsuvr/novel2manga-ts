import * as RA from 'effect/Array'
import { pipe } from 'effect/Function'

export type PanelImportanceLevel = 1 | 2 | 3 | 4 | 5 | 6

export interface ImportanceCandidate {
  readonly index: number
  readonly rawImportance: number
  readonly dialogueCharCount: number
  readonly narrationCharCount: number
  readonly contentLength: number
}

export interface NormalizedImportance {
  readonly index: number
  readonly importance: PanelImportanceLevel
}

interface DistributionEntry {
  readonly level: PanelImportanceLevel
  readonly ratio: number
}

const DISTRIBUTION: readonly DistributionEntry[] = [
  { level: 1, ratio: 0.2 },
  { level: 2, ratio: 0.2 },
  { level: 3, ratio: 0.3 },
  { level: 4, ratio: 0.2 },
  { level: 5, ratio: 0.05 },
  { level: 6, ratio: 0.05 },
]

interface TargetAllocation extends DistributionEntry {
  base: number
  fraction: number
}

const summarizeTextSignal = (candidate: ImportanceCandidate): number =>
  candidate.dialogueCharCount + candidate.narrationCharCount

const compareCandidates = (a: ImportanceCandidate, b: ImportanceCandidate): number => {
  if (a.rawImportance !== b.rawImportance) {
    return b.rawImportance - a.rawImportance
  }
  const textSignalA = summarizeTextSignal(a)
  const textSignalB = summarizeTextSignal(b)
  if (textSignalA !== textSignalB) {
    return textSignalB - textSignalA
  }
  if (a.contentLength !== b.contentLength) {
    return b.contentLength - a.contentLength
  }
  return b.index - a.index
}

const buildTargetAllocations = (totalPanels: number): TargetAllocation[] =>
  pipe(
    DISTRIBUTION,
    RA.map((entry) => {
      const exact = entry.ratio * totalPanels
      const base = Math.floor(exact)
      const fraction = exact - base
      return { ...entry, base, fraction }
    }),
  )

const distributeRemainder = (targets: TargetAllocation[], totalPanels: number): TargetAllocation[] => {
  const assigned = targets.reduce((acc, item) => acc + item.base, 0)
  let remainder = totalPanels - assigned
  if (remainder <= 0) {
    return targets
  }

  const ordered = [...targets].sort((a, b) => {
    if (a.fraction !== b.fraction) return b.fraction - a.fraction
    if (a.ratio !== b.ratio) return b.ratio - a.ratio
    return b.level - a.level
  })

  let idx = 0
  while (remainder > 0) {
    const target = ordered[idx % ordered.length]
    target.base += 1
    remainder -= 1
    idx += 1
  }

  return targets
}

const levelsDescending = (): PanelImportanceLevel[] =>
  [...DISTRIBUTION].map((entry) => entry.level).sort((a, b) => b - a)

export const normalizeImportanceDistribution = (
  candidates: ReadonlyArray<ImportanceCandidate>,
): ReadonlyArray<NormalizedImportance> => {
  if (candidates.length === 0) {
    return []
  }

  const targets = distributeRemainder(buildTargetAllocations(candidates.length), candidates.length)
  const targetCount = new Map<PanelImportanceLevel, number>(targets.map((t) => [t.level, t.base]))

  const sortedCandidates = [...candidates].sort(compareCandidates)
  const assignments = new Map<number, PanelImportanceLevel>()
  let cursor = 0

  for (const level of levelsDescending()) {
    const count = targetCount.get(level) ?? 0
    for (let i = 0; i < count && cursor < sortedCandidates.length; i++) {
      const candidate = sortedCandidates[cursor]
      assignments.set(candidate.index, level)
      cursor += 1
    }
  }

  while (cursor < sortedCandidates.length) {
    const candidate = sortedCandidates[cursor]
    assignments.set(candidate.index, 1)
    cursor += 1
  }

  return candidates.map((candidate) => ({
    index: candidate.index,
    importance: assignments.get(candidate.index) ?? 1,
  }))
}

export const mapImportanceToPanelSize = (
  importance: PanelImportanceLevel,
): 'small' | 'medium' | 'large' | 'extra-large' => {
  if (importance >= 5) return 'extra-large'
  if (importance >= 4) return 'large'
  if (importance >= 3) return 'medium'
  return 'small'
}
