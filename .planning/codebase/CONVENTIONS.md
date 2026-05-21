# Coding Conventions

**Analysis Date:** 2026-05-21

## Naming Patterns

**Files:**

- `kebab-case.ts` for all source files (e.g., `search-engine.ts`, `benchmark-runner.ts`, `query-intelligence.ts`)
- `kebab-case.test.ts` for co-located test files
- `index.ts` for barrel exports in each package/directory

**Functions:**

- `camelCase` for all functions: `loadConfig`, `createLogger`, `searchCodebaseHandler`
- Factory functions prefixed with `create` or `make`: `createMcpServer`, `createLogger`, `createSearchByModuleAdapter`
- Test helper functions prefixed with `make`: `makeResult`, `makeMockEngine`, `makeConfigSnapshot`

**Variables:**

- `camelCase` for variables and parameters
- `UPPER_CASE` not used — env vars accessed via `process.env['LOG_LEVEL']` (bracket notation)

**Types/Interfaces:**

- `PascalCase` for all types and interfaces: `BenchmarkRun`, `QueryResult`, `ProjectConfig`
- Interfaces for domain models — no `I` prefix
- Type aliases for unions: `BenchmarkToolStatus = 'ready' | 'fallback' | 'blocked'`
- Suffix with purpose: `*Config`, `*Options`, `*Result`, `*Error`

**Classes:**

- `PascalCase`: `BenchmarkRunner`, `ConfigNotFoundError`, `IndexingStateManager`
- Custom errors extend `Error` with `this.name = 'ClassName'`

## Code Style

**Formatting:**

- Prettier v3
- Single quotes
- Trailing commas
- 2-space indentation
- Semicolons always

**Linting:**

- ESLint v9 (flat config)
- `typescript-eslint` v8 for type-aware rules
- `eslint-config-prettier` to avoid conflicts

**TypeScript:**

- `strict: true` in `tsconfig.base.json`
- `exactOptionalPropertyTypes: true`
- `noUncheckedIndexedAccess: true`
- `noImplicitReturns: true`
- Target: `ES2022`, Module: `NodeNext`, ModuleResolution: `NodeNext`
- All packages are ESM-only (`"type": "module"`)

## Import Organization

**Order:**

1. Node built-ins with `node:` prefix: `import { readFile } from 'node:fs/promises';`
2. External packages: `import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';`
3. Workspace packages: `import type { RetrievalResult } from '@ia-framework/retrieval';`
4. Relative imports: `import { ProjectConfigSchema } from './schema.js';`

**Rules:**

- Always use `.js` extension in relative imports (NodeNext resolution)
- Use `import type` for type-only imports: `import type { SearchEngine } from '@ia-framework/retrieval';`
- Separate `import type` from value imports

**Path Aliases:**

- None — all imports use relative paths or workspace package names (`@ia-framework/*`)

## Error Handling

**Patterns:**

- Custom error classes extending `Error` with explicit `this.name`:

```typescript
export class ConfigNotFoundError extends Error {
  constructor(public readonly path: string) {
    super(`Config file not found: ${path}`);
    this.name = 'ConfigNotFoundError';
  }
}
```

- Catch-rethrow for fs operations (catch generic → throw domain-specific)
- Async functions return `Promise<T>` — never throw synchronously from async
- Optional properties use `| undefined` explicitly: `runIntegrity?: 'full' | 'partial' | 'unknown' | undefined`

## Logging

**Framework:** pino (structured JSON to stderr)

**Pattern:**

```typescript
import { createLogger } from '@ia-framework/core';
const logger = createLogger('component-name');
```

- Always output to stderr (fd 2) to avoid contaminating MCP stdio transport on stdout
- Log level from `process.env['LOG_LEVEL']` defaulting to `'info'`
- Base field includes `component` name

## Comments

**When to Comment:**

- JSDoc on all exported functions and interfaces
- Brief inline comments for non-obvious logic
- No redundant comments restating code

**JSDoc Style:**

```typescript
/** A single benchmark query with expected file(s) that should appear in top-K results. */
export interface BenchmarkQuery { ... }

/**
 * Create and configure an MCP server with all retrieval tools registered.
 * Returns the McpServer instance — call server.connect(transport) to start.
 */
export function createMcpServer(config: McpServerConfig): McpServer { ... }
```

## Function Design

**Size:** Small, focused. Most functions are under 30 lines.

**Parameters:** Use options objects for 3+ parameters:

```typescript
export interface McpServerConfig {
  searchEngine: SearchEngine;
  serverName?: string | undefined;
  serverVersion?: string | undefined;
  metricsStore?: MetricsStore | undefined;
}
```

**Return Values:** Always typed. Use domain interfaces, never raw objects.

## Module Design

**Exports:**

- Named exports only — no default exports
- Each package has `src/index.ts` barrel that re-exports public API
- Types co-exported: `export type { ProjectConfig } from './types/index.js';`

**Barrel Files:**

- One `index.ts` per package at `src/index.ts`
- Sub-directories may have `index.ts` for grouping (e.g., `src/types/index.ts`)

**Package Structure:**

- Each package in `packages/` is `@ia-framework/{name}`
- Single entry point: `src/index.ts` → built to `dist/index.js`
- ESM-only output via tsup

## Dependency Injection

**Pattern:** Constructor/function parameter injection — no DI framework

```typescript
export function createMcpServer(config: McpServerConfig): McpServer { ... }
```

- Dependencies passed as interfaces, not concrete implementations
- Enables testing with mocks passed directly

---

_Convention analysis: 2026-05-21_
