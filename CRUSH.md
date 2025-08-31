# CRUSH.md - Development Guidelines for Novel to Manga Converter

## Build Commands

npm run build # Production build
npm run preview # Local Cloudflare preview
npm run deploy # Deploy to Cloudflare
npm run cf-typegen # Generate Cloudflare types

## Lint/Format Commands

npm run lint # Biome lint (write mode)
npm run lint:check # Biome lint (check only)
npm run format # Format code
npm run check # Combined lint/format check
npm run fix # Apply all automatic fixes

## Test Commands

npm test # Run unit tests (Vitest)
npm run test:watch # Watch mode for unit tests
npm run test:coverage # Run tests with coverage
npm run test:integration # Run integration tests
npm run test:e2e # Run E2E tests (Playwright)

## Code Style Guidelines

- **Types**: Never use `any`. Use precise types, unknown + type guards, generics, discriminated unions
- **Error Handling**: NEVER silence errors. Always log with full context using structured logger. Display detailed messages and stop processing
- **Imports**: Prefer absolute imports. Follow existing patterns in the codebase
- **Formatting**: Use Biome formatter. Single quotes for strings, double quotes for JSX attributes
- **Naming**: PascalCase for React components, camelCase for functions/variables, kebab-case for files
- **DRY/SOLID**: Eliminate duplication. Follow SOLID principles (composition over inheritance)
- **Configuration**: ALL config must be centralized in src/config/. NEVER hardcode models, endpoints, tokens
- **Testing**: Place unit tests under src/**tests**. Every public behavior change must have tests
- **E2E Tests**: Use Playwright MCP for critical flows. Keep scenarios minimal and deterministic
- **Temporary Scripts**: Put ad-hoc scripts in tmp_test/ and mark them as temporary
- **Database**: Use Drizzle ORM. Schema source of truth is src/db/schema.ts. Keep in sync with migrations
- **Storage**: Update database/storage-structure.md when files, paths or retention rules change
