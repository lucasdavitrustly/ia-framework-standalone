---
phase: 31-dynamic-retrieval-cost-cap
verified: 2026-04-30T15:15:50Z
status: passed
score: 9/9 must-haves verified
re_verification: false
---

# Phase 31: Dynamic Retrieval Cost Cap — Verification Report

**Phase Goal:** Prevent runaway token consumption in retrieval by adding a configurable per-call token cap that trims results before returning them to the LLM.
**Verified:** 2026-04-30T15:15:50Z
**Status:** ✅ PASSED
**Re-verification:** No — initial verification

---

## Goal Achievement

### Observable Truths

| #   | Truth                                                                                     | Status     | Evidence                                                                    |
| --- | ----------------------------------------------------------------------------------------- | ---------- | --------------------------------------------------------------------------- |
| 1   | Token estimation returns `ceil(content.length / 4)` for any chunk                         | ✓ VERIFIED | `token-cap.ts:24` — `return Math.ceil(content.length / 4)`                  |
| 2   | `applyTokenCap` trims lowest-ranked results when total tokens exceed cap                  | ✓ VERIFIED | Implementation loops in rank order, breaks when budget exceeded             |
| 3   | At least 1 result always returned even if it alone exceeds the cap                        | ✓ VERIFIED | `if (wouldExceed && i > 0)` — first result always included                  |
| 4   | Config schema accepts `retrieval.maxTokensPerCall` as optional number                     | ✓ VERIFIED | `schema.ts:55` — `maxTokensPerCall: z.number().int().positive().optional()` |
| 5   | `search_codebase` tool trims results when total tokens exceed configured cap              | ✓ VERIFIED | `search-codebase.ts:300-336` — full cap logic wired                         |
| 6   | `search_codebase_hybrid` tool trims results when total tokens exceed configured cap       | ✓ VERIFIED | `search-codebase-hybrid.ts:98-99` — `applyTokenCap` called                  |
| 7   | Response metadata includes `token_cap_applied` and `results_trimmed` when trimming occurs | ✓ VERIFIED | Both handlers spread cap metadata into `structuredContent`                  |
| 8   | `expand_hops` results get 30% of budget, direct results get 70% (search_codebase only)    | ✓ VERIFIED | `search-codebase.ts:311-312` — `directBudget = Math.floor(maxTokens * 0.7)` |
| 9   | Default cap is 6000 tokens when config doesn't specify `maxTokensPerCall`                 | ✓ VERIFIED | Both handlers: `?? 6000` fallback                                           |

**Score:** 9/9 truths verified

---

### Required Artifacts

| Artifact                                                  | Expected                              | Status     | Details                                                                             |
| --------------------------------------------------------- | ------------------------------------- | ---------- | ----------------------------------------------------------------------------------- |
| `packages/mcp-server/src/tools/token-cap.ts`              | Token cap utility                     | ✓ VERIFIED | Exports `estimateTokens`, `applyTokenCap`, `TokenCapResult`; 68 lines of real logic |
| `packages/mcp-server/src/tools/token-cap.test.ts`         | Unit tests                            | ✓ VERIFIED | Covers no-trim, trim, minimum-1, empty cases                                        |
| `packages/core/src/config/schema.ts`                      | Config schema with `maxTokensPerCall` | ✓ VERIFIED | `maxTokensPerCall: z.number().int().positive().optional()` at line 55               |
| `packages/mcp-server/src/tools/search-codebase.ts`        | Token-capped search handler           | ✓ VERIFIED | Contains `applyTokenCap` with 70/30 budget split                                    |
| `packages/mcp-server/src/tools/search-codebase-hybrid.ts` | Token-capped hybrid search handler    | ✓ VERIFIED | Contains `applyTokenCap`                                                            |

---

### Key Link Verification

| From                        | To                         | Via                               | Status  | Details                             |
| --------------------------- | -------------------------- | --------------------------------- | ------- | ----------------------------------- |
| `token-cap.ts`              | `@ia-framework/retrieval`  | `import type { RetrievalResult }` | ✓ WIRED | Line 1 of token-cap.ts              |
| `search-codebase.ts`        | `token-cap.ts`             | `import { applyTokenCap }`        | ✓ WIRED | Line 8; used at lines 314, 315, 321 |
| `search-codebase-hybrid.ts` | `token-cap.ts`             | `import { applyTokenCap }`        | ✓ WIRED | Line 7; used at line 99             |
| `search-codebase.ts`        | `ObservabilityConfig`      | `maxTokensPerCall?: number`       | ✓ WIRED | Line 48; read at line 300           |
| `search-codebase-hybrid.ts` | `options.maxTokensPerCall` | `?? 6000` default                 | ✓ WIRED | Lines 62, 98                        |

---

### Requirements Coverage

No formal requirement IDs assigned (internal improvement). Phase goal fully achieved.

---

### Anti-Patterns Found

None. No TODOs, stubs, placeholder returns, or empty implementations detected.

---

### Test Results

| Test File                                                      | Tests                | Status    |
| -------------------------------------------------------------- | -------------------- | --------- |
| `packages/mcp-server/src/tools/token-cap.test.ts`              | Included in 23 total | ✅ PASSED |
| `packages/mcp-server/src/tools/search-codebase.test.ts`        | Included in 23 total | ✅ PASSED |
| `packages/mcp-server/src/tools/search-codebase-hybrid.test.ts` | Included in 23 total | ✅ PASSED |
| `packages/core/src/config/schema.test.ts`                      | 14 tests             | ✅ PASSED |

All 37 tests pass across both packages.

---

### Human Verification Required

None. The token cap is a pure algorithmic feature fully verifiable through tests and code inspection.

---

## Summary

Phase 31 fully achieves its goal. The token cap utility (`applyTokenCap` / `estimateTokens`) is implemented, tested, and wired into both search tool handlers. Both tools enforce the 6000-token default soft cap, trim lowest-ranked results when the budget is exceeded, include `token_cap_applied` + `results_trimmed` metadata in response envelopes, and `search_codebase` correctly applies a 70/30 budget split between direct and hierarchy-expansion results. The config schema accepts an optional `maxTokensPerCall` override. All tests pass.

---

_Verified: 2026-04-30T15:15:50Z_
_Verifier: the agent (gsd-verifier)_
