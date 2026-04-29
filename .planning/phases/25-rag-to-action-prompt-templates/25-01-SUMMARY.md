---
plan: 25-01
phase: 25-rag-to-action-prompt-templates
status: complete
started: 2026-04-28
completed: 2026-04-28
---

## Summary

Created the intent detection module and prompt template registry for RAG-to-action scaffolding. The `detectIntent()` function classifies queries using keyword heuristics into `impact-analysis` or `dependency-trace` intents. The template registry maps each intent to a structured prompt template string.

## Key Files

### Created

- `packages/mcp-server/src/templates/intent-detector.ts` — `detectIntent(query)` with 13 impact + 8 dependency keyword patterns
- `packages/mcp-server/src/templates/impact-analysis.ts` — Impact analysis template (4-step scaffolding)
- `packages/mcp-server/src/templates/dependency-trace.ts` — Dependency trace template (4-step scaffolding)
- `packages/mcp-server/src/templates/registry.ts` — `getTemplate(intent)` + `TEMPLATES` ReadonlyMap
- `packages/mcp-server/src/templates/index.ts` — Barrel re-exports
- `packages/mcp-server/src/templates/__tests__/intent-detector.test.ts` — 17 tests
- `packages/mcp-server/src/templates/__tests__/registry.test.ts` — 6 tests

## Test Results

23/23 tests passing.

## Deviations

None.

## Self-Check: PASSED
