```instructions
MANDATORY RULES FOR THIS REPOSITORY — READ BEFORE CODING

Non‑negotiables (do these every time):
- Always fetch and develop against the latest official documentation via MCP tools before writing code.
	- Mastra and Cloudflare: Use MCP to obtain and cite the latest docs and APIs. Do not rely on memory or outdated snippets. If docs cannot be verified, do not proceed.
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

Technology‑specific directives:
- Mastra: Before adding/updating pipelines, operators, or configs, retrieve the latest Mastra docs via MCP, confirm version compatibility, and reference the exact doc links in code comments or PR descriptions.
- Cloudflare (Workers/Pages/D1/R2/Queues/etc.): Use MCP to verify the latest Cloudflare APIs and limits. Keep wrangler configuration accurate, document required bindings, and pin versions when possible.
- Libraries: When introducing or upgrading dependencies, use web search + Context7 + Deepwiki to validate stability, maintenance status, and migration notes. Include justification and links in the PR.

Quality gates (must pass before merge):
- Build succeeds with zero TypeScript errors (no any), and linter passes with no errors and no unexplained disables.
- Unit tests in src/__tests__ pass. E2E tests via Playwright MCP pass for core flows. Integration tests must pass if applicable.
- Docs/specs/tasks updated in the same PR: design.md, tasks.md, schema.ts + migrations, storage-structure.md.
- No duplicated code introduced; shared utilities factored appropriately.

PR checklist (copy into your PR and tick all):
- [ ] Latest docs fetched via MCP (Mastra, Cloudflare, and relevant libs). Links included in PR.
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

CLI tools policy
- gh (GitHub CLI) is allowed for creating/updating branches and PRs, posting comments, and checking CI status. You may operate GitHub programmatically with it (e.g. create branches, open/update PRs, add review comments, check workflow runs). Always summarize critical gh actions (what/why + resulting URL) in the PR description or a comment.
- rp (PR helper CLI) is allowed where available for PR management/automation.
- When using these CLIs, document critical actions in the PR description or comments (e.g., links to comments or runs).
- rg (ripgrep) is available for fast, recursive code/text searches. Prefer it over ad‑hoc Node/TS grep scripts. Scope searches narrowly (add globs / --type) to avoid noise; do not paste excessively long raw outputs—summarize.
- jq is available for robust JSON querying, filtering, and transformation (e.g., parsing test reports, API responses). Keep non‑trivial filters readable (split with --arg/--slurpfile as needed) and add a brief inline comment for complex expressions.

Test execution policy (avoid hanging interactive sessions)
- Always run unit/integration tests in non-interactive mode so automation (CI, scripted local runs) finishes without manual key presses.
- Use `npm test` (maps to `vitest run`) for a one-shot run. This exits automatically.
- If you see a prompt where pressing `h` shows help or `q` quits, you're in watch/interactive mode (started with plain `vitest` or `vitest --ui`). Exit with `q` and rerun using `npm test` or `npx vitest run`.
- Do NOT use watch/interactive (`vitest` without `run`) in CI or automated scripts. Reserve `npm run test:watch` locally only when actively developing.
- Ensure any added scripts or docs reference `vitest run` (or `npm test`) for deterministic, non-blocking execution. Failing to do so can stall pipelines.
- For integration tests, prefer the provided scripts: `npm run test:integration:run` (non-interactive) or `npm run test:integration` (interactive only when intentionally debugging).
```
