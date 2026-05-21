# Codebase Concerns

**Analysis Date:** 2026-05-21

## Tech Debt

**Large God-file in MCP search tool:**

- Issue: `packages/mcp-server/src/tools/search-codebase.ts` is 881 lines — handles classification, routing, expansion, formatting, logging, and fallback in one file
- Files: `packages/mcp-server/src/tools/search-codebase.ts`
- Impact: Hard to modify one concern without risk to others; test file is also 549 lines
- Fix approach: Extract classification, expansion logic, and logging into separate modules

**Type safety bypasses in observability logging:**

- Issue: Uses `as any` to duck-type logger interface instead of proper typing
- Files: `packages/mcp-server/src/tools/search-codebase.ts` (lines 328-329)
- Impact: Silent failures if logger interface changes; no compile-time checking
- Fix approach: Define a proper `ObservabilityWithLogger` interface and use type narrowing

**Console.log sprawl in CLI and dashboard:**

- Issue: 250+ `console.log/warn/error` calls in production code instead of structured logging
- Files: `packages/cli/src/commands/status.command.ts`, `packages/dashboard-api/src/server.ts`, and others
- Impact: No log levels, no structured output, hard to filter/parse in production
- Fix approach: Use the existing `@ia-framework/core` logger (pino) throughout; only CLI user-facing output should use console

**Swallowed errors with empty catch blocks:**

- Issue: 10+ `catch {}` blocks that silently discard errors with no logging or re-throw
- Files: `packages/benchmark/src/corpus.ts:152`, `packages/benchmark/src/corpus-generator.ts:60`, `packages/dashboard-api/src/server.ts:58`, `packages/dashboard-api/src/routes/status.ts:39`, `packages/dashboard-api/src/routes/indexing.ts:33`
- Impact: Errors vanish silently; debugging production issues becomes guesswork
- Fix approach: At minimum log at debug level; for user-facing code, surface degraded state

**TODO comments in production code:**

- Issue: Outstanding TODOs indicate incomplete implementations
- Files: `packages/retrieval/src/search-engine.ts:219`, `packages/indexer/src/strategies/llm-strategy.ts:282`
- Impact: Missing debug logging reduces observability; validation reporting not connected
- Fix approach: Implement the logging calls and wire up validation report

## Security Considerations

**Environment variable access scattered:**

- Risk: `process.env` accessed directly in multiple packages without validation
- Files: `packages/dashboard-api/src/server.ts`, `packages/dashboard-api/src/routes/status.ts`, `packages/db-context/src/loader.ts`
- Current mitigation: Some defaults provided via `??` operator
- Recommendations: Centralize env parsing with Zod schema validation at startup; fail fast on missing required vars

**No input sanitization on MCP tool inputs:**

- Risk: Search queries passed directly to Qdrant without sanitization
- Files: `packages/mcp-server/src/tools/search-codebase.ts`
- Current mitigation: Zod schema validates shape but not content
- Recommendations: Add length limits and character filtering for query strings

## Performance Bottlenecks

**Synchronous SQLite in dashboard API:**

- Problem: `better-sqlite3` is synchronous — blocks the event loop during queries
- Files: `packages/dashboard-api/src/` (uses better-sqlite3 for metrics)
- Cause: better-sqlite3 API is inherently blocking
- Improvement path: Acceptable for single-user local tool; if dashboard serves multiple users, wrap in worker threads or switch to async driver

**881-line search handler complexity:**

- Problem: Each MCP search call traverses classification → routing → expansion → formatting pipeline in one synchronous chain
- Files: `packages/mcp-server/src/tools/search-codebase.ts`
- Cause: All logic in one function with many conditional branches
- Improvement path: Profile actual latency; consider parallelizing independent expansion paths

## Test Coverage Gaps

**40+ source modules without corresponding test files:**

- What's not tested: `call-extractor`, `config-watcher`, `dependency-trace`, `file-walker`, `framework`, `get-dependencies`, `get-file`, `impact-analysis`, `incremental`, `llm-chunker`, `multi-hop`, `result-formatting`, `search-synonyms`, and others
- Files: Various across `packages/mcp-server/src/`, `packages/indexer/src/`, `packages/retrieval/src/`
- Risk: Regressions in file walking, dependency tracing, and incremental indexing go undetected
- Priority: High — these are core framework capabilities

**No integration tests:**

- What's not tested: End-to-end flow from indexing → Qdrant storage → MCP search → result formatting
- Files: No `tests/integration/` directory exists
- Risk: Individual units pass but system fails when composed
- Priority: Medium — manual testing via OpenCode catches most issues but is not repeatable

## Fragile Areas

**MCP Server Engine interface:**

- Files: `packages/mcp-server/src/tools/search-codebase.ts` (Engine type, lines 14-47)
- Why fragile: Engine is defined as a local type with many optional methods (`scrollForHierarchy?`, `scrollForImplementations?`, etc.). Any retrieval package change requires manual sync.
- Safe modification: Add new optional methods only; never change existing signatures
- Test coverage: 549-line test file covers main paths but optional methods lack coverage

**Install script shell sourcing chain:**

- Files: `install.sh`, `scripts/check-prerequisites.sh`, `scripts/install-docker.sh`, `scripts/install-node.sh`, `scripts/install-ollama.sh`, `scripts/install-opencode.sh`, `scripts/start-services.sh`, `scripts/init-config.sh`
- Why fragile: 8 sourced scripts share global scope; variable name collisions possible
- Safe modification: Test each script in isolation; use function prefixes
- Test coverage: No automated tests for installer

## Dependencies at Risk

**Zod v4 migration:**

- Risk: Project uses `zod ^4.3.6` but MCP SDK peer dep is `^3.25 || ^4.0`. Breaking API changes between v3→v4 could surface in transitive deps.
- Impact: Schema validation failures at runtime if any dep still imports zod v3
- Migration plan: Monitor — pnpm strict mode should catch version conflicts

## Missing Critical Features

**No structured logging framework wired throughout:**

- Problem: `@ia-framework/core` has a logger (`packages/core/src/logger/index.ts`) but most packages use `console.*` directly
- Blocks: Production debugging, log aggregation, performance tracing

**No graceful degradation on Qdrant unavailability:**

- Problem: If Qdrant is down, MCP server errors propagate to AI agent
- Blocks: Offline development workflows without Docker running

---

_Concerns audit: 2026-05-21_
