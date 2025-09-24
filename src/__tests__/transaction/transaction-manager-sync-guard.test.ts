import { describe, expect, it } from 'vitest'
import { TransactionManager } from '@/services/application/transaction-manager'

describe('TransactionManager sync DB op guard', () => {
  it('rejects async database operations at registration time', () => {
    const tm = new TransactionManager()
    const asyncFn = async () => { /* pretend db write */ }
    expect(() => tm.addDatabaseOperation(asyncFn as unknown as (tx?: unknown) => void)).toThrow(
      /async function/i,
    )
  })
})
