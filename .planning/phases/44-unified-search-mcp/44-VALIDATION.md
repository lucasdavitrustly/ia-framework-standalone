---
phase: 44
slug: unified-search-mcp
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-05-22
---

# Phase 44 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property               | Value                                                  |
| ---------------------- | ------------------------------------------------------ |
| **Framework**          | vitest                                                 |
| **Config file**        | vitest.config.ts (root)                                |
| **Quick run command**  | `pnpm --filter @ia-framework/mcp-server test -- --run` |
| **Full suite command** | `pnpm test --run`                                      |
| **Estimated runtime**  | ~15 seconds                                            |

---

## Sampling Rate

- **After every task commit:** Run `pnpm --filter @ia-framework/mcp-server test -- --run`
- **After every plan wave:** Run `pnpm test --run`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 15 seconds

---

## Per-Task Verification Map

| Task ID  | Plan | Wave | Requirement | Test Type | Automated Command                                                             | File Exists | Status     |
| -------- | ---- | ---- | ----------- | --------- | ----------------------------------------------------------------------------- | ----------- | ---------- |
| 44-01-01 | 01   | 1    | SRCH-04     | unit      | `pnpm --filter @ia-framework/mcp-server test -- --run result-formatting`      | ✅          | ⬜ pending |
| 44-01-02 | 01   | 1    | SRCH-01     | unit      | `pnpm --filter @ia-framework/mcp-server test -- --run search-codebase`        | ✅          | ⬜ pending |
| 44-01-03 | 01   | 1    | SRCH-01     | unit      | `pnpm --filter @ia-framework/mcp-server test -- --run search-codebase-hybrid` | ✅          | ⬜ pending |
| 44-02-01 | 02   | 2    | SRCH-03     | unit      | `pnpm --filter @ia-framework/mcp-server test -- --run get-file`               | ✅          | ⬜ pending |
| 44-02-02 | 02   | 2    | SRCH-03     | unit      | `pnpm --filter @ia-framework/mcp-server test -- --run get-dependencies`       | ✅          | ⬜ pending |

_Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky_

---

## Wave 0 Requirements

Existing infrastructure covers all phase requirements.

---

## Manual-Only Verifications

All phase behaviors have automated verification.

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
