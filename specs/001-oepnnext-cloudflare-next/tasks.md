Archived. See `archive/cloudflare-legacy/specs/001-oepnnext-cloudflare-next-tasks.md` for the original task list.

# Tasks: OpenNext・Cloudflare削除と純粋Next.js＋SQLite3移行

**Input**: Design documents from `/specs/001-oepnnext-cloudflare-next/`
**Prerequisites**: plan.md (required), research.md, data-model.md, contracts/

## Execution Flow (main)

```
1. Load plan.md from feature directory
   → Extract: tech stack (Next.js, SQLite3, Drizzle, Effect TS), libraries, structure
2. Load optional design documents:
   → data-model.md: Extract existing entities → migration tasks
   → contracts/api-contracts.md: Extract API endpoints → compatibility tests
   → research.md: Extract migration decisions → setup tasks
   → quickstart.md: Extract migration steps → validation tasks
3. Generate tasks by category:
   → Setup: dependency removal, configuration updates
   → Tests: API compatibility, integration tests
   → Core: storage migration, configuration updates
   → Integration: database connections, environment setup
   → Polish: performance, documentation, cleanup
4. Apply task rules:
   → Different files = mark [P] for parallel
   → Same file = sequential (no [P])
   → Tests before implementation (TDD)
5. Number tasks sequentially (T001, T002...)
6. Generate dependency graph
7. Create parallel execution examples
8. Validate task completeness:
   → All contracts have compatibility tests?
   → All storage systems migrated?
   → All configurations updated?
9. Return: SUCCESS (tasks ready for execution)
```

## Format: `[ID] [P?] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- Include exact file paths in descriptions

- [x] T001 Remove OpenNext packages from package.json
- [x] T002 Remove Cloudflare development dependencies
- [x] T003 Update package.json scripts for standard Next.js
- [x] T004 [P] Create backup of current Cloudflare configuration

Archived. See `archive/cloudflare-legacy/specs/001-oepnnext-cloudflare-next-tasks.md` for the original task list.
