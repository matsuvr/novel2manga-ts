// D1 adapter removed. This file remains as a benign stub to avoid import
// resolution errors in code paths that still reference it during migration.

export type D1DatabaseLike = unknown

export function createD1Client(): never {
  throw new Error('D1 support removed: createD1Client is not available')
}
