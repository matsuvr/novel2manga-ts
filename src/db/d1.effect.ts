// D1 effect layer removed. This stub exists to avoid runtime/module errors
// during migration. Importers should be updated to remove reliance on D1.

export const D1ServiceTag = Symbol('D1ServiceTag')

export function D1(): never {
  throw new Error('D1 support removed')
}

export function withD1(): never {
  throw new Error('D1 support removed')
}
