<!--
## Sync Impact Report
- Version change: N/A → 1.0.0
- Added principles: I. TDD, II. TypeScript-Only, III. Local-First,
  IV. Monorepo Architecture, V. Simplicity, VI. Incremental by Default,
  VII. MCP-First Interface
- Added sections: Technology Constraints, Development Workflow, Governance
- Removed sections: None (initial ratification)
- Templates requiring updates:
  - .specify/templates/plan-template.md ✅ no changes needed
  - .specify/templates/spec-template.md ✅ no changes needed
  - .specify/templates/tasks-template.md ✅ no changes needed
- Follow-up TODOs: None
-->

# ia-framework Constitution

## Core Principles

### I. TDD (Non-Negotiable)

Tests MUST be written before implementation code. The Red-Green-Refactor
cycle is strictly enforced:

1. Write a failing test that defines the expected behavior
2. Implement the minimum code to make the test pass
3. Refactor while keeping tests green

Vitest is the sole test framework. No implementation code MUST be merged
without corresponding test coverage. Integration tests are required for
cross-package interactions and MCP tool contracts.

**Rationale**: TDD ensures correctness, documents intent, and prevents
regressions in a framework where retrieval quality is measurable.

### II. TypeScript-Only

All source code MUST be written in TypeScript with strict type checking
enabled (`strict: true` in tsconfig). No `.js` source files are permitted
except generated build outputs.

- Zod 4 MUST be used for runtime validation of external inputs
- Type aliases MUST use descriptive suffixes (`*Config`, `*Result`, `*Options`)
- Interfaces define domain models without `I` prefix

**Rationale**: Strong typing catches errors at compile time and serves as
living documentation in a monorepo with many internal contracts.

### III. Local-First

All core functionality MUST run locally without external service
dependencies:

- Qdrant runs locally via Docker
- Ollama provides local embeddings
- SQLite (better-sqlite3) stores metrics
- No authentication system, no multi-tenancy

Cloud providers (OpenAI) are optional adapter implementations behind
shared interfaces. The framework MUST remain fully functional with only
local infrastructure.

**Rationale**: A local-first RAG framework ensures developer privacy,
eliminates network latency for indexing, and removes cost barriers.

### IV. Monorepo Architecture

All components live in a single pnpm workspace repository:

- Packages MUST be independently buildable and testable
- Circular dependencies between packages are forbidden
- Turborepo orchestrates builds with proper dependency ordering
- Each package has a clear, singular purpose
- Barrel exports (`index.ts`) define public API boundaries

**Rationale**: Co-location simplifies cross-cutting changes, ensures
atomic commits across packages, and enables shared tooling configuration.

### V. Simplicity & No Heavy Abstractions

- No LangChain, LlamaIndex, or similar heavyweight frameworks
- Custom lightweight adapters are preferred over framework lock-in
- YAGNI: features MUST NOT be built speculatively
- Complexity MUST be justified in PR descriptions when introduced
- Prefer explicit code over clever abstractions

**Rationale**: Heavy abstractions obscure behavior, complicate debugging,
and introduce unnecessary dependency surfaces in a domain where precise
control over retrieval pipelines is critical.

### VI. Incremental by Default

All indexing and processing operations MUST be incremental:

- Use git-diff to detect changed files since last indexed commit
- Only re-index files that have actually changed
- Full reindex is an explicit opt-in escape hatch, never the default
- Prompt hash tracking prevents unnecessary LLM re-summarization

**Rationale**: Incremental operations keep indexing fast (seconds not
minutes), reduce compute costs, and enable tight feedback loops.

### VII. MCP-First Interface

The framework exposes functionality to AI assistants via MCP tools over
stdio transport:

- OpenCode is the primary consumer of MCP tools
- Tools MUST return structured, parseable responses
- CLI commands exist for operations/debugging, not as the primary interface
- Tool registration follows `@modelcontextprotocol/sdk` conventions

**Rationale**: MCP is the standard protocol for AI-assistant tool use.
Designing MCP-first ensures the framework integrates seamlessly with its
primary consumer without adaptation layers.

## Technology Constraints

### Runtime & Build

- **Runtime**: Node.js >= 22.0.0
- **Package Manager**: pnpm 10+ with workspaces
- **Build**: Turborepo + tsup (esbuild-based bundling)
- **Dev Runner**: tsx for development execution

### Infrastructure

- **Vector Database**: Qdrant (Docker container, required)
- **Metrics Storage**: better-sqlite3 (SQLite, embedded)
- **Embeddings**: Ollama (local, default) or OpenAI (cloud, optional)
- **AST Parsing**: web-tree-sitter (WASM grammars for TS, JS, Python, Java)

### Libraries & Validation

- **Validation**: Zod 4 for all external input schemas
- **CLI**: Commander.js
- **API**: Hono + @hono/node-server
- **Frontend**: React 19 + Vite + Tailwind + Recharts

### Code Quality

- **Linting**: ESLint 9 (flat config) + typescript-eslint v8
- **Formatting**: Prettier v3 (single quotes, trailing commas, 2-space indent)
- **Type Checking**: TypeScript strict mode across all packages

### Distribution

- Private/internal project only — no public registry publishing
- No authentication system, no multi-tenancy
- Docker Compose for infrastructure (Qdrant + Dashboard)

## Development Workflow

### Pre-Implementation Requirements

Before starting any new feature or significant change, developers and AI
assistants MUST consult the `.planning/` directory for prior decisions:

- `codebase/ARCHITECTURE.md` — current architecture and package boundaries
- `codebase/STRUCTURE.md` — project layout and file organization
- `codebase/CONVENTIONS.md` — naming patterns and code style
- `codebase/STACK.md` — technology stack decisions
- `codebase/CONCERNS.md` — known issues and technical debt
- `phases/` — previous implementation decisions, context, and verification
- `MILESTONES.md` — project roadmap and completed phases
- `RETROSPECTIVE.md` — lessons learned from past work

These documents capture decisions from the prior SDD framework and MUST
be treated as authoritative context for maintaining consistency.

### Quality Gates

- All PRs MUST pass `pnpm test` and `pnpm build` before merge
- Benchmark regressions (MRR drop > 5%) block merges
- Code conventions in `.planning/codebase/CONVENTIONS.md` are authoritative
- New packages MUST include a README with purpose and public API docs

### Process

- Commit after each logical unit of work
- Branch naming: `###-feature-name` (numeric prefix for phase tracking)
- Test files co-located with source (`*.test.ts` alongside `*.ts`)
- Integration tests in dedicated `__tests__/` or `tests/` directories

## Governance

This constitution supersedes all other development practices, informal
agreements, and ad-hoc conventions. When conflict arises between this
document and any other guidance, this document prevails.

### Amendment Procedure

1. Document the proposed change with rationale
2. Determine version bump type (MAJOR/MINOR/PATCH per semantic versioning)
3. Update this file with the change and new version
4. Include a migration plan if the change affects existing code or workflows
5. Record the amendment in the Sync Impact Report (HTML comment at top)

### Versioning Policy

- **MAJOR**: Principle removal, redefinition, or backward-incompatible
  governance change
- **MINOR**: New principle added, existing guidance materially expanded
- **PATCH**: Clarifications, typo fixes, non-semantic wording improvements

### Compliance

- Every PR review MUST verify alignment with core principles
- Constitution violations MUST be flagged and resolved before merge
- Complexity introduced MUST be justified against Principle V (Simplicity)

**Version**: 1.0.0 | **Ratified**: 2026-06-01 | **Last Amended**: 2026-06-01
