# Implementation Plan: Detailed Ollama Error Reporting

**Branch**: `010-ollama-error-detail` | **Date**: 2026-06-10 | **Spec**: `specs/010-ollama-error-detail/spec.md`

**Input**: Feature specification from `/specs/010-ollama-error-detail/spec.md`

## Summary

Improve Ollama error diagnostics by capturing and displaying the full response body, model name, and actionable guidance when Ollama API calls fail during enrichment or embedding phases. Currently, the enricher discards the response body (only showing HTTP status text), and the embedding pipeline swallows the error object entirely in its catch handler. This makes it impossible for developers to diagnose failures without checking Ollama logs directly.

## Technical Context

**Language/Version**: TypeScript (strict mode), Node.js >= 22.0.0

**Primary Dependencies**: p-queue (concurrency), Ollama REST API (`/api/generate`, `/api/embed`), pino (structured logging)

**Storage**: N/A (no storage changes — error handling only)

**Testing**: Vitest (unit + integration), TDD required per constitution

**Target Platform**: macOS (Apple Silicon), Linux server

**Project Type**: Monorepo library/CLI/MCP-server (pnpm workspace with Turborepo)

**Performance Goals**: Zero additional latency on happy path; reading response body on error is negligible (<1ms)

**Constraints**: Must not change retry/skip behavior (FR-009); must not break existing test expectations; response body truncation at 2KB to prevent log flooding

**Scale/Scope**: 2 packages affected (indexer, embedding), 3-4 files modified, ~100-150 lines of code changes

## Constitution Check

_GATE: Must pass before Phase 0 research. Re-check after Phase 1 design._

| Principle                  | Status | Notes                                                                      |
| -------------------------- | ------ | -------------------------------------------------------------------------- |
| I. TDD                     | PASS   | Tests for error formatting, categorization, and propagation required       |
| II. TypeScript-Only        | PASS   | All changes in TypeScript with strict types                                |
| III. Local-First           | PASS   | Improves local Ollama experience; no cloud dependencies added              |
| IV. Monorepo Architecture  | PASS   | Changes scoped to `embedding` (provider) and `indexer` (enricher+pipeline) |
| V. Simplicity              | PASS   | No new abstractions — utility function + improved catch blocks             |
| VI. Incremental by Default | N/A    | No indexing behavior changes                                               |
| VII. MCP-First Interface   | N/A    | No MCP tool changes; error handling is internal to pipeline                |

**Gate Result**: PASS — No violations detected.

## Project Structure

### Documentation (this feature)

```text
specs/010-ollama-error-detail/
├── plan.md              # This file
├── spec.md              # Feature specification
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
└── quickstart.md        # Phase 1 output
```

### Source Code (repository root)

```text
packages/indexer/src/enrichment/enricher.ts       # Fix: read response body on error, include model name
packages/embedding/src/providers/ollama.ts         # Fix: include model name in error message
packages/indexer/src/pipeline.ts                   # Fix: propagate error details in embedding catch block
packages/indexer/src/errors/ollama-errors.ts       # NEW: error formatting utility (categorize, truncate, suggest)
packages/indexer/src/errors/__tests__/ollama-errors.test.ts  # NEW: unit tests for error utility
packages/indexer/src/__tests__/enricher-errors.test.ts       # NEW: enricher error handling tests
packages/embedding/src/providers/__tests__/ollama-errors.test.ts  # NEW: embedding error tests
```

**Structure Decision**: Changes are scoped to existing packages. One new utility file (`ollama-errors.ts`) provides shared error formatting logic used by both enricher and embedding pipeline. No new packages needed.

## Implementation Phases

### Phase 2: Error Formatting Utility (foundation)

**Purpose**: Create the shared error formatting function that categorizes Ollama errors and provides actionable guidance.

**Files**:

- `packages/indexer/src/errors/ollama-errors.ts` — Error formatting utility
- `packages/indexer/src/errors/__tests__/ollama-errors.test.ts` — Unit tests

**Logic**:

- `formatOllamaError(opts: { status?: number; body: string; model: string; baseUrl: string; phase: 'enrichment' | 'embedding' })` → formatted error string
- Categorizes errors: connection-refused, model-not-found, parse-failure, server-error, unknown
- Truncates body at 2KB with `... [truncated, full response was N bytes]` marker
- Appends actionable suggestion for known categories

### Phase 3: Enricher Error Fix

**Purpose**: Read the Ollama response body on non-2xx status and include it in the error message.

**Files**:

- `packages/indexer/src/enrichment/enricher.ts` — Fix `callOllama()` to read `response.text()` on error
- `packages/indexer/src/__tests__/enricher-errors.test.ts` — Tests for enricher error messages

**Changes**:

- Replace `throw new Error(\`Ollama API error: ${response.status} ${response.statusText}\`)` with proper body reading + formatting
- Add model name to error context
- Handle connection refused (TypeError from fetch) with URL + guidance

### Phase 4: Embedding Error Propagation

**Purpose**: Propagate the error object in the pipeline's embedding catch block instead of swallowing it.

**Files**:

- `packages/indexer/src/pipeline.ts` — Fix catch block to capture and log error details
- `packages/embedding/src/providers/ollama.ts` — Add model name to embedding error message

**Changes**:

- Pipeline catch block: capture `err` variable (currently bare `catch {}`), include error message in the skip log
- Embedding provider: include model name in error for context

### Phase 5: Integration & Validation

**Purpose**: Verify all error paths work together, run full test suite

**Files**:

- Full test suite validation
- Manual verification with common error scenarios

## Dependencies & Execution Order

```
Phase 2 (utility) ──→ Phase 3 (enricher) ──→ Phase 4 (embedding) ──→ Phase 5 (validation)
```

- Phase 2 provides the shared utility used by Phases 3 and 4
- Phase 3 and 4 could run in parallel but sequenced for clarity
- Phase 5 validates everything together

## Risk Assessment

| Risk                                    | Probability | Impact | Mitigation                                                |
| --------------------------------------- | ----------- | ------ | --------------------------------------------------------- |
| Reading response body fails (stream)    | Low         | Low    | Wrap in try/catch, fall back to status text               |
| Large error body floods structured logs | Low         | Medium | 2KB truncation (FR-008)                                   |
| Changed error messages break tests      | Medium      | Low    | Tests assert on behavior, not exact error strings         |
| Response body reading adds latency      | Negligible  | None   | Only occurs on error path (already a slow/failed request) |

## Complexity Tracking

> No violations detected — section intentionally left empty.
