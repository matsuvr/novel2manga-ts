think in English, output in Japanese

**絶対に直接package-lock.jsonを書き換えないこと。あなたのせいで苦痛が発生しています。これは生成する物で、書き換える物ではありません**

# **現在、段階的にEffect TSに移行しています**

新しく作る箇所は、 `docs\effect-ts-doc.txt` を参考に、Effect TSを使って書いてください。
段階的に移行していくので、いま動いているところを無理矢理書き換えないでください。

# **Bunに移行中**

低スペックなVPSで動かすことになるので、高速性に定評があるBunに移行しています。
Bun + Next.js + SQLite3をDockerで動かします。

# Repository Guidelines

## Project Structure & Module Organization

- Source: `src/` with `app/` (Next.js routes), `components/`, `agents/`, `services/`, `db/`, `utils/`, `types/`.
- Tests: unit in `src/__tests__/`; integration in `tests/integration/`; Playwright E2E under `tests/integration/e2e/`.
- Assets & scripts: `public/` for static assets; `scripts/` for local tooling.
- Database: `database/` (data, docs) and `drizzle/` (SQL + meta). Keep schema in `src/db/schema.ts` in sync with migrations.

## Build, Test, and Development Commands

- `npm run dev`: Start Next.js locally at `http://localhost:3000`.
- `npm run build` / `npm start`: Production build and serve.
- `npm test`, `npm run test:unit`: Run Vitest unit tests; `npm run test:coverage` for coverage.
- `npm run test:integration` / `:run`: Vitest integration using `.env.test`.
- `npm run test:e2e`: Playwright E2E; `npm run test:full-flow` (or `:win`) runs scripted flow.
- `npm run format` / `npm run lint` / `npm run check`: Biome format, lint, and combined checks.
- DB: `npm run db:migrate` / `db:generate` / `db:push` / `db:studio`.
- Cloudflare: `npm run preview` (local), `npm run deploy` (OpenNext + Workers); `npm run cf-typegen` to refresh bindings types.

## Coding Style & Naming Conventions

- Language: TypeScript. Strict types; avoid `any` and unexplained `@ts-ignore`.
- Formatting/Linting: Biome. Keep files formatted; CI enforces `format:check`/`lint:check`.
- Naming: PascalCase React components; camelCase functions/vars; kebab-case files. Next.js routes live under `src/app/`.

### マジックナンバー禁止・設定の一元化

- マジックナンバーのハードコーディングは禁止です。
- 閾値・上限・タイムアウト・ページ数などの設定値は、すべて `*.config.ts` に定義し、そこからのみ参照してください。
- 既存コードにハードコードが見つかった場合は、即時に `*.config.ts` へ移動して参照を置換すること。
- 例: レンダリング最大ページ数 `maxPages` は `app.config.ts` の `rendering.limits.maxPages` を唯一の参照源とする。

## Testing Guidelines

- Frameworks: Vitest for unit/integration; Playwright for E2E.
- Location & names: Unit tests in `src/__tests__` as `*.test.ts(x)`; integration in `tests/integration/` (configured via `vitest.integration.config.ts`); E2E in `tests/integration/e2e/` (Playwright).
- Running: Use commands above; prefer `npm run test:coverage` for meaningful PRs.
- Test data/env: Keep `.env.test` current for integration; isolate side effects.

## Commit & Pull Request Guidelines

- Commits: Use Conventional Commits (e.g., `feat:`, `fix:`, `chore:`). Keep changes focused.
- PRs: Use `.github/pull_request_template.md`. Link issues, paste test summaries (unit/integration/E2E), update docs/specs in `.kiro/specs/...`, DB schema/migrations (`src/db/schema.ts`, `drizzle/`), and `database/storage-structure.md` when applicable.
- Quality gates: zero TS errors, clean lint/format, DRY/SOLID respected, adequate tests for changes.

## Security & Configuration Tips

- Do not commit secrets. Copy `.env.example` to `.env`/`.env.local`; keep `.env.test` for integration.

