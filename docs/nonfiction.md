# Update Plan — `matsuvr/novel2manga-ts`

**Feature set:** (1) short-input handling, (2) “is this a story?” judging, (3) non-narrative branch that generates 2–3 explainer characters and writes an explanatory (learning) manga script.

---

## Implementation Status

- InputValidationStep now validates text length and classifies narrativity.
- Configuration flags for `validation`, `expansion`, and `nonNarrative` are available via `app.config.ts`.

## Design Doc (for coding AIs)

### 1) Where these changes plug into the current app

- **Config-first:** New thresholds/flags go into `src/config/app.config.ts` (env-overridable via `getAppConfigWithOverrides`). This file already centralizes app settings and supports env overrides. &#x20;
- **Default LLM provider + fallback:** Use the existing provider accessors in `src/config/llm.config.ts` and the router in `src/agents/llm/router.ts`. Don’t hardcode a provider. Call the “default” and “fallback chain” selectors. &#x20;
- **Current pipeline entry points:**
  - Upload flow: `POST /api/novel` calls `processNovelUpload()` and returns a standard JSON success/error. We’ll hook validation _before_ kicking off heavy steps.&#x20;
  - Analyze flow: `POST /api/analyze` orchestrates Text Analysis etc. Our new “InputValidationStep” will run at the very start.&#x20;

- **Script conversion already reads character memory snapshots and can accept a `charactersList` into the prompt flow (no need to reinvent):** `ScriptConversionStep` loads a character snapshot and passes it into `convertChunkToMangaScript`. We will seed that snapshot for non-narrative (“explainer”) runs. &#x20;

---

### 2) New configuration (no magic numbers)

Add to `src/config/app.config.ts` (and surface via `getAppConfigWithOverrides`):

```ts
validation: {
  minInputChars: 1000,         // threshold for “too short”
  narrativeJudgeEnabled: true, // toggle LLM classification
},
expansion: {
  enabled: true,
  targetScenarioChars: 3000,   // when user OKs AI expansion
},
nonNarrative: {
  enabled: true,
  defaultExplainerCount: [2, 3], // min–max explainer characters
}
```

These values remain env-overridable the same way chunking/logging flags are today. &#x20;

---

### 3) Input validation & classification (new step)

**New step:** `src/services/application/steps/input-validation-step.ts`

Responsibility:

1. **Length check** (pure function):
   - if `text.length < validation.minInputChars` ⇒ return `{ status: 'SHORT', askUser: 'EXPAND_OK?' }`.

2. **Narrative vs non-narrative classification** (LLM, default provider):
   - Only run when length is sufficient and `narrativeJudgeEnabled` true.
   - Use the default provider and existing selection pipeline (default + fallback). &#x20;
   - Output schema (JSON):

     ```json
     {
       "isNarrative": true|false,
       "kind": "novel|play|rakugo|nonfiction|report|manual|other",
       "confidence": 0..1,
       "reason": "short explanation"
     }
     ```

   - Treat **novel / fiction / play / rakugo** as narrative.
   - Edge: if LLM fails, default to `isNarrative=true` (minimize friction).

3. **Result to UI**: Step returns one of:
   - `OK` (proceed normally)
   - `NEEDS_USER_CONSENT_EXPANSION`
   - `NEEDS_USER_CONSENT_EXPLAINER_MANGA`

**Wiring:** Prepend `InputValidationStep` to `AnalyzePipeline` (before chunking). The current analyze route is already the orchestrator we’ll extend.&#x20;

---

### 4) Short-text branch (user OKs AI expansion)

**UX:** After `/api/novel` or `/api/analyze`, the server returns a `requiresAction` payload. The UI shows a modal:

> “Your text looks very short. Shall we let AI brainstorm a \~3000-char scenario based on your input and proceed to manga?”

**On OK:**
New handler `POST /api/consent/expand`:

- Uses default provider via LLM router (no hardcode).&#x20;
- Prompt (system): “Rewrite as a concise, coherent scenario (JP), aim \~3000 characters, suitable for manga adaptation.”
- Replace the novel text in the job context with the AI-expanded scenario and proceed to the normal pipeline (episode detection → chunking → script conversion).
  **Note:** The normal pipeline already exists; we just swap the source text before chunking.

---

### 5) Non-narrative branch (user OKs explanatory manga)

**UX:** Modal:

> “This looks like non-fiction (e.g., report/manual). Shall we turn it into a learning/explanatory manga?”

**On OK:**

1. **Explainer character generation:** Use default provider; produce 2–3 recurring explainer personas with: `id`, `name`, `role` (e.g., Teacher/Student/Skeptic), `voice`, `style`, `quirks`, `goal`.
2. **Seed character memory:** The codebase already has robust character memory state and snapshot saving; we will seed that snapshot before script conversion so the characters appear consistently across chunks. &#x20;
   - Use `src/character/state.ts` helpers and the existing memory config to build/merge memory entries.&#x20;

3. **Chunked script generation:** The existing conversion step (`ScriptConversionStep`) will include the characters (from snapshot) and produce scripts per chunk as usual. &#x20;

