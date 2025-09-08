# Phase 0: Research & Analysis

## Research Objectives
Resolve all NEEDS CLARIFICATION items from the feature specification and gather technical information for the OpenNext/Cloudflare to pure Next.js + SQLite3 migration.

## NEEDS CLARIFICATION Resolution

### FR-009: Cloudflare KV/R2 Data Types
**Question**: What specific data types are stored in Cloudflare KV/R2 that need SQLite3 equivalent?

**Research Findings**:
- **Decision**: Cloudflare KV (Key-Value storage) and R2 (Object storage) data will be migrated to SQLite3 with appropriate schema design
- **Rationale**: 
  - KV data typically stores configuration, session data, caching → can be stored as key-value tables in SQLite
  - R2 data typically stores binary files, user uploads → can be stored as BLOB fields or file system references
- **Alternatives considered**: 
  - Keep using cloud storage (rejected - violates pure Next.js requirement)
  - Use local file system (viable for small scale, but SQLite provides better queryability)

### FR-010: Acceptable Downtime Window
**Question**: What is the acceptable downtime window for migration?

**Research Findings**:
- **Decision**: Target < 5 minutes downtime for database migration
- **Rationale**: 
  - Small to medium application can migrate quickly with SQLite
  - Use transaction-based migration to ensure consistency
  - Implement rollback capability
- **Alternatives considered**: 
  - Zero-downtime (complex for this scope)
  - Extended maintenance window (unnecessary for SQLite migration)

### FR-011: Critical Performance Metrics
**Question**: What specific performance metrics are critical to maintain?

**Research Findings**:
- **Decision**: Maintain current response times within ±10%
- **Rationale**: 
  - Page load times < 2 seconds
  - API response times < 500ms
  - Database query times < 100ms
- **Alternatives considered**: 
  - Performance improvements (nice-to-have but not required)
  - Strict performance budgets (overly restrictive for migration)

## Technical Research

### Current Cloudflare Dependencies
**Research Task**: Identify all Cloudflare-specific dependencies and configurations

**Findings**:
- **OpenNext dependencies**: `@opennextjs/cloudflare`, `@cloudflare/next-on-pages`
- **Cloudflare bindings**: D1 database, KV storage, R2 object storage, Workers runtime
- **Configuration**: `wrangler.toml`, `cloudflare-env.d.ts`
- **Build process**: OpenNext-specific build steps and output structure

### SQLite3 Migration Strategy
**Research Task**: Best practices for Cloudflare D1 to SQLite3 migration

**Findings**:
- **Schema compatibility**: D1 uses SQLite syntax → mostly compatible
- **Data export**: D1 provides `wrangler d1 export` command
- **Data import**: SQLite3 `.import` command or custom migration scripts
- **Indexing**: Review and optimize indexes for local SQLite access patterns

### Next.js Pure Implementation
**Research Task**: Configure Next.js without OpenNext/Cloudflare

**Findings**:
- **Build configuration**: Remove OpenNext-specific `next.config.ts` settings
- **Deployment**: Standard Next.js build output (`next build && next start`)
- **Environment variables**: Move from Cloudflare bindings to standard `.env` files
- **Static assets**: Standard Next.js public directory serving

### Effect TS Compatibility
**Research Task**: Ensure Effect TS works with pure Next.js + SQLite3

**Findings**:
- **Platform compatibility**: Effect TS is platform-agnostic
- **Database access**: Use `@effect/sql` with SQLite3 driver
- **HTTP client**: `@effect/platform` with FetchHttpClient (works in Node.js)
- **Services**: All Effect services can run in standard Node.js environment

## Migration Strategy

### Data Migration Plan
1. **Export current data**: Use `wrangler d1 export` to dump D1 database
2. **Schema conversion**: Convert D1 schema to SQLite3 compatible schema
3. **Data import**: Use SQLite3 import or custom migration script
4. **Validation**: Verify data integrity and relationships

### Configuration Migration
1. **Environment variables**: Convert Cloudflare bindings to `.env` variables
2. **Database URL**: Standard SQLite3 connection string
3. **Storage paths**: Local file system paths for any file storage
4. **Feature flags**: Remove Cloudflare-specific feature flags

### Code Changes Required
1. **Remove OpenNext imports**: Replace `@opennextjs/cloudflare` with standard Next.js patterns
2. **Update database access**: Replace Cloudflare D1 API with Drizzle + SQLite3
3. **Storage abstraction**: Replace Cloudflare KV/R2 with SQLite3 or file storage
4. **Environment access**: Replace `getCloudflareContext()` with standard environment access

## Risk Assessment

### High Risk Items
- **Data loss during migration**: Mitigation: Full backup before migration
- **Performance regression**: Mitigation: Benchmark before/after migration
- **Missing Cloudflare features**: Mitigation: Implement equivalent functionality

### Medium Risk Items
- **Configuration errors**: Mitigation: Comprehensive testing in staging
- **Dependency conflicts**: Mitigation: Clean dependency management

### Low Risk Items
- **Build process changes**: Mitigation: Standard Next.js build is well-documented
- **Deployment process**: Mitigation: Standard Next.js deployment patterns

## Research Summary

**Key Decisions**:
- Use SQLite3 as direct replacement for Cloudflare D1
- Implement migration script for data transfer
- Maintain current functionality with pure Next.js patterns
- Keep Effect TS for business logic abstraction

**Migration Approach**:
1. Phase 1: Remove OpenNext dependencies and configure pure Next.js
2. Phase 2: Migrate database from D1 to SQLite3
3. Phase 3: Replace Cloudflare storage with SQLite3/file storage
4. Phase 4: Testing and validation

**Timeline Estimate**: 2-3 weeks for complete migration including testing

**Success Criteria**:
- All existing functionality preserved
- No data loss during migration
- Performance within acceptable tolerance
- Simplified deployment and maintenance