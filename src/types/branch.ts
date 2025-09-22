// Branch related types
// NOTE: Added to support EXPAND / EXPLAINER branching. Keep minimal to avoid circular deps.

export enum BranchType {
  NORMAL = 'NORMAL',
  EXPAND = 'EXPAND',
  EXPLAINER = 'EXPLAINER',
}

export interface BranchMarker {
  jobId: string
  branch: BranchType
  createdAt: string // ISO timestamp
}

// ensureBranchMarker の戻り値共通型
export interface EnsureBranchMarkerResult {
  branch: BranchType
  created: boolean
  reason?: string
  source?: string
  metrics?: { length: number }
}

export function isBranchType(value: unknown): value is BranchType {
  return typeof value === 'string' && (value === BranchType.NORMAL || value === BranchType.EXPAND || value === BranchType.EXPLAINER)
}