**Important:** Only the _script_ changes (explainer cast tone). Downstream page split/layout/render pipeline is unchanged.

---

### 6) API & UI changes

- **Server**
  - `POST /api/novel` / `POST /api/analyze`:
    - If validation returns a consent requirement, respond `200` with `{ requiresAction: 'EXPAND'|'EXPLAINER', jobId, suggest: {...} }` using the existing success response model.&#x20;

  - `POST /api/consent/expand`: takes `jobId`, performs AI expansion, resumes pipeline from analyze stage.
  - `POST /api/consent/explainer`: takes `jobId`, generates characters, seeds memory, resumes normal pipeline.

- **Client**
  - Add a small state machine above the existing “Start analyze” button flow:
    - When `requiresAction` is present, show a modal; on OK, hit the corresponding consent endpoint; on Cancel, abort and show a link to “Try another text”.

(Existing UI components like `TextInputArea` / `ScenarioViewer` and current routes stay; we only add the modal + two consent calls.)

---

### 7) Prompts (sketches)

- **Narrativity Judge (system):**
  “You are a classifier. Decide if the input is _narrative fiction_ (novel, short story, play, rakugo, etc.) or _non-fiction_. Output strict JSON {isNarrative, kind, confidence, reason}. Japanese inputs expected; reply in JSON only.”

- **AI Expansion (system):**
  “Write a Japanese scenario (\~3000 characters) inspired by the user text. Make it coherent, manga-friendly, with clear scenes and conflicts. No images, no formatting; plain text only.”

- **Explainer Characters (system):**
  “Create 2–3 Japanese ‘explainer’ personas to teach the content (roles, voice, quirks). Output strict JSON array. These characters will appear consistently across chunks.”

---

### 8) Data model & storage

- **No schema migration required** if we seed character memory via the existing character memory snapshot utilities; Script conversion already fetches a snapshot per chunk.&#x20;
- **Job metadata**: store minimal validation result (e.g., `job.validation = { status: 'SHORT'|'NON_NARRATIVE'|'OK' }`) so resuming is safe. Uses the existing job/progress infra. (The project already maintains job steps/progress.)&#x20;

---

### 9) Failure modes & fallbacks

- LLM errors on classification → default to narrative (continue normally).
- LLM errors on character generation → retry once; on failure, fallback to a stock 2-character set (Teacher/Student) hardcoded in code.
- LLM errors on expansion → show error to user; allow retry or cancel.

---

### 10) Security & configuration

- Use the existing provider/limits abstraction only; never embed keys or per-provider logic in steps. (See `llm.config.ts`.)&#x20;
- Provider selection uses the config accessors (default + fallback). &#x20;

---

## Task Table (issue-sized units)

| #   | Scope    | Task                                                                                                                                                     | Files (indicative)                                                                                          | Acceptance Criteria                                                                                                                                                                                                                                   |
| --- | -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Config   | Add `validation`, `expansion`, `nonNarrative` blocks to `app.config.ts` + env overrides (e.g., `APP_VALIDATION_MIN_INPUT_CHARS`, etc.).                  | `src/config/app.config.ts`                                                                                  | Values live under config; can be overridden via env; unit test proves override.                                                                                                                                                                       |
| 2   | Backend  | **InputValidationStep**: implement length check + LLM narrativity judge (JSON).                                                                          | `src/services/application/steps/input-validation-step.ts`, wire into `analyze/route.ts`                     | For short input → returns `NEEDS_USER_CONSENT_EXPANSION`; for non-narrative → `NEEDS_USER_CONSENT_EXPLAINER`; else `OK`.                                                                                                                              |
| 3   | Backend  | Add consent endpoints: `POST /api/consent/expand`, `POST /api/consent/explainer`.                                                                        | `src/app/api/consent/expand/route.ts`, `src/app/api/consent/explainer/route.ts`                             | On `expand`, a \~3000-char scenario is generated via default LLM and stored as the working text, then pipeline resumes. On `explainer`, characters JSON is generated and seeded, then pipeline resumes. Responses use existing success/error helpers. |
| 4   | Backend  | **Explainer character seeding**: build utilities to write explainer characters into character memory snapshot format consumed by `ScriptConversionStep`. | `src/character/persistence.ts` (or new `seeding.ts`), `src/character/snapshot.ts`, `src/character/state.ts` | After seeding, `ScriptConversionStep` sees non-empty `charactersList` and uses it in `convertChunkToMangaScript`. Script output contains those characters across chunks.                                                                              |
| 5   | Backend  | **LLM calls** reuse default + fallback via router (no provider hardcoding).                                                                              | `src/agents/llm/router.ts`, `src/config/llm.config.ts`                                                      | Calls pick `getLLMDefaultProvider()` and fallback chain; smoke tests pass regardless of which provider is configured currently.                                                                                                                       |
| 6   | Frontend | Show consent modal when server returns `requiresAction`. Buttons call the new endpoints; keep existing progress UI.                                      | `src/app/(ui)/*` (modal component), hook into the flows that currently call `/api/novel`→`/api/analyze`.    | If short: modal “AI expand?” → on OK proceeds; If non-narrative: modal “explanatory manga?” → on OK proceeds. Cancel aborts.                                                                                                                          |
| 7   | Prompts  | Add three prompt templates (judge / expansion / explainer cast) with strict JSON schemas.                                                                | `src/prompts/*`                                                                                             | Unit tests validate JSON parse, field presence.                                                                                                                                                                                                       |
| 8   | Tests    | Unit: validation (short vs long), classification (mock LLM), character seeding, consent endpoints.                                                       | `tests/**`                                                                                                  | 90%+ coverage for new modules; golden tests prove explainer cast persists across 2+ chunks.                                                                                                                                                           |
| 9   | E2E      | Two flows: (A) short input → expand → normal pipeline, (B) non-narrative → explainer cast → normal pipeline.                                             | `e2e/**`                                                                                                    | Final result reaches script conversion; pages render as before. (Layout/render pipeline remains unchanged.)                                                                                                                                           |
| 10  | Docs     | Update README / internal design notes: new flags, endpoints, and flow chart.                                                                             | `README.md`, `.kiro/specs/**`                                                                               | Docs explain how/when modals appear; how to toggle features.                                                                                                                                                                                          |

