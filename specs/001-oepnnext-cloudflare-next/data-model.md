Archived. See `archive/cloudflare-legacy/specs/001-oepnnext-cloudflare-next-data-model.md` for the original data model.
# Data Model

## Overview
The application already uses a well-structured SQLite3 database with Drizzle ORM. The migration from OpenNext/Cloudflare to pure Next.js will maintain the existing data model, as the schema is already compatible with SQLite3.
# Data Model

## Overview
The application already uses a well-structured SQLite3 database with Drizzle ORM. The migration from OpenNext/Cloudflare to pure Next.js will maintain the existing data model, as the schema is already compatible with SQLite3.

## Core Entities

### User Management
- **users**: Core user accounts with authentication data
- **accounts**: OAuth provider account linking
- **sessions**: User session management
- **verificationTokens**: Email verification tokens
- **authenticators**: WebAuthn/passkey authentication

### Content Management
- **novels**: Top-level entity for novel/manga content
- **jobs**: Conversion processing jobs for each novel
- **chunks**: Text segmentation results
- **episodes**: Episode segmentation and metadata

### Processing Pipeline
- **chunkAnalysisStatus**: Analysis completion tracking
- **layoutStatus**: Layout generation status
- **renderStatus**: Page rendering completion status
- **jobStepHistory**: Execution history and debugging

### Storage & Output
- **storageFiles**: File system tracking
- **outputs**: Final export products (PDF, CBZ, etc.)
- **tokenUsage**: LLM API usage tracking and cost monitoring

## Key Relationships
```
users \u2192 novels \u2192 jobs \u2192 chunks \u2192 episodes \u2192 outputs
       \u2193        \u2193       \u2193        \u2193
accounts   storageFiles  tokenUsage  renderStatus
sessions              layoutStatus
authenticators        chunkAnalysisStatus
```

## Data Migration Strategy

### Current State
- Database: Already SQLite3 (no schema changes needed)
- Storage: Mix of local files and legacy object storage references
- Configuration: Environment variables (migrated from bindings where applicable)

### Migration Requirements
1. **Database**: No changes needed (already SQLite3)
2. **Storage**: Migrate R2 objects to local file system
3. **Configuration**: Convert Cloudflare bindings to environment variables

### Storage Migration Mapping
| Legacy Object Bucket | Local Path | Content Type |
|---------------------|------------|--------------|
| NOVEL_STORAGE | ./storage/novels/ | Original novel files |
| CHUNKS_STORAGE | ./storage/chunks/ | Text chunks |
| ANALYSIS_STORAGE | ./storage/analysis/ | Analysis results |
| LAYOUTS_STORAGE | ./storage/layouts/ | Layout data |
| RENDERS_STORAGE | ./storage/renders/ | Rendered images |
| OUTPUTS_STORAGE | ./storage/outputs/ | Final exports |

Archived. See `archive/cloudflare-legacy/specs/001-oepnnext-cloudflare-next-data-model.md`.
### Configuration Migration
| Cloudflare Binding | Environment Variable | Purpose |
|-------------------|-------------------|---------|
| CACHE.DB | CACHE_DATABASE_PATH | SQLite cache database |
| DB | DATABASE_URL | Main database connection |
| KV.CACHE | CACHE_FILE_PATH | Key-value cache file |
## Core Entities

### User Management
- **users**: Core user accounts with authentication data
- **accounts**: OAuth provider account linking
- **sessions**: User session management
- **verificationTokens**: Email verification tokens
- **authenticators**: WebAuthn/passkey authentication

### Content Management
- **novels**: Top-level entity for novel/manga content
- **jobs**: Conversion processing jobs for each novel
- **chunks**: Text segmentation results
- **episodes**: Episode segmentation and metadata

### Processing Pipeline
- **chunkAnalysisStatus**: Analysis completion tracking
- **layoutStatus**: Layout generation status
- **renderStatus**: Page rendering completion status
- **jobStepHistory**: Execution history and debugging

### Storage & Output
- **storageFiles**: File system tracking
- **outputs**: Final export products (PDF, CBZ, etc.)
- **tokenUsage**: LLM API usage tracking and cost monitoring

## Key Relationships
```
users → novels → jobs → chunks → episodes → outputs
       ↓        ↓       ↓        ↓
accounts   storageFiles  tokenUsage  renderStatus
sessions              layoutStatus
authenticators        chunkAnalysisStatus
```

## Data Migration Strategy

### Current State
- Database: SQLite3 (no schema changes generally required)
- Storage: Mix of local files and legacy Cloudflare object references
- Configuration: Environment variables (migrated from bindings where applicable)

### Migration Requirements
1. **Database**: No schema changes required in most cases
2. **Storage**: Migrate legacy object storage references to local filesystem paths
3. **Configuration**: Convert any Cloudflare bindings to environment variables

### Storage Migration Mapping
| Legacy Object Bucket | Local Path | Content Type |
|---------------------|------------|--------------|
| NOVEL_STORAGE | ./storage/novels/ | Original novel files |
| CHUNKS_STORAGE | ./storage/chunks/ | Text chunks |
| ANALYSIS_STORAGE | ./storage/analysis/ | Analysis results |
| LAYOUTS_STORAGE | ./storage/layouts/ | Layout data |
| RENDERS_STORAGE | ./storage/renders/ | Rendered images |
| OUTPUTS_STORAGE | ./storage/outputs/ | Final exports |

### Configuration Migration
| Legacy Binding | Environment Variable | Purpose |
|-------------------|-------------------|---------|
| CACHE.DB | CACHE_DATABASE_PATH | SQLite cache database |
| DB | DATABASE_URL | Main database connection |
| KV.CACHE | CACHE_FILE_PATH | Key-value cache file |

## Validation Rules

### Data Integrity
- Preserve foreign key relationships
- Update file path references to local paths
- Keep job status and progress tracking consistent

### Performance Considerations
- Local file access reduces network latency compared to remote object storage
- SQLite3 performance is generally suitable for the app's scale
- Implement file lifecycle policies (cleanup/archival) as needed

### Backup Strategy
- Automated database backups
- File system backup procedures for migrated objects
- Maintain rollback capability during migration
````