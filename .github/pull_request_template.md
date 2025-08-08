<!-- READ .github/copilot-instructions.md BEFORE THIS. DO NOT OPEN A PR IF ANY REQUIRED ITEM IS UNCHECKED. -->

## Summary
- What and why (concise):

## Linked Issues
- Closes #

## Changes
- Key changes and rationale:

## MCP‑Verified Docs (REQUIRED — BLOCKING)
- [ ] Mastra docs fetched via MCP and referenced
  - Links:
- [ ] Cloudflare docs fetched via MCP and referenced
  - Links:
- [ ] Other libraries verified via Web search + Context7 + Deepwiki
  - Links / notes:

## Tests
- [ ] Unit tests added/updated under `src/__tests__` (Vitest)
  - Paste run output summary:
- [ ] E2E tests added/updated and passing with Playwright MCP for critical flows
  - Paste run output summary:
- [ ] Integration tests (if applicable) passing

## Docs / Specs / Tasks (MUST stay in sync in this PR)
- [ ] Updated: `.kiro\specs\novel-to-manga-converter\design.md`
- [ ] Updated: `.kiro\specs\novel-to-manga-converter\tasks.md`

## Database & Storage
- [ ] Drizzle schema updated: `src\db\schema.ts`
- [ ] Migrations generated/applied alongside code changes
- [ ] Storage contracts updated: `database\storage-structure.md`

## Cloudflare Config (if used)
- [ ] Wrangler config/bindings updated and documented
- [ ] Version pins and limits verified against latest docs (MCP)

## Quality Gates (NO EXCEPTIONS)
- [ ] Build: zero TypeScript errors (no `any`), strict types only
- [ ] Linter: 0 errors, no unexplained disables
- [ ] DRY upheld: no duplicated logic; shared utilities factored
- [ ] SOLID respected; stable/testable boundaries

## Risk / Rollback
- Risks and rollback plan:

## Screenshots / Logs (optional)

---

### PR Checklist — MUST be all checked before review
- [ ] Latest docs fetched via MCP (Mastra, Cloudflare, and relevant libs). Links included in PR.
- [ ] No `any` types introduced; strict types only. No unjustified `ts-ignore`/`ts-expect-error`.
- [ ] Linter and formatter clean (0 errors). No rule disabling without justification.
- [ ] DRY and SOLID upheld; no redundant implementations.
- [ ] Unit tests added/updated in `src/__tests__` and passing.
- [ ] E2E scenarios added/updated and passing with Playwright MCP.
- [ ] Updated: `.kiro\specs\novel-to-manga-converter\design.md`
- [ ] Updated: `.kiro\specs\novel-to-manga-converter\tasks.md`
- [ ] Updated: `src\db\schema.ts` (+ migrations applied/generated as needed)
- [ ] Updated: `database\storage-structure.md`

> If any item cannot be satisfied, STOP and resolve it first. Do not proceed with implementation or merging until all conditions above are met.