---

## Notes for implementers

- **Do not change the downstream pipeline.** Once a chunk’s **Script** exists, everything else (page split/layout/render) is identical and already stable. (Episode/layout batching and progress storage were recently improved; leave them be.) &#x20;
- **Leverage character memory as-is.** Seed a snapshot so `ScriptConversionStep` keeps characters consistent chunk-to-chunk.&#x20;
- **Stay config-driven** for thresholds and LLM selection (default + fallback). &#x20;

Awesome—here are concrete **TypeScript interfaces** and **prompt modules** you can drop in. Everything is written for coding AIs and assumes you’re using the “default” LLM provider upstream (router already in your codebase). I use **Zod** for output validation; if you’re not using it yet, add it:

```bash
pnpm add zod
# or: npm i zod / yarn add zod
```

---

# `src/types/validation.ts`

```ts
import { z } from 'zod'

/** High-level result of the new InputValidationStep. */
export type InputValidationStatus = 'OK' | 'SHORT' | 'NON_NARRATIVE' | 'LLM_ERROR'

/** Coarse classification of text kind. */
export type NarrativeKind =
  | 'novel'
  | 'short_story'
  | 'play'
  | 'rakugo'
  | 'nonfiction'
  | 'report'
  | 'manual'
  | 'other'

/** JSON returned by the narrativity judge prompt. */
export interface NarrativeJudgeResult {
  isNarrative: boolean
  kind: NarrativeKind
  confidence: number // 0..1
  reason: string // brief classifier rationale
}

/** Zod schema for safe parsing of NarrativeJudgeResult JSON. */
export const NarrativeJudgeSchema = z.object({
  isNarrative: z.boolean(),
  kind: z.enum([
    'novel',
    'short_story',
    'play',
    'rakugo',
    'nonfiction',
    'report',
    'manual',
    'other',
  ]),
  confidence: z.number().min(0).max(1),
  reason: z.string().min(1),
})

/** Server → client hint when consent is required. */
export type ConsentRequired =
  | 'EXPAND' // short input → ask to let AI expand to ~3000 chars
  | 'EXPLAINER' // non-narrative → ask to convert to learning manga

export interface ValidationOutcome {
  status: InputValidationStatus
  consentRequired?: ConsentRequired
  judge?: NarrativeJudgeResult
}
```

---

# `src/types/characters.ts`

```ts
import { z } from 'zod'

/** Minimal per-character spec for explanatory manga. */
export interface ExplainerCharacter {
  id: string // stable within a job
  name: string // short, distinct
  role: 'Teacher' | 'Student' | 'Skeptic' | 'Expert' | 'Narrator' | 'Other'
  voice: string // tone register and typical phrasing (JP)
  style: string // mannerisms, pacing (JP)
  quirks?: string // small memorable traits (JP)
  goal?: string // what they try to get across (JP)
}

/** Zod schema for parsing the array returned by the character prompt. */
export const ExplainerCharactersSchema = z
  .array(
    z.object({
      id: z.string().min(1),
      name: z.string().min(1),
      role: z.enum(['Teacher', 'Student', 'Skeptic', 'Expert', 'Narrator', 'Other']),
      voice: z.string().min(1),
      style: z.string().min(1),
      quirks: z.string().optional(),
      goal: z.string().optional(),
    }),
  )
  .min(2)
  .max(3)

/** Snapshot shape that ScriptConversionStep expects (keep simple & explicit). */
export interface CharacterMemorySnapshot {
  charactersList: Array<{
    id: string
    name: string
    role: string
    persona: {
      voice: string
      style: string
      quirks?: string
      goal?: string
    }
  }>
}

/** Helper to convert ExplainerCharacter[] → CharacterMemorySnapshot. */
export function toCharacterSnapshot(chars: ExplainerCharacter[]): CharacterMemorySnapshot {
  return {
    charactersList: chars.map((c) => ({
      id: c.id,
      name: c.name,
      role: c.role,
      persona: {
        voice: c.voice,
        style: c.style,
        quirks: c.quirks,
        goal: c.goal,
      },
    })),
  }
}
```

