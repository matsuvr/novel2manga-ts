# Technology Stack

## Architecture

Documentation-driven framework built on Claude Code's native extensibility features, deployed on Cloudflare Workers. The architecture consists of four main layers:

1. **Command Layer**: Markdown-based slash commands with dynamic content generation
2. **Automation Layer**: Python-based hooks for automated progress tracking and validation
3. **Knowledge Layer**: Structured markdown documents for persistent project context
4. **Deployment Layer**: Cloudflare Workers with OpenNext adapter for edge computing

## Core Technologies

### Claude Code Platform
- **Base Platform**: Claude Code CLI (Anthropic's official Claude interface)
- **Model**: Claude Sonnet 4 (claude-sonnet-4-20250514)
- **Extension System**: Native hooks and slash commands support
- **Context Management**: Built-in compaction with preservation hooks

### Command System
- **Definition Format**: Markdown files with YAML frontmatter
- **Dynamic Content**: Bash execution (`!command`) and file inclusion (`@file.md`)
- **Argument Passing**: `$ARGUMENTS` variable for parameter handling
- **Tool Restrictions**: `allowed-tools` specification for security

### Hook System
- **Configuration**: JSON-based hook definitions in `.claude/settings.json`
- **Execution Environment**: Python 3 scripts with JSON I/O
- **Event Types**: PostToolUse, PreToolUse, PreCompact, Stop
- **Performance**: Configurable timeouts (5-10 seconds typical)

### Web Framework
- **Framework**: Next.js 15.4.4 (App Router)
- **UI Library**: React 19.1.0
- **Styling**: Tailwind CSS 4.1.11
- **TypeScript**: 5.8.3

### Deployment Platform
- **Runtime**: Cloudflare Workers (Edge Computing)
- **Adapter**: @opennextjs/cloudflare 1.6.1
- **CLI**: Wrangler 4.26.0
- **Compatibility**: Node.js compatibility flag enabled
- **Caching**: Cloudflare KV for edge caching
- **Image Optimization**: Cloudflare Images integration

### AI/ML Integration
- **AI SDK**: @ai-sdk/openai 1.3.23
- **Framework**: Mastra 0.10.15
- **Vector DB**: Mastra Memory 0.11.5
- **Database**: Mastra LibSQL 0.11.2

### Data Storage (Novel-to-Manga Project)
- **Database**: Cloudflare D1 (SQLite at edge)
- **Object Storage**: Cloudflare R2 (for text files, analysis results, YAML layouts)
- **File Structure**:
  - Novels: `novels/{novelId}/original.txt`
  - Chunks: `novels/{novelId}/chunks/chunk_{index}.txt`
  - Analysis: `novels/{novelId}/analysis/*.json`
  - Layouts: `novels/{novelId}/episodes/{n}/pages/{n}/layout.yaml`

## Development Environment

### Required Tools
- **Claude Code**: Latest version with hooks and slash commands support
- **Python 3**: For hook scripts (progress tracking, validation)
- **Git**: For version control and change detection
- **Markdown Editor**: For document editing and review
- **Node.js**: >= 20.9.0 (for local development)
- **Wrangler CLI**: For Cloudflare Workers deployment

### Project Structure
```
.claude/
├── commands/kiro/           # Slash command definitions
│   ├── steering*.md         # Steering management commands
│   ├── spec-*.md           # Specification workflow commands
│   └── *.md                # Additional command definitions
├── scripts/                 # Hook automation scripts
│   ├── check-steering-drift.py
│   ├── update-spec-progress.py
│   └── preserve-spec-context.py
└── settings.json           # Hook configuration

.kiro/
├── steering/               # Project knowledge documents
│   ├── product.md
│   ├── tech.md
│   └── structure.md
└── specs/                  # Feature specifications
    └── [feature-name]/
        ├── spec.json       # Metadata and approval flags
        ├── requirements.md
        ├── design.md
        └── tasks.md
```

## Common Commands

### Core Workflow Commands
```bash
# Steering management (recommended unified command)
/kiro:steering                    # Smart create/update steering documents

# Specification workflow
/kiro:spec-init [description]     # Initialize new specification
/kiro:spec-requirements [name]    # Generate requirements document
/kiro:spec-design [name]          # Generate technical design
/kiro:spec-tasks [name]           # Generate implementation tasks
/kiro:spec-status [name]          # Check progress and compliance
```

### Cloudflare Workers Commands
```bash
# Development
npm run dev                       # Local Next.js development
npm run preview                   # Preview with Cloudflare Workers runtime
npm run cf-typegen               # Generate CloudflareEnv types

# Deployment
npm run build                     # Build Next.js app
npm run deploy                    # Deploy to Cloudflare Workers

# OpenNext specific
opennextjs-cloudflare build      # Build for Cloudflare Workers
opennextjs-cloudflare preview    # Local preview with workerd runtime
opennextjs-cloudflare deploy     # Deploy to production
```

### Legacy Commands (Deprecated)
```bash
# These commands are maintained for compatibility but not recommended
/kiro:steering-init              # [DEPRECATED] Use /kiro:steering instead
/kiro:steering-update            # [DEPRECATED] Use /kiro:steering instead
/kiro:steering-custom            # Still used for specialized steering documents
```

### Manual Operations
```bash
# Project setup (one-time)
cp -r .claude/ /your-project/     # Copy command definitions
cp CLAUDE.md /your-project/       # Copy project configuration

# Progress management
# Edit spec.json manually to approve phases:
# "requirements": true, "design": true, "tasks": true
```

## Environment Variables

### Claude Code Configuration
- **CLAUDE_HOOKS_ENABLED**: Enable hook system (default: true)
- **CLAUDE_COMMAND_TIMEOUT**: Command execution timeout (default: 120s)
- **CLAUDE_CONTEXT_PRESERVATION**: Enable context hooks (default: true)

### Project Configuration
- **KIRO_LANGUAGE**: Default language for generated content (ja/en/zh-TW)
- **KIRO_STEERING_MODE**: Steering inclusion mode (always/conditional/manual)
- **KIRO_SPEC_VALIDATION**: Enable specification validation (default: true)

### Cloudflare Workers Configuration
- **OPENAI_API_KEY**: OpenAI API key for AI generation (required)
- **MASTRA_DB_URL**: Database connection URL (optional)
- **NEXT_PUBLIC_APP_URL**: Public application URL (optional)
- **CF_ACCOUNT_ID**: Cloudflare account ID (for deployment)
- **CF_API_TOKEN**: Cloudflare API token (for deployment)

## Hook Configuration Details

### PostToolUse Hooks
```json
{
  "matcher": "Edit|MultiEdit|Write",
  "hooks": [
    {
      "type": "command",
      "command": "python3 .claude/scripts/check-steering-drift.py",
      "timeout": 10
    }
  ]
}
```

### PreCompact Hooks  
```json
{
  "matcher": ".*",
  "hooks": [
    {
      "type": "command", 
      "command": "python3 .claude/scripts/preserve-spec-context.py",
      "timeout": 5
    }
  ]
}
```

## Performance Characteristics

- **Command Execution**: 2-5 seconds for simple commands, 10-30 seconds for document generation
- **Hook Overhead**: 1-3 seconds per file operation when hooks are active
- **Context Preservation**: 95%+ success rate in maintaining spec context during compaction
- **Steering Accuracy**: Automated drift detection with ~90% precision for significant changes
- **Edge Response Time**: <50ms p50 latency with Cloudflare Workers global network
- **Cold Start**: ~200ms for Workers, minimized by edge caching
- **Cache Hit Rate**: 85%+ with Cloudflare KV and Tiered Cache

## Integration Points

### Git Integration
- Hook scripts detect file changes using git status
- Commit messages can reference specification phases
- Steering drift detection based on git diff analysis

### Documentation Systems
- Compatible with standard markdown documentation workflows
- Generates content suitable for wikis, README files, and technical documentation
- Supports multi-language documentation maintenance

### CI/CD Compatibility
- Hook scripts can be adapted for continuous integration
- Specification compliance can be validated in automated pipelines
- Progress tracking suitable for project management tool integration
- Cloudflare Workers deployment via Wrangler CLI
- GitHub Actions integration for automated deployments

### Cloudflare Services Integration
- **Workers KV**: For persistent caching and session storage
- **D1 Database**: SQLite at the edge for structured data
  - Novel metadata, job tracking, chunk management
  - Episode and manga page relationships
  - Optimized for small metadata, references to R2 objects
- **R2 Storage**: Object storage for large files
  - Original novel texts (can be several MB)
  - Chunked text files for parallel processing
  - JSON analysis results (5要素抽出データ)
  - YAML layout definitions for manga pages
  - Generated preview images
- **Images**: Automatic image optimization and resizing
- **AI Workers**: Potential integration for edge AI inference