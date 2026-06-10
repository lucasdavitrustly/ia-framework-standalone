# Quickstart: Detailed Ollama Error Reporting

**Feature**: 010-ollama-error-detail | **Date**: 2026-06-10

## Overview

This feature improves Ollama error diagnostics by:

1. **Capturing response body** — read Ollama's error message instead of discarding it
2. **Propagating error details** — include error info in pipeline skip messages
3. **Categorizing errors** — detect common failure modes and provide actionable guidance
4. **Truncating safely** — cap response bodies at 2KB to prevent log flooding

No behavioral changes to retry/skip logic. Only the information content of error messages is improved.

## Changes Summary

### Files Modified

| File                                          | Change                                                        |
| --------------------------------------------- | ------------------------------------------------------------- |
| `packages/indexer/src/enrichment/enricher.ts` | Read response body on error; include model name; format error |
| `packages/embedding/src/providers/ollama.ts`  | Include model name in error message                           |
| `packages/indexer/src/pipeline.ts`            | Capture error in embedding catch block; log details on skip   |

### Files Added

| File                                                          | Purpose                                                  |
| ------------------------------------------------------------- | -------------------------------------------------------- |
| `packages/indexer/src/errors/ollama-errors.ts`                | Error formatting utility (categorize, truncate, suggest) |
| `packages/indexer/src/errors/__tests__/ollama-errors.test.ts` | Unit tests for error formatting                          |

## Implementation Steps (TDD Order)

### Step 1: Create error formatting utility

```typescript
// packages/indexer/src/errors/ollama-errors.ts

export const MAX_ERROR_BODY_LENGTH = 2048;

export type OllamaErrorCategory =
  | 'connection'
  | 'model-not-found'
  | 'parse-failure'
  | 'server-error'
  | 'unknown';

export interface OllamaErrorContext {
  status?: number;
  body: string;
  model: string;
  baseUrl: string;
  phase: 'enrichment' | 'embedding';
}

export function categorizeOllamaError(ctx: OllamaErrorContext): OllamaErrorCategory { ... }
export function formatOllamaError(ctx: OllamaErrorContext): string { ... }
export function truncateBody(body: string, maxLength?: number): string { ... }
```

### Step 2: Fix enricher to read response body

```typescript
// packages/indexer/src/enrichment/enricher.ts — callOllama()

if (!response.ok) {
  const body = await response.text();
  const formatted = formatOllamaError({
    status: response.status,
    body,
    model: this.config.model,
    baseUrl: this.config.baseUrl,
    phase: 'enrichment',
  });
  throw new Error(formatted);
}
```

### Step 3: Handle connection errors in enricher

```typescript
// packages/indexer/src/enrichment/enricher.ts — callOllama() wrap fetch in try/catch

try {
  const response = await fetch(url, { ... });
  // ... existing logic with body reading
} catch (err) {
  if (err instanceof TypeError) {
    // Network error (connection refused, timeout)
    const formatted = formatOllamaError({
      body: err.message,
      model: this.config.model,
      baseUrl: this.config.baseUrl,
      phase: 'enrichment',
    });
    throw new Error(formatted);
  }
  throw err;
}
```

### Step 4: Fix pipeline embedding catch block

```typescript
// packages/indexer/src/pipeline.ts — embedding queue error handler

} catch (err) {
  const errorMsg = err instanceof Error ? err.message : String(err);
  skippedChunks += batch.length;
  logger.warn(
    { batchSize: batch.length, error: errorMsg },
    'Embedding batch skipped after retry failure',
  );
}
```

### Step 5: Add model name to embedding provider errors

```typescript
// packages/embedding/src/providers/ollama.ts — embedBatch()

if (!response.ok) {
  const error = await response.text();
  throw new Error(`Ollama embedding error (model: ${this.model}): ${response.status} — ${error}`);
}
```

## Configuration

No new configuration needed. The feature uses existing config values:

- `enrichment.model` — included in error messages
- `enrichment.baseUrl` — included in connection error messages
- Embedding model name — from `OllamaEmbeddingProvider` constructor

## Verification

```bash
# Run tests
pnpm --filter @ia-framework/indexer test
pnpm --filter @ia-framework/embedding test

# Full build
pnpm build

# Manual verification: stop Ollama and run indexing
ollama stop  # or kill the process
pnpm --filter @ia-framework/cli start -- index --force
# Expected: Clear message saying Ollama is unreachable at http://localhost:11434
#           with suggestion to run "ollama serve"

# Manual verification: use non-existent model
# (set model to "nonexistent-model" in project config)
pnpm --filter @ia-framework/cli start -- index --force
# Expected: Clear message with "model not found" + suggestion to "ollama pull <model>"
```

## Behavioral Notes

- Retry behavior is unchanged — errors are still retried per `retryAttempts` config
- Skip-on-failure behavior is unchanged — enrichment failures still skip gracefully
- The improved error messages appear on EACH retry attempt (helping diagnose intermittent issues)
- Response body truncation at 2KB applies to the logged output, not to error detection logic
- Connection errors are detected before any HTTP response processing (TypeError from fetch)