---

# `src/types/config.extension.ts`

```ts
/** Extend your existing AppConfig with new feature flags (no magic numbers). */
export interface ValidationConfig {
  minInputChars: number // e.g., 1000
  narrativeJudgeEnabled: boolean // toggle LLM classification
}

export interface ExpansionConfig {
  enabled: boolean
  targetScenarioChars: number // e.g., 3000
}

export interface NonNarrativeConfig {
  enabled: boolean
  defaultExplainerCount: [number, number] // [2,3]
}

export interface AppConfigExtension {
  validation: ValidationConfig
  expansion: ExpansionConfig
  nonNarrative: NonNarrativeConfig
}
```

---

# `src/prompts/narrativityJudge.prompt.ts`

```ts
import { z } from 'zod'
import { NarrativeJudgeSchema } from '@/types/validation'

/**
 * System message: strict JSON-only classifier.
 * - Japanese inputs common; response must be JSON ONLY (no extra text).
 * - “Narrative” includes novel / short story / play / rakugo.
 */
export const NARRATIVITY_JUDGE_SYSTEM = `
You are a strict JSON-only classifier.
Decide if the input text is NARRATIVE FICTION (novel / short story / play / rakugo) or NON-FICTION (manual / report / textbook / news / blog / etc.).
Output ONLY compact JSON with fields: isNarrative (boolean), kind (one of: novel, short_story, play, rakugo, nonfiction, report, manual, other), confidence (0..1), reason (<=160 chars JP).
NO prose, NO markdown—JSON ONLY.
`.trim()

export function buildNarrativityJudgeUser(inputText: string): string {
  return `
【判定対象テキスト】
${inputText}
`.trim()
}

/** Optional guard to post-validate model output with Zod. */
export function parseNarrativityJudge(jsonText: string) {
  const parsed = JSON.parse(jsonText)
  return NarrativeJudgeSchema.parse(parsed)
}

/** Suggested temperature / style for router call */
export const NARRATIVITY_JUDGE_GEN_CFG = {
  temperature: 0.0,
  maxTokens: 256,
}
```

---

# `src/prompts/aiExpansion.prompt.ts`

```ts
/**
 * Expands short input into a ~N-char manga-suitable scenario (Japanese).
 * - Plain text only, no headings, no bullet lists, no JSON.
 * - Keep coherent scenes, conflict–development–resolution, manga-friendly beats.
 */
export function buildAIExpansionSystem(targetChars: number) {
  return `
あなたは熟練の脚本家です。ユーザーの短い入力を手がかりに、
約${targetChars}文字の日本語のシナリオ（マンガ化しやすい地の文）を書いてください。
- 箇条書き・見出し・JSONは禁止。段落のみ。
- 明確な起承転結、場面転換、セリフ候補を含む地の文（カギ括弧はOK）。
- 過剰な固有名詞・世界観の広げすぎは避け、1話完結で読後感を残す。
`.trim()
}

export function buildAIExpansionUser(shortInput: string) {
  return `
【ヒントとなる入力】
${shortInput}

【要件】
- 日本語
- 約指定文字数（±10%）を目安
- 地の文の中にセリフ候補も自然に織り交ぜる
- 出力はプレーンテキストのみ
`.trim()
}

/** Suggested generation config */
export const AI_EXPANSION_GEN_CFG = {
  temperature: 0.7,
  maxTokens: 2048, // adjust for model/tokenizer
}
```

---

# `src/prompts/explainerCharacters.prompt.ts`

```ts
import { z } from 'zod'
import { ExplainerCharactersSchema } from '@/types/characters'

/**
 * Creates 2–3 explainer personas for a learning/explanatory manga.
 * Output must be a JSON array of 2–3 items (ExplainerCharacter).
 * Language: Japanese for all textual fields.
 */
export const EXPLAINER_CHARS_SYSTEM = `
You create memorable teaching personas for a Japanese learning comic.
Constraints:
- Output STRICT JSON array of 2–3 objects with fields:
  id, name, role ("Teacher"|"Student"|"Skeptic"|"Expert"|"Narrator"|"Other"), voice, style, quirks?, goal?
- Keep names short and distinct. Keep voices/styles concise (<= 120 JP chars each).
- JSON ONLY. No markdown, no prose.
`.trim()

export function buildExplainerCharsUser(contentSummary: string) {
  return `
【題材の要約／トピック】
${contentSummary}

【目的】
読者（初学者）にわかりやすく、テンポ良く、誤解なく要点を説明する。
`.trim()
}

export function parseExplainerChars(jsonText: string) {
  const parsed = JSON.parse(jsonText)
  return ExplainerCharactersSchema.parse(parsed)
}

/** Suggested generation config */
export const EXPLAINER_CHARS_GEN_CFG = {
  temperature: 0.6,
  maxTokens: 512,
}
```

---

# `src/prompts/explainerScript.prompt.ts`

