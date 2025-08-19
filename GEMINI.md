```instructions
MANDATORY RULES FOR THIS REPOSITORY — READ BEFORE CODING

Non‑negotiables (do these every time):
- Always fetch and develop against the latest official documentation via MCP tools before writing code.
- Cloudflare: Use MCP to obtain and cite the latest docs and APIs. Do not rely on memory or outdated snippets. If docs cannot be verified, do not proceed.
	- Use Web search + Deepwiki to gather current library information. Prefer primary sources; cross‑check breaking changes and version constraints.
- TypeScript: The any type is forbidden. Use precise types (unknown + type guards, generics, discriminated unions). No ts-ignore/ts-expect-error unless absolutely necessary and justified with a comment and a tracking task.
- Lint/Format: Resolve all linter errors and warnings. Do not merge with outstanding issues. Do not disable rules to "make it pass" unless there is a justified, documented rationale.
- DRY: Eliminate duplication. Extract shared logic into reusable modules/functions. No copy-paste forks of similar code paths.
- SOLID: Follow Single-responsibility, Open/closed, Liskov, Interface segregation, Dependency inversion. Prefer composition over inheritance and stable, testable boundaries.
- CONFIG CENTRALIZATION: ALL configuration must be centralized in config files. NEVER hardcode models, API endpoints, tokens, or any other configuration values outside of src/config/. This is absolutely forbidden.
- ERROR HANDLING: NEVER silence errors with empty catch blocks or underscore variables. Always log errors with full context (jobId, operation, error message, stack trace) using the structured logger. Error silencing makes debugging impossible and is absolutely forbidden. When an error occurs, the code should log detailed information and gracefully handle the failure with appropriate fallback behavior.

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
- Cloudflare (Workers/Pages/D1/R2/Queues/etc.): Use MCP to verify the latest Cloudflare APIs and limits. Keep wrangler configuration accurate, document required bindings, and pin versions when possible.
- Libraries: When introducing or upgrading dependencies, use web search + Context7 + Deepwiki to validate stability, maintenance status, and migration notes. Include justification and links in the PR.

Quality gates (must pass before merge):
- Build succeeds with zero TypeScript errors (no any), and linter passes with no errors and no unexplained disables.
- Unit tests in src/__tests__ pass. E2E tests via Playwright MCP pass for core flows. Integration tests must pass if applicable.
- Docs/specs/tasks updated in the same PR: design.md, tasks.md, schema.ts + migrations, storage-structure.md.
- No duplicated code introduced; shared utilities factored appropriately.
- エラーの隠蔽がないか。LLMコール以外のフォールバックが実装されていないか。スキップが無いか。一気通貫の分析サービスである以上、フォールバックやスキップで正常な分析結果が得られないことはシステムの重要な欠陥である。フォールバックは実装してはいけない。エラーは詳細なメッセージと共に明示し、そこで処理をストップすべき

If any item cannot be satisfied, stop and resolve it first. Do not proceed with implementation or merging until all conditions above are met.
```

- あなたはgh, jqのコマンドが利用可能です
- grepではなく、git-grepを使って、関数の名称や関数全体を取得すると作業が楽になります
- gpt-5, gpt-5-mini, gpt-5-nano は8月5日にリリースされたモデルです。指定間違いではありません。この3つについては、レビューで指摘しないでください。勝手に変更するのも禁止です
- serenaのreplaceは問題を起こすことが多いので、使わないでください

PR checklist (copy into your PR and tick all):

- [ ] No any types introduced; strict types only. No unjustified ts-ignore.
- [ ] Linter and formatter clean (0 errors). No rule disabling without justification.
- [ ] DRY and SOLID upheld; no redundant implementations.
- [ ] Unit tests added/updated in src/**tests** and passing.
- [ ] E2E scenarios added/updated and passing with Playwright MCP.
- [ ] エラーの隠蔽がないか
- [ ] Updated: .kiro\specs\novel-to-manga-converter\design.md
- [ ] Updated: .kiro\specs\novel-to-manga-converter\tasks.md
- [ ] Updated: src\db\schema.ts (+ migrations applied/generated as needed)
- [ ] Updated: database\storage-structure.md
