# V2 Schema Migration Tasks

## Overview

Migration to Extraction Schema v2 - Making characters stateful across chunks.

## Task List

### 1) Data model (TypeScript)

- [ ] Create `src/types/extractionV2.ts` with new type definitions
  - [ ] Define CharacterId and TempCharacterId types
  - [ ] Define CharacterCandidateV2 interface
  - [ ] Define CharacterEventV2 interface
  - [ ] Define SceneV2 interface
  - [ ] Define DialogueV2 interface
  - [ ] Define HighlightV2 interface with importance 1-5
  - [ ] Define SituationV2 interface
  - [ ] Define ExtractionV2 interface
  - [ ] Define CharacterMemory interface
  - [ ] Define CharacterMemoryIndex and AliasIndex types

### 2) Prompt wiring ✅

- [x] Update textAnalysis.systemPrompt to Japanese v2 schema
- [x] Update textAnalysis.userPromptTemplate to support previousCharacterMemoryJson
- [x] Implement token size management for character memory (3-5k tokens max)

### 3) State engine (merge & upsert)

- [ ] Create `src/character/state.ts` with core functions
  - [ ] Implement normalizeName function
  - [ ] Implement allocateCharacterId function
  - [ ] Implement findMatchesByName function
  - [ ] Implement mergeTempIntoStable function
  - [ ] Implement upsertFromCandidate function
  - [ ] Implement recordEvents function
  - [ ] Implement summarizeMemory function

### 4) Dialogue speaker resolution ✅

- [x] Implement heuristic speaker resolution for "不明" cases
- [x] Add sliding window approach for speaker detection
- [x] Add verb-based speaker detection

### 5) Schema validation

- [ ] Create `src/validation/extractionV2.ts`
- [ ] Add Zod validators for all V2 types
- [ ] Add unit tests for validation
- [ ] Reject unknown fields

### 6) Final cast list synthesis

- [ ] Create `src/character/finalize.ts`
- [ ] Implement character summary generation
- [ ] Implement major actions extraction (3-7 bullet points)
- [ ] Add deterministic ordering

### 7) Storage & performance ✅

- [x] Implement character_memory.full.json persistence
- [x] Implement character_memory.prompt.json (trimmed version)
- [x] Add sliding window mechanism
- [x] Add top-N prominence tracking

### 8) Error handling & logging ✅

- [x] Add logging for temp->stable ID merges
- [x] Add confidence score logging
- [x] Add alias conflict detection
- [x] Add diff view per chunk
- [x] Enhanced structured logging with metrics
- [x] Performance tracking
- [x] Error recovery with retry logic

### 9) Developer ergonomics

- [ ] Add `pnpm chunk:extract <path>` command
- [ ] Add `pnpm char:dump` command
- [ ] Add `pnpm char:reset` command
- [ ] Add test fixtures

### 10) Migration notes

- [ ] Update existing consumers to support new schema
- [ ] Add backward compatibility layer if needed
- [ ] Document migration steps

### 11) QA checklist

- [ ] Verify unknown fields are rejected
- [ ] Verify 0-based indices with exclusive endIndex
- [ ] Verify no non-JSON output from LLM
- [ ] Verify temp*char*\* ID assignment
- [ ] Verify final cast list generation

## Progress Log

### 2024-12-XX - Major Progress

- Created migration task document
- ✅ Completed Task 1: Data model implementation (extractionV2.ts)
- ✅ Completed Task 3: State engine implementation (state.ts)
- ✅ Completed Task 5: Schema validation (validation/extractionV2.ts)
- ✅ Completed Task 6: Final cast synthesis (finalize.ts)
- ✅ Completed Task 7: Storage & persistence (persistence.ts)
- ✅ Completed Task 2: Prompt wiring (prompts/extractionV2.ts)
- Created pipeline integration (pipeline/extractionV2Pipeline.ts)
- Created V2 text analysis step (text-analysis-step-v2.ts)

### Next Steps

- Task 9: Developer ergonomics (CLI commands)
- Task 11: QA and testing

### Completed Major Milestones

- ✅ Core V2 data model and types
- ✅ Character state management engine
- ✅ Schema validation with Zod
- ✅ Character memory persistence
- ✅ Final cast list generation
- ✅ Prompt system for V2
- ✅ Speaker resolution heuristics
- ✅ Enhanced logging and metrics
- ✅ Integrated pipeline with all features

---

Last updated: [timestamp]
