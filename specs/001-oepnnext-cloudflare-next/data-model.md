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
users → novels → jobs → chunks → episodes → outputs
       ↓        ↓       ↓        ↓
accounts   storageFiles  tokenUsage  renderStatus
sessions              layoutStatus
authenticators        chunkAnalysisStatus
```

## Data Migration Strategy

### Current State
- Database: Already SQLite3 (no schema changes needed)
- Storage: Mix of local files and Cloudflare R2
- Configuration: Environment variables + Cloudflare bindings

### Migration Requirements
1. **Database**: No changes needed (already SQLite3)
2. **Storage**: Migrate R2 objects to local file system
3. **Configuration**: Convert Cloudflare bindings to environment variables

### Storage Migration Mapping
| Cloudflare R2 Bucket | Local Path | Content Type |
|---------------------|------------|--------------|
| NOVEL_STORAGE | ./storage/novels/ | Original novel files |
| CHUNKS_STORAGE | ./storage/chunks/ | Text chunks |
| ANALYSIS_STORAGE | ./storage/analysis/ | Analysis results |
| LAYOUTS_STORAGE | ./storage/layouts/ | Layout data |
| RENDERS_STORAGE | ./storage/renders/ | Rendered images |
| OUTPUTS_STORAGE | ./storage/outputs/ | Final exports |

### Configuration Migration
| Cloudflare Binding | Environment Variable | Purpose |
|-------------------|-------------------|---------|
| CACHE.DB | CACHE_DATABASE_PATH | SQLite cache database |
| DB | DATABASE_URL | Main database connection |
| KV.CACHE | CACHE_FILE_PATH | Key-value cache file |

## Validation Rules

### Data Integrity
- All foreign key relationships must be preserved
- File path references must be updated to local paths
- Job status and progress tracking must remain consistent

### Performance Considerations
- Local file access is faster than R2 API calls
- SQLite3 performance will improve without network latency
- Consider implementing file cleanup policies for local storage

### Backup Strategy
- Implement automated database backups
- Create file system backup procedures
- Maintain migration rollback capability