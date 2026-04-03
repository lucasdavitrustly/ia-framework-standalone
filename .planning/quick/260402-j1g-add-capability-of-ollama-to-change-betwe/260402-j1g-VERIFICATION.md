---
phase: quick-260402-j1g
verified: 2026-04-02T18:15:00Z
status: passed
score: 6/6 must-haves verified
gaps: []
human_verification:
  - test: "Run install.sh through Ollama section with at least one model already pulled"
    expected: "Numbered model list shown with [embed] hints, custom entry option, selected model used in project.json"
    why_human: "Interactive terminal prompt flow cannot be automated in static analysis"
  - test: "Run `ia-framework index --model mxbai-embed-large` against a fresh project"
    expected: "Model auto-pulled if missing, dimensions discovered, indexing completes with model saved to indexing-state.json"
    why_human: "Requires live Ollama service and Qdrant to validate end-to-end"
  - test: "After indexing with model A, re-run with --model B (different dimensions)"
    expected: "Warning displayed with previous vs new model info, user prompted for y/N, 'y' deletes and re-indexes, 'N' aborts cleanly"
    why_human: "Interactive confirmation prompt + live Qdrant state needed"
---

# Quick Task 260402-j1g: Ollama Embedding Model Selection — Verification Report

**Task Goal:** Add capability of Ollama to change between LLMs for embedding. User needs to choose/add one during install.sh, and can add others later. Every time we index the database we should choose which LLM to use.
**Verified:** 2026-04-02T18:15:00Z
**Status:** passed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | User can select an Ollama embedding model during install.sh (shown existing models + custom entry) | ✓ VERIFIED | `install-ollama.sh` has `select_embedding_model()` function (lines 11-98) with `ollama list`, numbered menu with [embed] hints, custom entry as last option, and fallback for no models |
| 2 | User can override the embedding model at index time via --model flag | ✓ VERIFIED | `index.command.ts` line 108: `.option('-m, --model <name>', ...)` with full handling at lines 122-148 including dimension discovery |
| 3 | Model is auto-pulled if not locally available when --model is used | ✓ VERIFIED | `index.command.ts` lines 123-127: `isModelAvailable()` checks `/api/tags`, `pullModel()` calls `POST /api/pull` with stream:false |
| 4 | Dimension mismatch between new model and existing collection triggers warning + confirmation | ✓ VERIFIED | `index.command.ts` lines 158-194: checks `existingDimensions !== configuredDimensions` OR `lastModel !== currentModel`, prints clear warning, prompts via `readline/promises` |
| 5 | If user confirms re-index, old collection is deleted and fresh index starts | ✓ VERIFIED | `index.command.ts` lines 182-185: `vectorStore.deleteCollection()` called on 'y', `options.force = true` set; lines 186-188: abort exits cleanly |
| 6 | Selected model persists in project.json config | ✓ VERIFIED | Install-time: `SELECTED_EMBED_MODEL` → `init-config.sh` → `detect-project.mjs` → `persistProfile()`. Index-time: model saved to `indexing-state.json` via `saveLastIndexedCommit()` (line 244-249) |