```ts
/**
 * Generates a chunk-level script using the previously created explainer characters.
 * Input:
 *  - chunkText: The source non-fiction chunk to explain
 *  - castBrief: Compact description of the characters (id, name, role, voice/style)
 * Output:
 *  - Plain Japanese script text (no JSON), ready for your ScriptConversionStep.
 *    Keep character lines explicit: 「名前：セリフ」 or similar consistent format.
 */
export function buildExplainerScriptSystem() {
  return `
あなたは教育マンガの脚本家です。
与えられた登場人物（解説役）を統一した人格で用いながら、指定された文章チャンクを
初学者にわかるように説明する日本語の脚本を書いてください。

- 出力はプレーンテキストのみ。見出しやJSONは禁止。
- キャラ名を明示したセリフ形式を基本に、適宜ナレーション（N: …）も使用可。
- 誤情報を避け、与えられた内容を漏らさず、順序を可能な限り保持する。
- 1チャンクあたり 400–800字目安（モデルに合わせて調整可）。
- 前後チャンクとの整合性のため、定義済みのキャラクター性（口調・関係性）を崩さない。
`.trim()
}

export function buildExplainerScriptUser(
  chunkText: string,
  castBrief: Array<{ id: string; name: string; role: string; voice: string; style: string }>,
) {
  const castBlock = castBrief
    .map((c) => `- ${c.name} (${c.role})｜声: ${c.voice}｜話し方: ${c.style}｜ID: ${c.id}`)
    .join('\n')

  return `
【使用する登場人物】
${castBlock}

【このチャンクの元テキスト】
${chunkText}

【要件】
- 日本語 / プレーンテキスト
- セリフ形式を中心に、ナレーション（N: …）も可
- 重要な用語を初出で自然に簡潔に説明
- 誤りが疑わしい箇所は断定を避け、前後とつなげられる伏線を軽く置く
`.trim()
}

/** Suggested generation config */
export const EXPLAINER_SCRIPT_GEN_CFG = {
  temperature: 0.5,
  maxTokens: 1024, // tune by chunking size
}
```

---

## (Optional) tiny usage example

```ts
// In your step or route, using your existing LLM router:
import {
  NARRATIVITY_JUDGE_SYSTEM,
  buildNarrativityJudgeUser,
  parseNarrativityJudge,
} from '@/prompts/narrativityJudge.prompt'
import { buildAIExpansionSystem, buildAIExpansionUser } from '@/prompts/aiExpansion.prompt'
import {
  EXPLAINER_CHARS_SYSTEM,
  buildExplainerCharsUser,
  parseExplainerChars,
} from '@/prompts/explainerCharacters.prompt'
import { toCharacterSnapshot } from '@/types/characters'

// pseudo-LLM call (replace with your router)
async function callDefaultLLM(
  messages: Array<{ role: 'system' | 'user'; content: string }>,
): Promise<string> {
  // ... your existing default-provider call here
  return ''
}

// 1) Judge
const judgeJson = await callDefaultLLM([
  { role: 'system', content: NARRATIVITY_JUDGE_SYSTEM },
  { role: 'user', content: buildNarrativityJudgeUser(inputText) },
])
const judge = parseNarrativityJudge(judgeJson)

// 2A) Short → expand
const expanded = await callDefaultLLM([
  { role: 'system', content: buildAIExpansionSystem(cfg.expansion.targetScenarioChars) },
  { role: 'user', content: buildAIExpansionUser(inputText) },
])

// 2B) Non-narrative → characters
const charsJson = await callDefaultLLM([
  { role: 'system', content: EXPLAINER_CHARS_SYSTEM },
  { role: 'user', content: buildExplainerCharsUser(summaryOrTitle) },
])
const chars = parseExplainerChars(charsJson)
const snapshot = toCharacterSnapshot(chars)
// …persist snapshot and proceed to chunked script generation
```

---

### Notes

- Output-language is **Japanese** for user-facing script content.
- All JSON-producing prompts are **strict JSON only** to simplify parsing.
- Keep the downstream pipeline unchanged: once you have a `Script` per chunk, the rest of your rendering flow should behave as before.

Below is a **Gemini-safe validation kit** you can drop into `novel2manga-ts`. It does two things:

1. **Builds extremely tolerant response schemas** (OpenAPI-subset) that Gemini reliably accepts — no `minimum`/`maximum`, no deep nesting, conservative enums, always `propertyOrdering`. ([Google AI for Developers][1], [Google Cloud][2])
2. **Locally validates & coerces** the model output (fixing JSON fences, trailing commas, type mismatches, missing fields, overlong arrays, etc.), so you stay strict in your app without triggering Gemini schema errors upstream. These guardrails reflect Google’s guidance to keep schemas simple and to avoid over-constraints that often lead to `InvalidArgument: 400`. ([Google AI for Developers][1], [Cloud Docs][3])

> Heads-up: Don’t paste JSON schemas into the text prompt when you’re using `responseSchema`. Gemini docs and community write-ups report worse results if you “duplicate” the schema in the prompt. ([Google AI for Developers][1], [MNTSQ Techブログ][4])

---

# 1) Tiny Schema Builder (Gemini-safe)

Create `src/gemini/schema-safe.ts`:

