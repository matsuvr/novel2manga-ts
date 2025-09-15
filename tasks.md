# Tasks

- [x] Route API errors through `logError`.
- [x] Guard storage tracking against missing database connections.
- [ ] Review remaining error logs for further cleanup.
- [x] Auto rebuild better-sqlite3 on Node ABI mismatch during database initialization.
- [x] Detect "Module did not self-register" errors to trigger automatic rebuild of `better-sqlite3`.
- [ ] Upgrade Docker base Node image when `better-sqlite3` adds support for newer versions.
- [x] Export NextAuth helpers directly to prevent "auth is not a function" during E2E startup.
- [x] Install Playwright system libraries for E2E tests.
