# Tasks: novel2manga-ts リファクタリング計画実行
**Input**: refactor-plan0908.md from `/docs/`
**Prerequisites**: refactor-plan0908.md (required)
## Execution Flow (main)
```
1. Load refactor-plan0908.md from docs directory
   → Extract: priority levels, improvement areas, specific proposals
2. Generate tasks by phase:
   → Phase 1: Immediate fixes (error handling, magic numbers)
   → Phase 2: Short-term refactoring (SRP, domain models)
   → Phase 3: Mid-term improvements (Effect TS migration, interfaces)
   → Phase 4: Testing and validation
   → Phase 5: Documentation and cleanup
3. Apply task rules:
   → Different files = mark [P] for parallel
   → Same file = sequential (no [P])
   → Tests before implementation (TDD)
4. Number tasks sequentially (T001, T002...)
5. Generate dependency graph
6. Create parallel execution examples
7. Validate task completeness:
   → All proposals have corresponding tasks?
   → All files mentioned have changes?
   → All priorities respected?
8. Return: SUCCESS (tasks ready for execution)
```
## Format: `[ID] [P?] Description`
- **[P]**: Can run in parallel (different files, no dependencies)
- Include exact file paths in descriptions
## Phase 1: Immediate Fixes (1 Week) - Priority 1
- [ ] T001 [P] Remove fallback error handling in `src/services/application/steps/base-step.ts`
- [ ] T002 [P] Remove fallback error handling in `src/services/application/analyze-pipeline.ts`
- [ ] T003 [P] Remove fallback error handling in `src/agents/core.ts`
- [ ] T004 [P] Remove fallback error handling in all step files under `src/services/application/steps/*.ts`
- [ ] T005 [P] Add detailed error logging and job status update to 'failed' in base error handling using Effect TS catchAll
- [ ] T006 [P] Extract remaining hardcoded values in `src/lib/canvas/manga-page-renderer.ts` to `src/config/app.config.ts`
- [ ] T007 [P] Extract hardcoded values in `src/services/application/steps/rendering-step.ts` to `src/config/app.config.ts`
- [ ] T008 [P] Extract hardcoded values in `src/utils/chunk-splitter.ts` to `src/config/app.config.ts`
- [ ] T009 [P] Extract hardcoded values in `src/agents/layout-generator.ts` to `src/config/app.config.ts`
- [ ] T010 Add new config sections to `src/config/app.config.ts`: rendering.limits.maxPages, chunking.maxChunkSize, analysis.maxCharactersPerScene, layout.maxPanelsPerPage
## Phase 2: Short-term Refactoring (2-3 Weeks) - Priority 2
### 2.1 BasePipelineStep Refactoring
- [ ] T011 Create `src/services/application/job-progress-manager.ts` with job status update and step completion methods
- [ ] T012 Create `src/services/application/pipeline-error-logger.ts` with structured error logging
- [ ] T013 Refactor `src/services/application/steps/base-step.ts` to abstract class focusing on core execution only
- [ ] T014 [P] Update all step files under `src/services/application/steps/*.ts` to inject JobProgressManager and PipelineErrorLogger
- [ ] T015 [P] Implement Effect TS gen or pipe in base step execution flow in `src/services/application/steps/base-step.ts`
### 2.2 Domain Model Enhancement
- [ ] T016 Create `src/domain/novel/entities/novel.ts` with factory method and business rules
- [ ] T017 Create `src/domain/shared/value-objects/page-range.ts` with validation and operations
- [ ] T018 Create `src/domain/shared/value-objects/novel-id.ts` value object
- [ ] T019 Create `src/domain/shared/value-objects/title.ts` value object
- [ ] T020 Update existing models in `src/domain/models/*.ts` to use new value objects
- [ ] T021 Move business logic from `src/services/application/novel-management-step.ts` to Novel entity
## Phase 3: Mid-term Improvements (1-2 Months) - Priority 3
### 3.1 Effect TS Migration
- [ ] T022 Update `src/llm/client.ts` to wrap with Effect TS
- [ ] T023 Update `src/llm/structured-client.ts` to use @effect/schema for validation
- [ ] T024 Update `src/services/application/steps/text-analysis-step.ts` to use Effect.tryPromise and catchTag
- [ ] T025 Update `src/agents/chunk-analyzer.ts` to use Effect TS patterns
- [ ] T026 Create `src/layers/cloudflare-env.layer.ts` for Cloudflare bindings
- [ ] T027 Create `src/layers/database.layer.ts` for database services
- [ ] T028 Create `src/layers/llm-client.layer.ts` for LLM clients
- [ ] T029 Create bridge for existing Promise-based code compatibility in Effect TS migration
### 3.2 Interface Separation
- [ ] T030 Create `src/llm/interfaces/chat-client.ts` interface
- [ ] T031 Create `src/llm/interfaces/embedding-client.ts` interface
- [ ] T032 Update `src/types/index.ts` to compose LlmClient from ChatClient and EmbeddingClient
- [ ] T033 [P] Update providers in `src/llm/providers/*.ts` to implement specific interfaces
- [ ] T034 [P] Fix dependencies in services using separated interfaces
### 3.3 Testing Improvements
- [ ] T035 Create `src/__tests__/__helpers__/effect-test-helpers.ts` with mock layers and test utilities
- [ ] T036 [P] Update step tests in `src/__tests__/services/application/steps/*.test.ts` for Effect TS
- [ ] T037 [P] Update agent tests in `src/__tests__/agents/*.test.ts` for Effect TS
- [ ] T038 Update `vitest.config.ts` to support Effect TS testing
- [ ] T039 Add fast-check library to package.json for property-based testing
## Phase 4: Testing and Validation
- [ ] T040 [P] Create unit tests for new domain models in `src/__tests__/domain/*.test.ts`
- [ ] T041 [P] Create unit tests for value objects in `src/__tests__/domain/value-objects/*.test.ts`
- [ ] T042 Update integration tests for refactored services in `tests/integration/service-integration.test.ts`
- [ ] T043 Run comprehensive coverage check with `npm run test:coverage` targeting 90%+
- [ ] T044 Create property-based tests for critical business rules using fast-check
## Phase 5: Documentation and Cleanup
- [ ] T045 [P] Update `docs/refactor-plan0908.md` with completion report
- [ ] T046 [P] Add new commands and settings to `CRUSH.md`
- [ ] T047 Update architecture in `.kiro/specs/novel-to-manga-converter/design.md`
- [ ] T048 Update completed tasks in `.kiro/specs/novel-to-manga-converter/tasks.md`
- [ ] T049 [P] Update `database/storage-structure.md` if storage changes occurred
- [ ] T050 [P] Create performance benchmarks for Effect TS migration
- [ ] T051 [P] Document rollback procedures for major refactors
- [ ] T052 Archive old code patterns and create migration notes
## Dependencies
- Phase 1 (T001-T010) before Phase 2 (T011-T021)
- Phase 2.1 (T011-T015) before Phase 2.2 (T016-T021)
- Phase 2 (T011-T021) before Phase 3 (T022-T039)
- Phase 3.1 (T022-T029) before Phase 3.2 (T030-T034)
- All implementation phases before Phase 4 Testing (T040-T044)
- Phase 4 Testing before Phase 5 Documentation (T045-T052)
## Parallel Example
```
# Launch T001-T005 together (error handling removal across different files):
Task: "Remove fallback error handling in src/services/application/steps/base-step.ts"
Task: "Remove fallback error handling in src/services/application/analyze-pipeline.ts"
Task: "Remove fallback error handling in src/agents/core.ts"
Task: "Remove fallback error handling in all step files under src/services/application/steps/*.ts"
Task: "Add detailed error logging and job status update to 'failed' in base error handling using Effect TS catchAll"

# Launch T006-T009 together (magic number extraction to config):
Task: "Extract remaining hardcoded values in src/lib/canvas/manga-page-renderer.ts to src/config/app.config.ts"
Task: "Extract hardcoded values in src/services/application/steps/rendering-step.ts to src/config/app.config.ts"
Task: "Extract hardcoded values in src/utils/chunk-splitter.ts to src/config/app.config.ts"
Task: "Extract hardcoded values in src/agents/layout-generator.ts to src/config/app.config.ts"

# Launch T016-T019 together (domain value objects creation):
Task: "Create src/domain/novel/entities/novel.ts with factory method and business rules"
Task: "Create src/domain/shared/value-objects/page-range.ts with validation and operations"
Task: "Create src/domain/shared/value-objects/novel-id.ts value object"
Task: "Create src/domain/shared/value-objects/title.ts value object"
```
## Critical Path
The most critical dependencies are:
1. **T001-T005 (Error handling removal)** before any Effect TS changes
2. **T006-T010 (Magic numbers)** before domain model enhancements
3. **T011-T015 (Base step refactor)** before other step updates
4. **T022-T029 (Effect TS migration)** before testing improvements
5. **T040-T044 (Testing)** before documentation (T045-T052)
## Notes
- [P] tasks = different files, no dependencies
- Verify all lint and typecheck pass after each phase: `npm run check`
- Commit after each task for easy rollback
- Focus on gradual Effect TS adoption without breaking existing functionality
- Domain model changes should not affect existing API contracts
- Testing phase must achieve 90%+ coverage before proceeding
- Update CRUSH.md with any new commands or patterns discovered
## Task Generation Rules Applied
### From Priority 1
- Error handling proposals → fallback removal tasks (T001-T005)
- Magic numbers → extraction and config update tasks (T006-T010)
### From Priority 2
- BasePipelineStep → responsibility separation tasks (T011-T015)
- Domain models → entity and value object creation (T016-T021)
### From Priority 3
- Effect TS migration → client updates and layers (T022-T029)
- Interface separation → new interfaces and provider updates (T030-T034)
- Testing → helpers and property tests (T035-T039)
### From Validation
- Testing → unit and integration tests (T040-T044)
- Documentation → updates and cleanup (T045-T052)
## Validation Checklist
- [x] All proposals from refactor-plan0908.md have corresponding tasks
- [x] All mentioned files have change tasks
- [x] Priority levels respected in phases
- [x] Tests come before implementation where applicable
- [x] Parallel tasks truly independent
- [x] Each task specifies exact file path
- [x] No task modifies same file as another [P] task
- [x] Coverage targets specified (90%+)
- [x] Rollback and monitoring procedures included