export * from './TestFixturesManagerImpl'

// Provide compatibility shim: export a TestFixturesManager class with getInstance()
import { testFixturesManager as _impl, TestFixturesManagerImpl } from './TestFixturesManagerImpl'

export class TestFixturesManager {
  private static _instance: TestFixturesManagerImpl | null = null

  static getInstance(): TestFixturesManagerImpl {
    if (!this._instance) this._instance = _impl
    return this._instance
  }

  // for type compatibility, re-export methods dynamically if needed
}

export default _impl
