# Codebase Structure

**Analysis Date:** 2026-05-21

## Directory Layout

```
ia-framework/
├── packages/               # Library packages (core domain logic)
│   ├── core/               # Shared types, config, logging
│   ├── ast-parser/         # Tree-sitter code chunking
│   ├── embedding/          # Embedding provider abstraction
│   ├── vector-store/       # Qdrant client wrapper
│   ├── retrieval/          # Search engine, reranking, RRF
│   ├── indexer/            # Indexing pipeline + strategies
│   ├── mcp-server/         # MCP protocol server + tools
│   ├── cli/                # Commander-based CLI
│   ├── observability/      # Metrics, token counting
│   ├── dashboard-api/      # Hono HTTP API for dashboard
│   ├── project-detector/   # Target project auto-detection
│   ├── db-context/         # PostgreSQL schema indexing
│   └── benchmark/          # RAG quality evaluation
├── apps/                   # Application packages
│   └── dashboard/          # React SPA (Vite)
├── scripts/                # Dev/build helper scripts
├── spike/                  # Experimental prototypes
│   └── llm-chunking/       # LLM chunking spike
├── docs/                   # Documentation
├── manager/                # Manager utilities
├── .planning/              # GSD workflow artifacts
│   ├── codebase/           # Architecture docs (this file)
│   ├── phases/             # Phase plans (01-41+)
│   └── quick/              # Quick task plans
├── .ia-framework/          # Framework runtime state (for self-indexing)
├── docker-compose.yml      # Qdrant + dashboard containers
├── turbo.json              # Turborepo task config
├── pnpm-workspace.yaml     # Workspace package locations
├── tsconfig.base.json      # Shared TS config
├── eslint.config.js        # Shared ESLint flat config
├── .prettierrc             # Prettier config
├── install.sh              # One-shot installer script
└── package.json            # Root workspace package
```

## Directory Purposes

**`packages/core/`:**

- Purpose: Foundation types and utilities shared by all packages
- Contains: Config loader/schema, logger, types, Maven parser, query intelligence
- Key files: `src/index.ts` (barrel), `src/config/loader.ts`, `src/config/schema.ts`, `src/types/index.ts`

**`packages/retrieval/`:**

- Purpose: Search orchestration layer — the brain of the retrieval system
- Contains: SearchEngine, MultiCollectionSearchEngine, reranking algos (MMR, BM25, RRF), dependency graph, elbow detection
- Key files: `src/search-engine.ts`, `src/multi-collection-search-engine.ts`, `src/mmr.ts`, `src/rrf.ts`, `src/dependency-graph.ts`

**`packages/indexer/`:**

- Purpose: Converts source code into indexed vector chunks
- Contains: Pipeline orchestrator, chunking strategies, file walker, incremental logic, concept generator
- Key files: `src/pipeline.ts`, `src/strategies/ast-strategy.ts`, `src/strategies/llm-strategy.ts`, `src/strategies/types.ts`

**`packages/mcp-server/`:**

- Purpose: AI-facing interface — exposes retrieval as MCP tools
- Contains: Server setup, tool modules, query classification, prompt templates
- Key files: `src/bin.ts` (entry), `src/server.ts` (factory), `src/tools/search-codebase.ts`, `src/tools/search-codebase-hybrid.ts`

**`packages/cli/`:**

- Purpose: Developer-facing interface for all framework operations
- Contains: Command modules using Commander.js
- Key files: `src/bin.ts` (entry), `src/commands/index.command.ts`, `src/commands/init.command.ts`

**`packages/dashboard-api/`:**

- Purpose: HTTP API backend for monitoring dashboard
- Contains: Hono app, route handlers, config watcher, search history
- Key files: `src/server.ts`, `src/app.ts`, `src/routes/`

**`apps/dashboard/`:**

- Purpose: React frontend for monitoring and tuning
- Contains: Pages, components, API client layer
- Key files: `src/App.tsx`, `src/main.tsx`, `src/pages/`, `src/components/`

## Key File Locations

**Entry Points:**

