> Goal: Make **characters stateful across chunks** while keeping all other elements chunk-scoped.
> Deliverables: type definitions, prompt wiring, state engine, merge logic, and final cast summary.

### 0) Versioning & rollout

- Introduce an **Extraction Schema v2** (the JSON defined in the prompt above).
- Keep v1 adapters if needed, but plan to migrate consumers to v2 within the repo.

---

### 1) Data model (TypeScript)

Create/extend types under `src/types/`:

```ts
// Chunk extraction (LLM output)
export type CharacterId = `char_${number}` // Stable IDs assigned by our system
export type TempCharacterId = `temp_char_${number}_${number}` // Provisional IDs from the LLM

export interface CharacterCandidateV2 {
  id: CharacterId | TempCharacterId
  name: string
  aliases: string[]
  description: string // new information from THIS chunk
  firstAppearanceChunk: number | null
  firstAppearance: number | null // index in the target chunk
  possibleMatchIds: { id: CharacterId; confidence: number }[]
}

export interface CharacterEventV2 {
  characterId: CharacterId | TempCharacterId | '不明'
  action: string
  index: number
}

export interface SceneV2 {
  location: string
  time: string | null
  description: string
  startIndex: number
  endIndex: number // exclusive
}

export interface DialogueV2 {
  speakerId: CharacterId | TempCharacterId | '不明'
  text: string
  emotion: string
  index: number
}

export type HighlightType = 'climax' | 'turning_point' | 'emotional_peak' | 'action_sequence'

export interface HighlightV2 {
  type: HighlightType
  description: string
  importance: 1 | 2 | 3 | 4 | 5
  startIndex: number
  endIndex: number
}

export interface SituationV2 {
  description: string
  index: number
}

export interface ExtractionV2 {
  characters: CharacterCandidateV2[]
  characterEvents: CharacterEventV2[]
  scenes: SceneV2[]
  dialogues: DialogueV2[]
  highlights: HighlightV2[]
  situations: SituationV2[]
  pacing?: string
}

// Rolling character memory
export interface CharacterMemory {
  id: CharacterId
  names: Set<string> // canonical + aliases
  firstAppearanceChunk: number // chunk index where first seen
  summary: string // rolling summary across chunks (~400–700 chars)
  status?: 'alive' | 'dead' | 'missing' | 'unknown'
  relationships: Map<CharacterId, string> // brief notes
  timeline: { chunkIndex: number; action: string; index: number }[]
  lastSeenChunk: number
}

export type CharacterMemoryIndex = Map<CharacterId, CharacterMemory>
export type AliasIndex = Map<string /*lowercased*/, CharacterId>
```

---

### 2) Prompt wiring

- Update `textAnalysis.systemPrompt` and `textAnalysis.userPromptTemplate` to the **Japanese v2** above.
- **Inputs to the template**:
  - `previousCharacterMemoryJson`: a compact JSON snapshot with only essential fields (id, known names/aliases, short summary ≤ 200 chars, lastSeenChunk). Keep it ≤ \~3–5k tokens per call by:
    - including only characters seen in the last **K** chunks (e.g., K=10–20),
    - plus **top N prominent** characters overall (e.g., N=10) determined by dialogue/event frequency.

- Ensure indices: 0-based, `endIndex` exclusive.

---

### 3) State engine (merge & upsert)

Create `src/character/state.ts` with core functions:

```ts
export function normalizeName(n: string): string {
  /* lower + trim + kana/width fold if needed */
}

export function allocateCharacterId(nextIdCounter: () => number): CharacterId {
  return `char_${nextIdCounter()}`
}

export function findMatchesByName(
  aliasIdx: AliasIndex,
  candidate: CharacterCandidateV2,
): CharacterId[] {
  /* lookup name + aliases */
}

export function mergeTempIntoStable(
  mem: CharacterMemoryIndex,
  tempId: TempCharacterId,
  stableId: CharacterId,
  candidate: CharacterCandidateV2,
): void {
  /* move/merge; update aliases, summary, firstAppearance if earlier */
}

export function upsertFromCandidate(
  mem: CharacterMemoryIndex,
  aliasIdx: AliasIndex,
  candidate: CharacterCandidateV2,
  nowChunk: number,
  nextIdCounter: () => number,
  threshold = 0.75,
): CharacterId {
  /* 1) resolve by possibleMatchIds >= threshold
                     2) alias lookup (normalizeName)
                     3) else allocate new stable ID */
}

export function recordEvents(
  mem: CharacterMemoryIndex,
  events: CharacterEventV2[],
  chunkIndex: number,
  idMap: Map<TempCharacterId, CharacterId>,
): void {
  /* append to timelines; update lastSeenChunk */
}

export function summarizeMemory(mem: CharacterMemoryIndex, charId: CharacterId): void {
  /* keep rolling summary < ~700 chars (trim older details) */
}
```

