---
phase: "03-indexing-pipeline"
plan: "02"
subsystem: "embedding"
tags: ["embedding", "openai", "ollama", "strategy-pattern", "provider-agnostic"]
dependency_graph:
  requires: ["01-02"]
  provides: ["EmbeddingProvider", "createEmbeddingProvider()"]
  affects: ["03-04-indexer", "04-retrieval"]
tech_stack:
  added: []
  patterns: ["Strategy pattern for provider abstraction", "native fetch for HTTP calls", "factory function"]
key_files:
  created:
    - packages/embedding/src/interface.ts
    - packages/embedding/src/providers/openai.ts
    - packages/embedding/src/providers/ollama.ts
    - packages/embedding/src/factory.ts
    - packages/embedding/src/factory.test.ts
    - packages/embedding/src/index.ts
    - packages/embedding/package.json
    - packages/embedding/tsconfig.json
    - packages/embedding/tsup.config.ts
decisions:
  - "Native fetch (Node.js 22 built-in) used instead of OpenAI SDK — avoids heavy dependency for two HTTP calls"
  - "Default dimension lookup table covers common models without requiring explicit config"
  - "estimateTokens uses 4-chars/token rough estimate — accurate enough for usage tracking"
  - "Same provider interface for both text and code embeddings — Phase 3 uses same model for both"
metrics:
  duration: "6 minutes"
  completed: "2026-04-01"
  tasks_completed: 3
  files_created: 9
  tests_added: 8
---

# Phase 3 Plan 02: Embedding Package Summary

**One-liner:** Strategy pattern embedding abstraction with OpenAI and Ollama providers using native fetch, factory-selected from config.

## What Was Built

The `@ia-framework/embedding` package provides:
- `EmbeddingProvider` interface with `embed()`, `embedBatch()`, `estimateTokens()`
- `OpenAIEmbeddingProvider` — uses native fetch to POST to `/v1/embeddings` (or custom baseUrl for OpenAI-compatible APIs)
- `OllamaEmbeddingProvider` — uses native fetch to POST to `/api/embed` at localhost:11434
- `createEmbeddingProvider(config)` — factory function that selects provider from `EmbeddingProviderConfig`

## Decisions Made

1. **Native fetch instead of OpenAI SDK** — Zero additional dependencies. Node.js 22 has built-in fetch. Two HTTP calls don't warrant the SDK's 50+ transitive dependencies.
2. **Default dimension table** — Common models have well-known dimensions. Fallback is 1536 (OpenAI default). User can always override via config.
3. **Same provider for text + code vectors** — Phase 3 uses one embedding provider for both named vectors. Phase 7 benchmarks will evaluate code-specialized models.

## Test Results

All 8 TDD tests pass:
- ✅ OpenAI provider creation with correct name/model/dimensions
- ✅ Ollama provider creation with correct name/model/dimensions  
- ✅ Unknown provider throws descriptive error
- ✅ estimateTokens returns positive number
- ✅ estimateTokens returns 0 for empty string
- ✅ OpenAI embed() calls correct endpoint with Authorization header
- ✅ OpenAI embedBatch() returns ordered vectors for 3 inputs
- ✅ Ollama embed() calls correct /api/embed endpoint

## Deviations from Plan

None — plan executed exactly as written.

## Self-Check: PASSED

- [x] packages/embedding/src/interface.ts — FOUND
- [x] packages/embedding/src/providers/openai.ts — FOUND
- [x] packages/embedding/src/providers/ollama.ts — FOUND
- [x] packages/embedding/src/factory.ts — FOUND
- [x] packages/embedding/dist/index.js — FOUND
- [x] Commit 3c4e253 — FOUND