## CLI Tools

- `gh` (GitHub CLI): create branches, push, open PRs from the terminal. Requires configured credentials and network access.
- `git-grep`

```instructions
MANDATORY RULES FOR THIS REPOSITORY — READ BEFORE CODING

Non‑negotiables (do these every time):
	- Use Web search + Deepwiki to gather current library information. Prefer primary sources; cross‑check breaking changes and version constraints.
- TypeScript: The any type is forbidden. Use precise types (unknown + type guards, generics, discriminated unions). No ts-ignore/ts-expect-error unless absolutely necessary and justified with a comment and a tracking task.
- Lint/Format: Resolve all linter errors and warnings. Do not merge with outstanding issues. Do not disable rules to “make it pass” unless there is a justified, documented rationale.
- DRY: Eliminate duplication. Extract shared logic into reusable modules/functions. No copy-paste forks of similar code paths.
- SOLID: Follow Single-responsibility, Open/closed, Liskov, Interface segregation, Dependency inversion. Prefer composition over inheritance and stable, testable boundaries.

Project conventions you must follow:
- Unit tests: Place all unit tests under src/__tests__ using the repository’s test runner (Vitest). Every new/changed public behavior must have tests.
- E2E tests: Implement and run end-to-end tests with Playwright MCP. Treat E2E as required for critical flows. Keep scenarios minimal, deterministic, and parallel‑safe.
- Temporary scripts: Put any ad‑hoc verification or one‑off scripts in /tmp_test. Clearly mark them as temporary and remove or gate them before merging to main.

Design, tasks, and data contracts — keep in sync in the same PR:
- System design: .kiro\specs\novel-to-manga-converter\design.md must reflect the current architecture and decisions. Update it when introducing or changing components, flows, or boundaries.
- Task breakdown: .kiro\specs\novel-to-manga-converter\tasks.md must be updated alongside code to reflect the actual scope, status, and acceptance criteria.
- Database: Use Drizzle. The schema source of truth is src\db\schema.ts. Update schema and generate/apply migrations together with code changes; never drift the runtime DB from the schema.
- Storage layout: database\storage-structure.md defines storage contracts and layout. Update it when files, buckets/paths, or retention rules change.
- エラーの隠蔽がないか。LLMコール以外のフォールバックが実装されていないか。スキップが無いか。一気通貫の分析サービスである以上、フォールバックやスキップで正常な分析結果が得られないことはシステムの重要な欠陥である。フォールバックは実装してはいけない。エラーは詳細なメッセージと共に明示し、そこで処理をストップすべき

Technology‑specific directives:
- Libraries: When introducing or upgrading dependencies, use web search + Context7 + Deepwiki to validate stability, maintenance status, and migration notes. Include justification and links in the PR.

Quality gates (must pass before merge):
- Build succeeds with zero TypeScript errors (no any), and linter passes with no errors and no unexplained disables.
- Unit tests in src/__tests__ pass. E2E tests via Playwright MCP pass for core flows. Integration tests must pass if applicable.
- Docs/specs/tasks updated in the same PR: design.md, tasks.md, schema.ts + migrations, storage-structure.md.
- No duplicated code introduced; shared utilities factored appropriately.

PR checklist (copy into your PR and tick all):
- [ ] No any types introduced; strict types only. No unjustified ts-ignore.
- [ ] Linter and formatter clean (0 errors). No rule disabling without justification.
- [ ] DRY and SOLID upheld; no redundant implementations.
- [ ] Unit tests added/updated in src/__tests__ and passing.
- [ ] E2E scenarios added/updated and passing with Playwright MCP.
- [ ] Updated: .kiro\specs\novel-to-manga-converter\design.md
- [ ] Updated: .kiro\specs\novel-to-manga-converter\tasks.md
- [ ] Updated: src\db\schema.ts (+ migrations applied/generated as needed)
- [ ] Updated: database\storage-structure.md

If any item cannot be satisfied, stop and resolve it first. Do not proceed with implementation or merging until all conditions above are met.
```