```ts
// A tiny builder for Gemini's OpenAPI-subset "responseSchema" (JS/TS).
// Design goals: ultra-simple, no min/max, no deep nesting, stable propertyOrdering.

type GType = 'STRING' | 'NUMBER' | 'BOOLEAN' | 'ARRAY' | 'OBJECT'

export type GeminiSchema =
  | { type: 'STRING'; enum?: string[]; nullable?: boolean; format?: string }
  | { type: 'NUMBER'; nullable?: boolean; format?: string }
  | { type: 'BOOLEAN'; nullable?: boolean }
  | { type: 'ARRAY'; items: GeminiSchema; nullable?: boolean } // (no min/max here; enforce in app)
  | {
      type: 'OBJECT'
      properties: Record<string, GeminiSchema>
      required?: string[] // use sparingly; Gemini treats missing fields loosely
      propertyOrdering?: string[]
      nullable?: boolean
    }

// Helpers
export const str = (opts: { enum?: string[]; format?: string } = {}): GeminiSchema => ({
  type: 'STRING',
  ...(opts.enum ? { enum: opts.enum } : {}),
  ...(opts.format ? { format: opts.format } : {}),
})
export const num = (): GeminiSchema => ({ type: 'NUMBER' })
export const bool = (): GeminiSchema => ({ type: 'BOOLEAN' })
export const arr = (items: GeminiSchema): GeminiSchema => ({ type: 'ARRAY', items })
export const obj = (
  properties: Record<string, GeminiSchema>,
  required?: string[],
  propertyOrdering?: string[],
): GeminiSchema => ({
  type: 'OBJECT',
  properties,
  ...(required && required.length ? { required } : {}),
  ...(propertyOrdering && propertyOrdering.length ? { propertyOrdering } : {}),
})

// ---------- Concrete, safe schemas for your three endpoints ----------

// 1) Narrativity judge (keep numbers simple; no min/max)
export const SchemaNarrativityJudge: GeminiSchema = obj(
  {
    isNarrative: bool(),
    kind: str({
      enum: ['novel', 'short_story', 'play', 'rakugo', 'nonfiction', 'report', 'manual', 'other'],
    }),
    confidence: num(), // we coerce locally if the model returns a string
    reason: str(),
  },
  ['isNarrative', 'kind', 'confidence', 'reason'],
  ['isNarrative', 'kind', 'confidence', 'reason'],
)

// 2) Explainer characters (no min/maxItems in schema; enforce 2–3 in app)
export const SchemaExplainerCharacters: GeminiSchema = arr(
  obj(
    {
      id: str(),
      name: str(),
      role: str({ enum: ['Teacher', 'Student', 'Skeptic', 'Expert', 'Narrator', 'Other'] }),
      voice: str(),
      style: str(),
      quirks: str(),
      goal: str(),
    },
    ['id', 'name', 'role', 'voice', 'style'],
    ['id', 'name', 'role', 'voice', 'style', 'quirks', 'goal'],
  ),
)

// 3) Enum-only case example (if you need yes/no): set responseMimeType "text/x.enum"
export const EnumYesNo = str({ enum: ['yes', 'no'] })

// Utility to attach schema to Gemini config
export function asGeminiConfig(schema: GeminiSchema) {
  return {
    responseMimeType: 'application/json',
    responseSchema: schema,
  }
}
```

**Why this subset?** Google’s docs say the API supports only a subset of OpenAPI fields for structured output, encourages `propertyOrdering`, and warns that complex constraints (many `min/max`, long enums, deep nesting) trigger 400s or degraded quality — so we avoid them and validate client-side. Last updated: **2025-08-21**. ([Google AI for Developers][1])

---

# 2) Robust Output Parser + Coercers

Create `src/gemini/parse-safe.ts`:

````ts
// Parse/repair JSON Gemini returns, then validate & coerce to your app types.

export class GeminiParseError extends Error {
  constructor(
    msg: string,
    public cause?: unknown,
  ) {
    super(msg)
  }
}

