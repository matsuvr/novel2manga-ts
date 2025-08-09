# Repository Guidelines

## Project Structure & Module Organization
- Source: `src/` with `app/` (Next.js routes), `components/`, `agents/`, `services/`, `db/`, `utils/`, `types/`.
- Tests: unit in `src/__tests__/`; integration in `tests/integration/`; Playwright under `tests/`.
- Assets: `public/`. Scripts: `scripts/`. Database and migrations: `database/` (data, docs) and `drizzle/` (SQL + meta).

## Build, Test, and Development Commands
- `npm run dev`: start Next.js locally on `http://localhost:3000`.
- `npm run build` / `npm start`: production build and serve.
- `npm test`, `npm run test:unit`: run Vitest; `npm run test:coverage` for coverage.
- `npm run test:integration` / `:run`: Vitest integration with `.env.test`.
- `npm run test:e2e`: Playwright e2e; `npm run test:full-flow` (or `:win`) runs the scripted flow.
- `npm run format` / `npm run lint` / `npm run check`: Biome format, lint, and combined checks.
- `npm run db:migrate` / `db:generate` / `db:push` / `db:studio`: Drizzle workflows.
- Cloudflare: `npm run preview` (local), `npm run deploy` (OpenNext + Workers); typegen via `npm run cf-typegen`.

## Coding Style & Naming Conventions
- TypeScript (Node >= 20.9). Strict types; avoid `any` and unexplained ignores.
- Formatting/linting via Biome; keep files formatted (CI enforces `format:check`/`lint:check`).
- Naming: PascalCase React components, camelCase functions/vars, kebab-case files; Next.js routes under `src/app/`.

## Testing Guidelines
- Unit tests co-located in `src/__tests__` as `*.test.ts(x)`; shared setup in `vitest.setup.ts`.
- Integration in `tests/integration/` using `vitest.integration.config.ts` with `.env.test`.
- E2E with Playwright (`playwright.config.ts`). Include run output in PRs; keep critical flows covered.

## Commit & Pull Request Guidelines
- Use Conventional Commits (e.g., `feat:`, `fix:`, `chore:`) as in repo history.
- PRs must use `.github/pull_request_template.md`: link issues, paste test summaries, update docs/specs (`.kiro/specs/...`), DB schema/migrations (`src/db/schema.ts`, `drizzle/`), and `database/storage-structure.md`.
- Quality gates: zero TS errors, clean lint/format, DRY/SOLID respected, adequate tests.

## Security & Configuration Tips
- Do not commit secrets. Copy `.env.example` to `.env`/`.env.local`; keep `.env.test` for integration.
- Verify Cloudflare bindings in `wrangler.toml` and environment types via `cf-typegen`.
