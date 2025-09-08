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

## Phase 3.2: Tests First (TDD) ⚠️ MUST COMPLETE BEFORE 3.3
**CRITICAL: These tests MUST be written and MUST FAIL before ANY implementation**
- [x] T005 [P] API compatibility test - Authentication endpoints in `src/__tests__/api/auth-compatibility.test.ts`
- [x] T006 [P] API compatibility test - Novel management in `src/__tests__/api/novel-compatibility.test.ts`
- [x] T007 [P] API compatibility test - Job management in `src/__tests__/api/job-compatibility.test.ts`
- [x] T008 [P] API compatibility test - Rendering endpoints in `src/__tests__/api/render-compatibility.test.ts`
- [x] T009 [P] Integration test - Database connectivity in `src/__tests__/integration/db-connectivity.test.ts`
- [x] T010 [P] Integration test - Storage migration in `src/__tests__/integration/storage-migration.test.ts`
- [x] T011 [P] Integration test - Environment configuration in `src/__tests__/integration/env-config.test.ts`

## Phase 3.3: Core Implementation - Remove Cloudflare Configuration
- [x] T012 Remove wrangler.toml configuration file
- [x] T013 Remove cloudflare-env.d.ts types file
- [x] T014 Update next.config.js for standard Next.js deployment
- [x] T015 [P] Create local storage directories structure
- [x] T016 [P] Update environment configuration for local development

## Phase 3.4: Database Migration
- [x] T017 Verify SQLite3 database compatibility (no schema changes needed)
- [x] T018 Update database connection configuration
- [x] T019 [P] Create database backup and migration scripts
- [x] T020 Test database integrity after migration

## Phase 3.5: Storage Migration
- [x] T021 [P] Create R2 to local file system migration script
- [x] T022 [P] Update file path references in database records
- [x] T023 [P] Implement local file storage service
- [x] T024 [P] Create storage cleanup and management utilities

## Phase 3.6: Code Updates
- [x] T025 Remove getCloudflareContext() imports from API routes
- [x] T026 Update database access patterns in service files
- [x] T027 [P] Replace Cloudflare KV with local cache implementation
- [x] T028 [P] Update authentication to use standard environment variables
- [x] T029 [P] Remove Cloudflare-specific error handling

## Phase 3.7: Configuration Updates
- [ ] T030 Create .env.local with local development configuration
- [x] T031 Update Docker configuration for local deployment
- [x] T032 [P] Create deployment scripts for standard Next.js
- [x] T033 [P] Update CI/CD pipeline for new deployment method

## Phase 3.8: Integration Testing
- [ ] T034 Run comprehensive API compatibility tests
- [ ] T035 Test all user workflows end-to-end
- [ ] T036 Performance benchmarking and comparison
- [ ] T037 Data integrity validation across all entities

## Phase 3.9: Polish & Documentation
- [ ] T038 [P] Update documentation for new architecture
- [ ] T039 [P] Create migration rollback procedures
- [ ] T040 [P] Archive old Cloudflare configuration
- [ ] T041 [P] Update monitoring and logging configuration
- [ ] T042 [P] Performance optimization for local storage

## Phase 3.10: Validation & Deployment
- [ ] T043 Final migration test with production data backup
- [ ] T044 Deploy to staging environment
- [ ] T045 Production deployment with rollback capability
- [ ] T046 Post-migration monitoring and optimization

## Dependencies
- Setup (T001-T004) before Tests (T005-T011)
- Tests (T005-T011) before Implementation (T012-T033)
- Database (T017-T020) before Storage (T021-T024)
- Code Updates (T025-T029) before Integration (T034-T037)
- All implementation before Polish (T038-T042) and Validation (T043-T046)

## Parallel Example
```
# Launch T005-T011 together (all compatibility tests):
Task: "API compatibility test - Authentication endpoints in src/__tests__/api/auth-compatibility.test.ts"
Task: "API compatibility test - Novel management in src/__tests__/api/novel-compatibility.test.ts"
Task: "API compatibility test - Job management in src/__tests__/api/job-compatibility.test.ts"
Task: "API compatibility test - Rendering endpoints in src/__tests__/api/render-compatibility.test.ts"
Task: "Integration test - Database connectivity in src/__tests__/integration/db-connectivity.test.ts"
Task: "Integration test - Storage migration in src/__tests__/integration/storage-migration.test.ts"
Task: "Integration test - Environment configuration in src/__tests__/integration/env-config.test.ts"

# Launch T015-T016 together (directory creation):
Task: "Create local storage directories structure"
Task: "Update environment configuration for local development"
```

## Critical Path
The most critical dependencies are:
1. **T004 (Backup)** before any destructive changes
2. **T005-T011 (Tests)** must fail before implementation
3. **T017 (Database verification)** before storage migration
4. **T043 (Final test)** before production deployment

## Notes
- [P] tasks = different files, no dependencies
- Verify tests fail before implementing each endpoint
- Commit after each task for easy rollback
- Database schema already compatible with SQLite3 - focus on connection and configuration
- Storage migration is the highest risk area - test thoroughly
- Maintain rollback capability throughout migration

## Task Generation Rules Applied

### From Contracts
- API contracts → compatibility tests (T005-T008)
- Each endpoint category → separate test files

### From Data Model
- Existing entities → verification and migration tasks (T017-T020)
- Storage relationships → file path updates (T022)

### From Research
- Migration decisions → setup and configuration tasks (T001-T004, T012-T016)
- Risk assessment → backup and rollback tasks (T004, T039, T046)

### From Quickstart
- Migration steps → validation and deployment tasks (T034-T046)

## Validation Checklist
- [x] All contracts have compatibility tests
- [x] All entities have migration/verification tasks
- [x] All tests come before implementation
- [x] Parallel tasks truly independent
- [x] Each task specifies exact file path
- [x] No task modifies same file as another [P] task
- [x] Backup procedures included before destructive changes
- [x] Rollback capability maintained throughout