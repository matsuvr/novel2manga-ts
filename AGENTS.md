# Repository Instructions

## Critical Rules

- **Never edit `package-lock.json` directly.** It is generated, not handwritten. Manual edits cause severe issues.
- **Effect TS migration in progress.**
  - New code must use Effect TS. See `docs/effect-ts-doc.txt`.
  - Do not rewrite working legacy code until scheduled.
- テストがおかしいのに、本体に無理矢理手を入れるの絶対禁止。テストがおかしいならテストを見直すこと

## Project Layout

- Source: `src/` → `app/` (routes), `components/`, `agents/`, `services/`, `db/`, `utils/`, `types/`.
- Tests: `src/__tests__/` (unit), `tests/integration/` (integration), `tests/integration/e2e/` (Playwright).
- Assets: `public/`. Scripts: `scripts/`.
- DB: `database/` (data/docs), `drizzle/` (migrations/meta). Schema source: `src/db/schema.ts`. Keep in sync.

## Database Access

- **Drizzle-only policy:** All database operations MUST go through Drizzle ORM. Never import or use `better-sqlite3` directly except in `src/db/index.ts` for initialization.
- **Service layer required:** Database operations must use service classes extending `BaseDatabaseService` or the centralized `DatabaseServiceFactory`.
- **Transaction wrapper:** Use `executeInTransaction()` for all database operations requiring atomicity. Direct `db.transaction()` calls are forbidden outside the adapter layer.
- **Adapter pattern:** Database-specific behavior must be encapsulated in adapter classes (`src/infrastructure/database/adapters/`). No SQLite-specific code outside adapters.
- **Type safety:** Always use typed Drizzle queries with schema imports from `@/db/schema`. Raw SQL via `db.prepare()` or similar is forbidden.

### Forbidden Patterns

- ❌ `import Database from 'better-sqlite3'` (except in `src/db/index.ts`)
- ❌ `db.prepare()`, `db.exec()`, or any raw SQLite methods
- ❌ Direct `transaction()` calls without service layer wrapper
- ❌ Accessing `.statement` or other internal Drizzle/SQLite properties
- ❌ Creating new database connections outside `createDatabaseConnection()`

### Required Patterns

- ✅ `import { getDatabase } from '@/db'` for singleton access
- ✅ `extends BaseDatabaseService` for new database services
- ✅ `this.executeInTransaction()` for transactional operations
- ✅ `DatabaseServiceFactory.get*Service()` for service access
- ✅ Typed Drizzle query builders: `db.select()`, `db.insert()`, `db.update()`, `db.delete()`

## Commands

- Dev: `docker compose up -d` → localhost:3000.
- Build/serve: `npm run build`, `npm start`.
- Tests: `npm test`, `npm run test:unit`, `npm run test:coverage`, `npm run test:integration`, `npm run test:e2e`, `npm run test:full-flow`.
- Lint/format/check: `npm run format`, `npm run lint`, `npm run check`.
- DB: `npm run db:migrate`, `db:generate`, `db:push`, `db:studio`.

## Style

- TypeScript, Node ≥ 20.9. Strict typing. No `any`, no unexplained `@ts-ignore`.
- Formatter: Biome (CI enforced).
- Naming: PascalCase components, camelCase vars/functions, kebab-case files. Routes live in `src/app/`.

### Config Centralization

- No magic numbers.
- All thresholds/limits/timeouts/pages → `*.config.ts`.
- Example: `rendering.limits.maxPages` in `app.config.ts` is the only reference.
- On finding hardcoded values, refactor immediately to config.

## Testing

- Frameworks: Vitest (unit/integration), Playwright (E2E).
- Unit tests: `src/__tests__/*.test.ts(x)`.
- Integration: `tests/integration/` (via `vitest.integration.config.ts`).
- E2E: `tests/integration/e2e/`.
- Keep `.env.test` current. Minimize side effects.

## Commits & PRs

- Conventional Commits (`feat:`, `fix:`, etc).
- PRs: follow `.github/pull_request_template.md`. Include linked issues, test results, updated specs/docs (`.kiro/specs/...`, `src/db/schema.ts`, `drizzle/`, `database/storage-structure.md`).
- Quality: 0 TS errors, clean lint/format, DRY/SOLID respected, tests required.

## Security

- Never commit secrets. Copy `.env.example` → `.env`, `.env.local`, `.env.test`.
- Cloudflare integration removed.

## Tools

- `gh` CLI for branches/PRs.
- `git-grep`.

---

## Mandatory Practices

- Always fetch latest official docs with MCP tools before coding. Validate library updates via web search + Deepwiki.
- Forbid `any`. Use `unknown` + guards, generics, discriminated unions.
- No unjustified disables of lint/format.
- Enforce DRY + SOLID.
- Unit tests for all public behavior; E2E required for critical flows.
- Temp scripts → `/tmp_test` only, remove before merge.

### Docs & Contracts

- Keep design (`design.md`), tasks (`tasks.md`), schema (`schema.ts` + migrations), and storage (`storage-structure.md`) in sync with code in the same PR.
- No hidden errors, no silent fallbacks. Fail visibly with detailed messages.

### Dependency Policy

- When adding/upgrading libs, verify stability/maintenance/migration notes. Link sources in PR.

### Merge Gates

- Build passes with 0 TS errors, linter clean.
- Unit, integration, E2E tests pass.
- Docs/specs/tasks updated.
- No duplication.

### PR Checklist

- [ ] No `any` / unjustified ignores
- [ ] Lint/format clean
- [ ] DRY + SOLID upheld
- [ ] Unit tests passing
- [ ] E2E tests passing
- [ ] Updated: `design.md`, `tasks.md`, `schema.ts` + migrations, `storage-structure.md`

✅ Guidelines to Avoid Overusing as unknown as
1. Always assign the correct type from the beginning

Do not fall back to unknown when the type is unclear. Instead, define or import the proper type for:

- function parameters
- API responses
- library return values

2. Use type guards or user-defined type guards

Narrow down unknown values safely by using built-in checks (typeof, in, etc.) or custom functions with the value is T syntax. This ensures type safety without casting.

3. Prefer generics over unsafe casts

When a function needs to be flexible with input and output types, use generics instead of casting through unknown. This allows type inference and safety to flow naturally.

4. Validate external data with schemas

For untrusted sources such as API responses or JSON data, validate at runtime using schema libraries (e.g., zod, io-ts) instead of unsafe casts. Parsing through a schema guarantees both runtime correctness and proper TypeScript typing.

5. Favor type flow over casting

as unknown as breaks and rebuilds the type system. Treat it as a last resort. Instead, design your types and functions so that type information flows naturally, eliminating the need for double casting.