**Score:** 6/6 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `packages/embedding/src/factory.ts` | `discoverDimensions()` + `DEFAULT_DIMENSIONS` export | ✓ VERIFIED | 3-tier strategy (known map → /api/show → /api/embed), 96 lines, fully implemented |
| `packages/embedding/src/index.ts` | Re-exports discoverDimensions and DEFAULT_DIMENSIONS | ✓ VERIFIED | Line 1: `export { ..., discoverDimensions, DEFAULT_DIMENSIONS } from './factory.js'` |
| `packages/vector-store/src/interface.ts` | `deleteCollection()` in VectorStore interface | ✓ VERIFIED | Line 115: `deleteCollection(): Promise<void>` with JSDoc |
| `packages/vector-store/src/qdrant.ts` | `deleteCollection()` implementation | ✓ VERIFIED | Lines 139-141: delegates to `client.deleteCollection(this.collectionName)` |
| `packages/indexer/src/incremental.ts` | `embeddingModel` field + getter/setter | ✓ VERIFIED | `embeddingModel?: string` in IndexingState (line 12), `getLastEmbeddingModel()` (lines 29-37), `saveLastIndexedCommit` 4th arg (line 43) |
| `packages/indexer/src/index.ts` | Re-exports `getLastEmbeddingModel` | ✓ VERIFIED | Line 9: `getLastEmbeddingModel` in export block |
| `packages/cli/src/commands/index.command.ts` | `--model` flag, auto-pull, mismatch detection, re-index flow | ✓ VERIFIED | 256 lines, all features implemented: `--model` option, `isModelAvailable()`, `pullModel()`, `promptModelSelection()`, mismatch block, `saveLastIndexedCommit` with model |
| `packages/project-detector/src/persister.ts` | `embeddingDimensions` in PersistOptions | ✓ VERIFIED | Line 8: `embeddingDimensions?: number`, line 43: spread into embedding config |
| `scripts/install-ollama.sh` | Model selection menu with ollama list + custom entry | ✓ VERIFIED | `select_embedding_model()` function (lines 11-98), exports `SELECTED_EMBED_MODEL` and `SELECTED_EMBED_DIMS` |
| `scripts/init-config.sh` | Consumes SELECTED_EMBED_MODEL/DIMS env vars | ✓ VERIFIED | Line 64: passes to detect-project.mjs; lines 81-83: fallback template uses env vars |
| `scripts/detect-project.mjs` | Accepts embedModel/embedDims args, passes to persistProfile | ✓ VERIFIED | Line 11: destructures 4 args; lines 29-36: builds persistOptions with model/dims/provider |
| `packages/embedding/src/factory.test.ts` | Tests for discoverDimensions | ✓ VERIFIED | 8 test cases covering known models, :latest stripping, /api/show, /api/embed fallback, error case, DEFAULT_DIMENSIONS |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `index.command.ts` | `factory.ts` | `discoverDimensions()` | ✓ WIRED | Import line 5, usage lines 130, 144 |
| `index.command.ts` | `qdrant.ts` | `deleteCollection()` | ✓ WIRED | Import line 6 (QdrantVectorStore), usage line 183 |
| `index.command.ts` | `incremental.ts` | `embeddingModel` | ✓ WIRED | Import line 9 (getLastEmbeddingModel, saveLastIndexedCommit), usage lines 164, 244-249 |
| `install-ollama.sh` | `init-config.sh` | `SELECTED_EMBED_MODEL` env var | ✓ WIRED | Export lines 96-97 in install-ollama.sh, consumed line 64 and lines 81-83 in init-config.sh |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|----------|
| OLLAMA-MODEL-SELECT | 260402-j1g-PLAN.md | Add capability to select/change Ollama embedding model | ✓ SATISFIED | Install-time selection menu, --model CLI flag, mismatch detection, config persistence |

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| _(none found)_ | — | — | — | — |

No TODO, FIXME, PLACEHOLDER, or stub patterns detected in any modified files.

### Script Syntax Validation

| Script | Validation | Result |
|--------|-----------|--------|
| `scripts/install-ollama.sh` | `bash -n` | ✓ Valid |
| `scripts/init-config.sh` | `bash -n` | ✓ Valid |
| `scripts/detect-project.mjs` | `node --check` | ✓ Valid |

### Commit Verification

| Task | Commit | Message | Status |
|------|--------|---------|--------|
| Task 1 | `08735e5` | feat: core infra — discoverDimensions, deleteCollection, embeddingModel state | ✓ Verified |
| Task 2 | `a0eacc9` | feat: CLI --model flag with auto-pull, mismatch detection, re-index | ✓ Verified |
| Task 3 | `6d5b611` | feat: install-time model selection with interactive menu | ✓ Verified |

### Human Verification Required

### 1. Install-time model selection UX

**Test:** Run `./install.sh` (or source `install-ollama.sh` and call `install_ollama`) with at least one Ollama model pre-pulled.
**Expected:** Numbered model list displays with [embed] hints on known embedding models, custom entry available as last option, selected model written to project.json with correct dimensions.
**Why human:** Interactive terminal prompt flow with user input cannot be verified through static analysis.

### 2. --model auto-pull and dimension discovery

**Test:** Run `ia-framework index --model mxbai-embed-large` against a project with a different model currently configured.
**Expected:** Model auto-pulled if not local, dimensions correctly discovered, indexing completes, model name saved to indexing-state.json.
**Why human:** Requires live Ollama service and Qdrant to validate the full pull → discover → index → save flow.

### 3. Mismatch detection and re-index confirmation

**Test:** Index a project with model A, then re-run with `--model B` (different dimension count).
**Expected:** Clear warning showing "Previous model: A (Xd vectors) / New model: B (Yd vectors)", user prompted with y/N, 'y' deletes collection and re-indexes from scratch, 'N' aborts cleanly with no changes.
**Why human:** Interactive confirmation prompt behavior and real Qdrant collection state transitions cannot be tested statically.

### Gaps Summary

No gaps found. All 6 observable truths are verified with full implementation evidence. All 12 artifacts exist, are substantive (no stubs), and are properly wired. All 4 key links are confirmed connected. All scripts pass syntax validation. All 3 task commits are verified in git history.

---

_Verified: 2026-04-02T18:15:00Z_
_Verifier: the agent (gsd-verifier)_