Pipeline step after each chunk:

1. Parse `ExtractionV2`.
2. Build `temp→stable` map:
   - For each `characters` item:
     - If `id` is `char_*`, ensure it exists; update summary/aliases if new info.
     - If `id` is `temp_char_*`, call `upsertFromCandidate(...)`, store mapping.

3. Rewrite `characterEvents` / `dialogues` speaker IDs via the map.
4. `recordEvents(...)`.
5. Persist `character_memory.json` (compact form for next prompt + full form on disk).

---

### 4) Dialogue speaker resolution

- If `speakerId` is `"不明"`, attempt a heuristic pass **after** LLM:
  - Prefer last explicitly named speaker within a sliding window ±N lines.
  - Use nearby verbs like 「〜と言った」「〜が叫んだ」 and preceding named entity.
  - If still ambiguous, keep `"不明"`.

---

### 5) Schema validation

- Add a Zod (or `typia`) validator under `src/validation/extractionV2.ts`.
- **Reject any unknown fields** and enforce index types.
- Unit tests: load sample LLM outputs and validate.

---

### 6) Final cast list synthesis

Create `src/character/finalize.ts`:

- Input: `CharacterMemoryIndex`.
- Output: array of `{ id, displayName, aliases, firstAppearanceChunk, summary, majorActions[] }`.
- `majorActions` = timeline entries clustered by topic; use a small LLM prompt to compress per character into **3–7 bullet points** (“what they did in the story”).
- Ensure deterministic ordering (by firstAppearanceChunk, then frequency).

---

### 7) Storage & performance

- Persist two files:
  - `data/character_memory.full.json` (complete memory).
  - `data/character_memory.prompt.json` (trimmed fields, size-capped).

- Implement a **sliding window** and **top-N prominence** to constrain prompt size.
- Optional: cache per-chunk extractions to avoid recomputation.

---

### 8) Error handling & logging

- Log decisions:
  - when a temp ID merges into a stable ID,
  - confidence scores used,
  - alias conflicts.

- Provide a diff view per chunk (added/updated characters, events).

---

### 9) Developer ergonomics

- Add CLI commands:
  - `pnpm chunk:extract <path>`
  - `pnpm char:dump` (prints current memory summary)
  - `pnpm char:reset`

- Add fixtures under `tests/fixtures/` with short novellas to test end-to-end.

---

### 10) Migration notes

- Consumers expecting the old schema must be updated:
  - Add support for `characterEvents` and the new `characters` fields.
  - `highlights.importance` now treated as 1–5.

- If you previously relied on `characters` to list **all** appearing persons per chunk, switch to:
  - `characterEvents` (everyone who acted/was mentioned),
  - `dialogues` (speakers),
  - and keep `characters` for **new or newly-updated** persons only.

---

### 11) QA checklist

- [ ] Unknown fields rejected at validation time.
- [ ] All indices 0-based; `endIndex` exclusive.
- [ ] No non-JSON output from the LLM.
- [ ] New characters always have `temp_char_*` until merged.
- [ ] Final cast list shows “who did what” with 3–7 bullets each.

---

#### Suggested file layout (adjust to your repo):

```
src/
  types/
    extractionV2.ts
  validation/
    extractionV2.ts
  character/
    state.ts
    finalize.ts
  pipeline/
    runChunk.ts
    merge.ts
data/
  character_memory.full.json
  character_memory.prompt.json
tests/
  fixtures/
  unit/
```
