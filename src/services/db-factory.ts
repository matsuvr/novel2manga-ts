import { DatabaseService } from '@/services/database/index'

// Minimal shim for legacy tests. Application code should not use this.
let _instance: DatabaseService | null = null
export function getDatabaseService(): DatabaseService {
  if (!_instance) _instance = new DatabaseService()
  return _instance
}

export function __resetDatabaseServiceForTest(): void {
  _instance = null
}