// 1) Extract first JSON block (handles code fences, prose around JSON, etc.)
export function extractFirstJsonBlock(text: string): string {
  if (!text) throw new GeminiParseError('Empty text')
  // Remove ``` fences if present
  const unfenced = text.replace(/^```(?:json)?\s*|\s*```$/gim, '').trim()

  // If it already starts with { or [, try as-is.
  if (/^[\[{]/.test(unfenced)) return unfenced

  // Otherwise, find the first top-level JSON-looking segment.
  const match = unfenced.match(/(\{[\s\S]*\}|\[[\s\S]*\])/)
  if (match) return match[0].trim()

  throw new GeminiParseError('No JSON block found')
}

// 2) Lenient JSON parse: fix common mistakes (trailing commas, single quotes)
export function lenientParse(jsonText: string): any {
  let s = jsonText.trim()

  // Trailing commas → remove
  s = s.replace(/,\s*(\}|\])/g, '$1')

  // Convert single-quoted JSON to double quotes if it looks safe
  const looksSingleQuoted = /^[\[\{][\s\S]*'[\s\S]*[\]\}]$/.test(s) && !/"/.test(s)
  if (looksSingleQuoted) {
    s = s.replace(/'([^']*)'/g, (_, p1) => `"${p1.replace(/"/g, '\\"')}"`)
  }

  // Remove BOM / weird whitespace
  s = s.replace(/^\uFEFF/, '')

  return JSON.parse(s)
}

// ---------- Coercers for your concrete shapes ----------

export type NarrativeKind =
  | 'novel'
  | 'short_story'
  | 'play'
  | 'rakugo'
  | 'nonfiction'
  | 'report'
  | 'manual'
  | 'other'

export interface NarrativeJudgeResult {
  isNarrative: boolean
  kind: NarrativeKind
  confidence: number // coerced from number|string
  reason: string
}

export function toBool(v: any): boolean {
  if (typeof v === 'boolean') return v
  if (typeof v === 'string') return ['true', '1', 'yes'].includes(v.toLowerCase())
  if (typeof v === 'number') return v !== 0
  return false
}

export function toNum(v: any, fallback = 0): number {
  if (typeof v === 'number' && Number.isFinite(v)) return v
  if (typeof v === 'string') {
    const n = Number(v.replace(/[^\d.+-eE]/g, ''))
    if (Number.isFinite(n)) return n
  }
  return fallback
}

export function toStr(v: any, fallback = ''): string {
  if (typeof v === 'string') return v
  if (v == null) return fallback
  try {
    return JSON.stringify(v)
  } catch {
    return String(v)
  }
}

export function clampArray<T>(arr: T[], min = 0, max = Infinity): T[] {
  const safe = Array.isArray(arr) ? arr : []
  const clipped = safe.slice(0, max)
  return clipped.length >= min ? clipped : clipped // we don't auto-pad
}

// Validate & coerce – Narrativity
export function validateNarrativityJudge(raw: any): NarrativeJudgeResult {
  const kindSet = new Set<NarrativeKind>([
    'novel',
    'short_story',
    'play',
    'rakugo',
    'nonfiction',
    'report',
    'manual',
    'other',
  ])
  const kindRaw = toStr(raw?.kind, 'other') as NarrativeKind
  const kind = (kindSet.has(kindRaw) ? kindRaw : 'other') as NarrativeKind

  return {
    isNarrative: toBool(raw?.isNarrative),
    kind,
    confidence: toNum(raw?.confidence, 0.5),
    reason: toStr(raw?.reason, ''),
  }
}

// ---------- Explainer characters ----------

export interface ExplainerCharacter {
  id: string
  name: string
  role: 'Teacher' | 'Student' | 'Skeptic' | 'Expert' | 'Narrator' | 'Other'
  voice: string
  style: string
  quirks?: string
  goal?: string
}

export function validateExplainerCharacters(raw: any): ExplainerCharacter[] {
  const roles = new Set(['Teacher', 'Student', 'Skeptic', 'Expert', 'Narrator', 'Other'])
  const arr = Array.isArray(raw) ? raw : []
  const coerced = arr.map((r) => {
    const roleRaw = toStr(r?.role, 'Teacher')
    const role = roles.has(roleRaw) ? (roleRaw as any) : 'Teacher'
    return {
      id: toStr(r?.id),
      name: toStr(r?.name),
      role,
      voice: toStr(r?.voice),
      style: toStr(r?.style),
      quirks: r?.quirks != null ? toStr(r?.quirks) : undefined,
      goal: r?.goal != null ? toStr(r?.goal) : undefined,
    } as ExplainerCharacter
  })

  // Enforce 2–3 in app logic (not in schema)
  return clampArray(coerced, 2, 3)
}

// Single entry point you can call after LLM returns .text
export function parseGeminiJson<T>(text: string, coerce: (raw: any) => T): T {
  const jsonBlock = extractFirstJsonBlock(text)
  const raw = lenientParse(jsonBlock)
  return coerce(raw)
}
````

---

# 3) How to call Gemini with these schemas (TypeScript)

Use your existing Gemini client, but keep the config tiny:

```ts
import {
  asGeminiConfig,
  SchemaNarrativityJudge,
  SchemaExplainerCharacters,
} from '@/gemini/schema-safe'
import {
  parseGeminiJson,
  validateNarrativityJudge,
  validateExplainerCharacters,
} from '@/gemini/parse-safe'

// 1) Narrativity
const narrCfg = asGeminiConfig(SchemaNarrativityJudge)
const narrResp = await ai.models.generateContent({
  model: 'gemini-2.5-flash',
  contents: '【判定対象テキスト】\n' + inputText,
  config: narrCfg,
})
const judge = parseGeminiJson(narrResp.text, validateNarrativityJudge)

// 2) Explainer characters
const charCfg = asGeminiConfig(SchemaExplainerCharacters)
const charResp = await ai.models.generateContent({
  model: 'gemini-2.5-flash',
  contents: '【題材の要約／トピック】\n' + contentSummary + '\n【目的】初学者に…',
  config: charCfg,
})
const explainerChars = parseGeminiJson(charResp.text, validateExplainerCharacters)

// 3) For yes/no UI (e.g., consent), switch MIME type to enum:
const ynResp = await ai.models.generateContent({
  model: 'gemini-2.5-flash',
  contents: 'Return yes or no.',
  config: {
    responseMimeType: 'text/x.enum',
    responseSchema: { type: 'STRING', enum: ['yes', 'no'] },
  },
})
const yesNo = ynResp.text.trim() // "yes" | "no"
```

**Why this pattern works with Gemini:**

- **Simple types**: stick to `STRING`/`NUMBER`/`BOOLEAN`/`ARRAY`/`OBJECT`, string enums only, and **avoid `min`/`max`** unless absolutely necessary — Google’s docs and Vertex guide both warn that constraints and complex schemas provoke 400s. ([Google AI for Developers][1], [Cloud Docs][3])
- **`propertyOrdering`** is kept and matches the examples; Google explicitly calls out ordering sensitivity. ([Google AI for Developers][1])
- **Enums** use `text/x.enum` when you only need a single choice — this reduces failure modes a lot. ([Google AI for Developers][1])
- **No schema in the prompt** (don’t duplicate) to avoid conflicting instructions. ([MNTSQ Techブログ][4])

---

# 4) Drop-in validators for your earlier prompts

These pair with your previously added prompts/types (we keep Zod in your app layer if you want, but we don’t force Gemini to honor Zod-level constraints).

```ts
// src/types/validation.gemini-safe.ts
export type InputValidationStatus = 'OK' | 'SHORT' | 'NON_NARRATIVE' | 'LLM_ERROR'
export type ConsentRequired = 'EXPAND' | 'EXPLAINER'
export type NarrativeKind =
  | 'novel'
  | 'short_story'
  | 'play'
  | 'rakugo'
  | 'nonfiction'
  | 'report'
  | 'manual'
  | 'other'

export interface NarrativeJudgeResult {
  isNarrative: boolean
  kind: NarrativeKind
  confidence: number
  reason: string
}
```

(Your existing step can keep its return types; you just swap parsing to `parseGeminiJson(..., validateNarrativityJudge)`.)

---

# 5) Troubleshooting checklist (schema & runtime)

- **Prefer the official Gemini SDK route**, not the OpenAI-compatible endpoint, if you rely on `propertyOrdering`. The community reports `propertyOrdering` may not be respected via the compatibility API. ([Google AI Developers Forum][5])
- If you hit **`InvalidArgument: 400`** on a seemingly valid schema, reduce complexity:
  - Shorten keys; remove constraints (`minItems`, `maxItems`, numeric `minimum/maximum`), flatten one level, reduce enum sizes, reduce optionals. ([Google AI for Developers][1], [Cloud Docs][3])

- **Truncation** can still happen even with large `maxOutputTokens`. Add server-side length checks and, if needed, re-ask with a shorter prompt or smaller schema. ([Google AI Developers Forum][6])
- If you’re on **Gemini 2.5** and truly need richer validation, you can try `responseJsonSchema` (preview). It accepts JSON Schema, but with important limitations; keep it small and non-recursive. For most production flows, the simpler `responseSchema` + local coercion above is safer. ([Google AI for Developers][1])

---

## Ready-made configs for your two new flows

- **Narrativity Judge**: use `SchemaNarrativityJudge` + `validateNarrativityJudge`.
- **Explainer Characters**: use `SchemaExplainerCharacters` + `validateExplainerCharacters` (enforce 2–3 in app).

These should **eliminate most Gemini schema-error flakiness** while keeping your downstream TypeScript strict. If you want, I can also provide **a one-liner wrapper** around your LLM router that automatically attaches the right schema + parser per call site (judge / characters / enum consent).

[1]: https://ai.google.dev/gemini-api/docs/structured-output?utm_source=chatgpt.com 'Structured output  |  Gemini API  |  Google AI for Developers'
[2]: https://cloud.google.com/vertex-ai/generative-ai/docs/multimodal/control-generated-output?utm_source=chatgpt.com 'Structured output  |  Generative AI on Vertex AI  |  Google Cloud'
[3]: https://docs.cloud.google.com/vertex-ai/generative-ai/docs/multimodal/control-generated-output?utm_source=chatgpt.com 'Structured output  |  Generative AI on Vertex AI  |  Google Cloud Documentation'
[4]: https://tech.mntsq.co.jp/entry/2025/07/15/172532?utm_source=chatgpt.com 'GeminiのStructured outputでレスポンスの型を矯正するためのTips 7選 - MNTSQ Techブログ'
[5]: https://discuss.ai.google.dev/t/structured-outputs-propertyordering-field-not-respected-when-using-the-openai-compatible-api-gemini-2-flash/86790?utm_source=chatgpt.com 'Structured outputs propertyOrdering field not respected when using the OpenAI compatible API (Gemini 2 Flash) - Gemini API - Google AI Developers Forum'
[6]: https://discuss.ai.google.dev/t/truncated-response-issue-with-gemini-2-5-flash-preview/81258?utm_source=chatgpt.com 'Truncated Response Issue with Gemini 2.5 Flash Preview - Gemini API - Google AI Developers Forum'
