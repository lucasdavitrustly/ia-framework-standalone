# Testing Patterns

**Analysis Date:** 2026-05-21

## Test Framework

**Runner:**

- Vitest v4.1.2
- No shared vitest config file — each package uses inline vitest defaults (ESM, TypeScript supported out of the box)

**Assertion Library:**

- Vitest built-in `expect` (Jest-compatible API)

**Run Commands:**

```bash
pnpm test                # Run all tests (via turbo)
pnpm --filter @ia-framework/core test   # Single package
vitest run               # In any package directory
vitest                   # Watch mode in any package
```

## Test File Organization

**Location:** Co-located with source files (same directory)

**Naming:** `{module-name}.test.ts` — matches source file name exactly

**Exceptions:** Some packages use `src/__tests__/` subdirectory for additional/grouped tests:

- `packages/benchmark/src/__tests__/baseline-runner.test.ts`
- `packages/indexer/src/__tests__/chunk-validator.test.ts`
- `packages/mcp-server/src/tools/__tests__/search-codebase-fallback.test.ts`

**76 test files** across 14 packages.

## Test Structure

**Suite Organization:**

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';

describe('ComponentName', () => {
  // Setup
  beforeEach(() => { ... });

  it('specific behavior description', async () => {
    // Arrange
    const mock = makeMockEngine([]);
    // Act
    const result = await handler(mock, { query: 'test' });
    // Assert
    expect(result).toBe(expected);
  });
});
```

**Naming conventions:**

- `describe` blocks use component/class name: `describe('BenchmarkRunner', () => ...)`
- Nested `describe` for methods: `describe('search_codebase handler', () => ...)`
- `it`/`test` descriptions state expected behavior: `'returns typed ProjectConfig when file is valid'`
- Some tests use numbered format: `'Test 1: run() with expectedFile at position 1 → hit=true'`

**Both `it` and `test` are used** — no enforced preference (both from vitest).

## Mocking

**Framework:** Vitest built-in `vi`

**Patterns:**

1. **Manual mock factories** (most common):

```typescript
function makeMockEngine(searchResults: RetrievalResult[] = []) {
  return {
    search: vi.fn().mockResolvedValue(searchResults),
    searchWithExpansion: vi.fn().mockResolvedValue(searchResults),
    getFile: vi.fn().mockResolvedValue([]),
  };
}
```

2. **Module mocking** (for dependencies):

```typescript
vi.mock('./llm-chunker.js', () => ({
  chunkFile: vi.fn(),
}));
```

3. **Inline mock resolution** (after vi.mock):

```typescript
const { chunkFile } = await import('./llm-chunker.js');
const mockChunkFile = vi.mocked(chunkFile);
mockChunkFile.mockResolvedValue({ chunks: [...] });
```

**What to Mock:**

- External services (vector store, embedding providers, databases)
- File system operations (use real temp dirs OR mock fs)
- Network calls
- Anything injected via dependency injection

**What NOT to Mock:**

- Pure logic/transformations (Zod schemas, parsers, formatters)
- The module under test itself

## Fixtures and Factories

**Test Data:** Factory functions with defaults + overrides pattern:

```typescript
function makeResult(overrides: Partial<RetrievalResult> = {}): RetrievalResult {
  return {
    chunkId: 'chunk-1',
    filePath: '/project/src/auth/middleware.ts',
    relativePath: 'src/auth/middleware.ts',
    language: 'typescript',
    chunkType: 'function',
    name: 'authMiddleware',
    content: 'export function authMiddleware() {}',
    startLine: 1,
    endLine: 3,
    imports: ['express'],
    exports: ['authMiddleware'],
    score: 0.92,
    matchedVector: 'text',
    ...overrides,
  };
}
```

**Naming:** Factory functions always prefixed with `make`: `makeResult`, `makeRun`, `makeConfig`, `makeMockEngine`

**Temp directories for integration tests:**

```typescript
let tmpDir: string;
beforeEach(async () => {
  tmpDir = join(tmpdir(), `ia-framework-test-${Date.now()}`);
  await mkdir(tmpDir, { recursive: true });
});
afterEach(async () => {
  await rm(tmpDir, { recursive: true, force: true });
});
```

## Coverage

**Requirements:** Not enforced (no coverage thresholds configured)

**View Coverage:**

```bash
vitest run --coverage      # In any package
```

**Coverage tool:** `@vitest/coverage-v8` (listed in stack)

## Test Types

**Unit Tests (primary):**

- Test individual functions/classes in isolation
- Mock all external dependencies
- Fast execution, no I/O (except temp dir tests)
- All 76 test files are unit tests

**Integration Tests:**

- Config loader tests use real filesystem (temp directories)
- LLM strategy tests write actual files to temp dirs
- No separate integration test directory — integrated into co-located tests

**E2E Tests:**

- Not present in the codebase

## Common Patterns

**Async Testing:**

```typescript
it('loads config from file', async () => {
  await writeFile(configPath, JSON.stringify(validConfig));
  const config = await loadConfig(configPath);
  expect(config.targetProjectPath).toBe('/Users/dev/my-app');
});
```

**Error Testing:**

```typescript
it('throws ConfigNotFoundError when file does not exist', async () => {
  await expect(loadConfig('/nonexistent')).rejects.toBeInstanceOf(ConfigNotFoundError);
});

it('throws ZodError when field is invalid', async () => {
  await expect(loadConfig(path)).rejects.toThrow(/targetProjectPath/i);
});
```

**Verifying mock calls:**

```typescript
it('calls searchEngine with query text', async () => {
  const engine = makeMockEngine([]);
  await searchCodebaseHandler(engine, { query: 'auth' });
  expect(engine.searchWithExpansion).toHaveBeenCalledWith(
    expect.objectContaining({ text: 'auth' }),
    expect.any(Object),
  );
});
```

**Numeric precision:**

```typescript
expect(result.mrr).toBeCloseTo(1.0, 5);
```

**UUID generation in tests:**

```typescript
runId: crypto.randomUUID(),  // Uses Node.js built-in crypto
```

## HTTP API Testing (Hono)

**Pattern for dashboard-api tests:**

```typescript
import { createApp } from './app.js';

const app = createApp(makeDeps());
const res = await app.request('/api/benchmarks');
expect(res.status).toBe(200);
const body = await res.json();
expect(body.runs).toHaveLength(2);
```

- Uses Hono's built-in `app.request()` — no HTTP server needed
- No supertest dependency

## TDD Approach

- Tests are written before/alongside implementation (project constraint)
- Test descriptions often encode expected behavior precisely
- Some use numbered test format mapping to acceptance criteria

---

_Testing analysis: 2026-05-21_
