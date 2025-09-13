# Test DB Close Audit

This document summarizes where database `close()` / `cleanup()` / `initializeDatabaseServiceFactory()` are called in the repository and recommendations to avoid cross-test interference.

Findings

- `src/test/utils/TestDatabaseManager.ts` (primary test DB creator)
  - Now marks sqlite handles with `__testSuiteName` on creation.
  - `cleanupDatabase` will skip closing if the handle is owned by a different suite.
- `src/__tests__/integration/helpers/test-database.ts`
  - Contains guarded global factory cleanup logic (ownership heuristics: name/schema checks). This was recently hardened.
- `src/services/database/database-service-factory.ts`
  - `cleanup()` already skips closing raw DB when `NODE_ENV === 'test'` (delegates closing to test manager).
- `src/db/index.ts`
  - Calls `initializeDatabaseServiceFactory()` during `getDatabase()`; which itself is conservative about closing existing factory in test environments.
- `src/auth.ts`
  - Invokes `getDatabase()` to initialize the DatabaseServiceFactory before configuring NextAuth.
- Scripts
  - `scripts/debug/inspect-test-schema.ts` — previously closed db directly; now wraps `db.close()` in try/catch.
  - `scripts/deploy/*` — contain short-lived validation code that opens/closes sqlite; considered low-risk for test runs but noted.

Recommendations

1. Keep `database-service-factory.cleanup()` as-is: test env should delegate raw.close to TestDatabaseManager.
2. Avoid calling `sqlite.close()` directly from shared modules during tests. If needed, add ownership markers or guard checks like in `TestDatabaseManager`.
3. For any script that opens a DB for a quick probe, wrap `.close()` in try/catch to avoid throwing during incidental runs.
4. Consider centralizing a safe helper `safeClose(db, expectedOwner?)` in `src/test/utils` and reuse it across test helpers.

Next Steps

- Sweep other files that call `.close()` and add guards (if used during tests). Prioritize files that may run during test suites (library code, not scripts) and adjust accordingly.
- Optionally add tests that simulate parallel test suites to validate these guards.
