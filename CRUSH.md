# CRUSH.md - Novel2Manga TypeScript Project Guidelines

## Environment & Testing Constraints
- **WSL2 Environment**: Running in WSL2 but development on Windows. Binary-dependent tests will fail—delegate full test runs to developer.
- **Agent Test Limits**: Agents can only run small, TypeScript-only unit tests. No integration/E2E execution by agents.

## Commands
- **Development**: `npm run dev` (localhost:3000), `npm run build`, `npm run start`.
- **Testing**: `npm test` (all unit), `npm run test:unit` (Vitest units), `npm run test:coverage`. Single test: `npm test -- src/__tests__/filename.test.ts` or `vitest src/__tests__/filename.test.ts`.
- **Lint/Format/Typecheck**: `npm run lint` (Biome lint), `npm run format` (Biome format), `npm run check` (combined), `npm run typecheck` (tsc --noEmit).
- **Database**: `npm run db:migrate`, `npm run db:generate`, `npm run db:push`, `npm run db:studio`.
- **Cloudflare**: `npm run preview` (local), `npm run deploy` (OpenNext+Workers), `npm run cf-typegen` (bindings types).

## Code Style & Conventions
- **Language**: TypeScript (Node >=20.9). Strict types: No `any`; use `unknown` + guards, generics, discriminated unions. No unexplained `@ts-ignore`.
- **Formatting/Linting**: Biome (enforced in CI). Single quotes for strings, trailing commas where possible, JSX double quotes, 100-column lines.
- **Naming**: PascalCase (React components), camelCase (functions/vars), kebab-case (files). Routes in `src/app/`.
- **Imports**: Relative/absolute as per existing patterns; group by type (external, internal, local). Avoid side-effect imports.
- **Magic Numbers**: Forbidden—centralize in `*.config.ts` (e.g., `app.config.ts.rendering.limits.maxPages`). Extract hardcodes immediately.
- **Error Handling**: No fallbacks/skips outside LLM calls; surface errors explicitly with details and stop processing. Follow SOLID/DRY.
- **Effect TS Migration**: New code uses Effect TS (ref `docs/effect-ts-doc.txt`); gradual adoption, no forced rewrites of working code.
- **OpenNext/Cloudflare**: Node.js runtime (remove `runtime: 'edge'`); use `nodejs_compat`. Web standards first (fetch, Web Crypto); Layer-inject bindings via `getCloudflareContext().env`.

## Project Structure
- Source: `src/` (app/routes, components, agents, services, db, utils, types).
- Tests: Unit `src/__tests__/*.test.ts(x)`; Integration `tests/integration/`; E2E `tests/integration/e2e/` (Playwright).
- DB: Schema in `src/db/schema.ts` (sync with Drizzle migrations in `drizzle/`).

## Key Rules from Cursor/Copilot
- **Non-Negotiables**: Fetch latest docs (Cloudflare/MCP); resolve all lint/TS errors; DRY/SOLID; update design/tasks/schema/storage docs in same PR.
- **PR Checklist**: No `any`/unjustified ignores; clean lint/format; tests pass; update `.kiro/specs/...` and `database/storage-structure.md`.
- **Security**: Never commit secrets; use `.env.test` for integration.

(Generated/Improved for agentic coding - ~25 lines)