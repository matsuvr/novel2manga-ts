# Repository Guidelines

## Project Structure & Module Organization
- Source: `src/` with `app/` (Next.js routes), `components/`, `agents/`, `services/`, `db/`, `utils/`, `types/`.
- Tests: unit in `src/__tests__/`; integration in `tests/integration/`; Playwright E2E under `tests/`.
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
- Language: TypeScript (Node >= 20.9). Strict types; avoid `any` and unexplained `@ts-ignore`.
- Formatting/Linting: Biome. Keep files formatted; CI enforces `format:check`/`lint:check`.
- Naming: PascalCase React components; camelCase functions/vars; kebab-case files. Next.js routes live under `src/app/`.

## Testing Guidelines
- Frameworks: Vitest for unit/integration; Playwright for E2E.
- Location & names: Unit tests in `src/__tests__` as `*.test.ts(x)`; integration in `tests/integration/` (configured via `vitest.integration.config.ts`).
- Running: Use commands above; prefer `npm run test:coverage` for meaningful PRs.
- Test data/env: Keep `.env.test` current for integration; isolate side effects.

## Commit & Pull Request Guidelines
- Commits: Use Conventional Commits (e.g., `feat:`, `fix:`, `chore:`). Keep changes focused.
- PRs: Use `.github/pull_request_template.md`. Link issues, paste test summaries (unit/integration/E2E), update docs/specs in `.kiro/specs/...`, DB schema/migrations (`src/db/schema.ts`, `drizzle/`), and `database/storage-structure.md` when applicable.
- Quality gates: zero TS errors, clean lint/format, DRY/SOLID respected, adequate tests for changes.

## Security & Configuration Tips
- Do not commit secrets. Copy `.env.example` to `.env`/`.env.local`; keep `.env.test` for integration.
- Verify Cloudflare bindings in `wrangler.toml` and regenerate environment types via `npm run cf-typegen` when bindings change.