- `packages/cli/src/bin.ts`: CLI entry (runs as `ia-framework`)
- `packages/mcp-server/src/bin.ts`: MCP server entry (spawned by OpenCode)
- `packages/dashboard-api/src/server.ts`: Dashboard API entry
- `apps/dashboard/src/main.tsx`: Dashboard frontend entry
- `install.sh`: First-time setup script

**Configuration:**

- `turbo.json`: Build task graph
- `pnpm-workspace.yaml`: Workspace package list
- `tsconfig.base.json`: Shared TypeScript settings
- `eslint.config.js`: Linting rules
- `.prettierrc`: Formatting rules
- `docker-compose.yml`: Container orchestration
- `.env.example`: Required environment variables template

**Core Logic:**

- `packages/indexer/src/pipeline.ts`: Main indexing pipeline
- `packages/retrieval/src/search-engine.ts`: Core search logic
- `packages/retrieval/src/multi-collection-search-engine.ts`: Multi-collection orchestration
- `packages/mcp-server/src/server.ts`: MCP server factory
- `packages/core/src/config/loader.ts`: Config loading

**Testing:**

- Co-located with source: `*.test.ts` next to `*.ts`
- Dedicated test dirs: `packages/*/src/__tests__/`

## Naming Conventions

**Files:**

- `kebab-case.ts`: All source files (e.g., `search-engine.ts`, `file-walker.ts`)
- `*.test.ts`: Test files co-located with source
- `*.command.ts`: CLI command modules
- `index.ts`: Barrel exports per package

**Directories:**

- `kebab-case/`: All directories
- `src/`: Source code root in every package
- `dist/`: Build output (gitignored)

**Packages:**

- Scoped: `@ia-framework/<name>` (internal workspace references)
- Names match directory: `packages/core` → `@ia-framework/core`

## Where to Add New Code

**New MCP Tool:**

- Implementation: `packages/mcp-server/src/tools/<tool-name>.ts`
- Tests: `packages/mcp-server/src/tools/<tool-name>.test.ts`
- Register in: `packages/mcp-server/src/server.ts`

**New CLI Command:**

- Implementation: `packages/cli/src/commands/<name>.command.ts`
- Tests: `packages/cli/src/commands/<name>.command.test.ts`
- Register in: `packages/cli/src/bin.ts`

**New Retrieval Algorithm:**

- Implementation: `packages/retrieval/src/<algorithm>.ts`
- Tests: `packages/retrieval/src/<algorithm>.test.ts`
- Export from: `packages/retrieval/src/index.ts`

**New Chunking Strategy:**

- Implementation: `packages/indexer/src/strategies/<name>-strategy.ts`
- Tests: `packages/indexer/src/strategies/<name>-strategy.test.ts`
- Interface: `packages/indexer/src/strategies/types.ts`

**New Embedding Provider:**

- Implementation: `packages/embedding/src/providers/<name>.ts`
- Register in: `packages/embedding/src/factory.ts`

**New Dashboard Route:**

- Implementation: `packages/dashboard-api/src/routes/<name>.ts`
- Tests: `packages/dashboard-api/src/routes/<name>.test.ts`
- Mount in: `packages/dashboard-api/src/app.ts`

**New Dashboard Page:**

- Page: `apps/dashboard/src/pages/<Name>.tsx`
- Components: `apps/dashboard/src/components/<feature>/`

**New Shared Type/Utility:**

- Implementation: `packages/core/src/types/` or relevant subdirectory
- Export from: `packages/core/src/index.ts`

## Special Directories

**`.ia-framework/`:**

- Purpose: Runtime state for self-indexing (project.json, metrics.sqlite, graph.sqlite)
- Generated: Yes (by `ia-framework init`)
- Committed: Partially (project.json yes, \*.sqlite no)

**`.planning/`:**

- Purpose: GSD workflow artifacts (phase plans, quick tasks, codebase docs)
- Generated: Yes (by GSD commands)
- Committed: Yes

**`dist/`** (in each package):

- Purpose: Compiled JavaScript output
- Generated: Yes (by `turbo build` / `tsup`)
- Committed: No

**`spike/`:**

- Purpose: Experimental prototypes and research code
- Generated: No (manually created)
- Committed: Yes

---

_Structure analysis: 2026-05-21_
