---
phase: 12
slug: llm-chunking-spike
status: draft
nyquist_compliant: true
wave_0_complete: true
created: 2026-04-09
---

# Phase 12 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property               | Value                                                                  |
| ---------------------- | ---------------------------------------------------------------------- |
| **Framework**          | vitest (existing) + tsx for spike script execution                     |
| **Config file**        | `spike/llm-chunking/tsconfig.json`                                     |
| **Quick run command**  | `npx tsx spike/llm-chunking/src/run-spike.ts --dry-run`                |
| **Full suite command** | `npx tsx spike/llm-chunking/src/run-spike.ts`                          |
| **Estimated runtime**  | ~120-300 seconds (depends on model speed, includes 5 determinism runs) |

---

## Sampling Rate

- **After every task commit:** Run `npx tsx spike/llm-chunking/src/run-spike.ts --dry-run` (validates file discovery + prompt generation without Ollama)
- **After every plan wave:** Run full spike `npx tsx spike/llm-chunking/src/run-spike.ts`
- **Before `/gsd-verify-work`:** Full spike report must exist with GO/NO-GO verdict
- **Max feedback latency:** 300 seconds (spike involves LLM calls)

---

## Per-Task Verification Map

| Task ID  | Plan | Wave | Requirement | Test Type   | Automated Command                                       | File Exists | Status     |
| -------- | ---- | ---- | ----------- | ----------- | ------------------------------------------------------- | ----------- | ---------- |
| 12-01-01 | 01   | 1    | INDX-13     | integration | `npx tsx spike/llm-chunking/src/run-spike.ts --dry-run` | ❌ W0       | ⬜ pending |
| 12-01-02 | 01   | 1    | INDX-13     | integration | `npx tsx spike/llm-chunking/src/run-spike.ts`           | ❌ W0       | ⬜ pending |
| 12-01-03 | 01   | 1    | INDX-13     | manual      | Human reviews GO/NO-GO report                           | N/A         | ⬜ pending |

_Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky_

---

## Wave 0 Requirements

- [x] Existing test infrastructure (vitest) covers unit tests
- [x] tsx already available as root dev dependency
- [x] @ia-framework/ast-parser available for AST comparison
- [x] @ia-framework/core available for config loading

_Existing infrastructure covers all phase requirements. Spike is a standalone script — no new test framework needed._

---

## Manual-Only Verifications

| Behavior                  | Requirement | Why Manual                                                                                          | Test Instructions                                                                                                                                                      |
| ------------------------- | ----------- | --------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GO/NO-GO decision quality | INDX-13     | Requires human judgment on evidence quality, latency acceptability, and boundary quality assessment | Read markdown report in `.planning/phases/12-llm-chunking-spike/`, verify latency table, determinism results, and AST comparison are comprehensive enough for decision |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 300s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
