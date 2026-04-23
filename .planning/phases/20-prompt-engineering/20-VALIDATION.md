---
phase: 20
slug: prompt-engineering
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-23
---

# Phase 20 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property               | Value                                                                                                    |
| ---------------------- | -------------------------------------------------------------------------------------------------------- |
| **Framework**          | vitest                                                                                                   |
| **Config file**        | packages/indexer/vitest.config.ts, packages/cli/vitest.config.ts, packages/vector-store/vitest.config.ts |
| **Quick run command**  | `pnpm --filter @ia-framework/indexer test`                                                               |
| **Full suite command** | `pnpm test`                                                                                              |
| **Estimated runtime**  | ~30 seconds                                                                                              |

---

## Sampling Rate

- **After every task commit:** Run `pnpm --filter @ia-framework/indexer test`
- **After every plan wave:** Run `pnpm test`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 30 seconds

---

## Per-Task Verification Map

| Task ID  | Plan | Wave | Requirement               | Test Type   | Automated Command                                                               | File Exists | Status     |
| -------- | ---- | ---- | ------------------------- | ----------- | ------------------------------------------------------------------------------- | ----------- | ---------- |
| 20-01-01 | 01   | 1    | PRMT-01                   | unit        | `cd packages/indexer && npx vitest run src/strategies/prompt-examples.test.ts`  | ❌ W0       | ⬜ pending |
| 20-01-02 | 01   | 1    | PRMT-01, PRMT-02, PRMT-03 | unit        | `cd packages/indexer && npx vitest run src/strategies/prompt.test.ts`           | ❌ W0       | ⬜ pending |
| 20-02-01 | 02   | 1    | PRMT-04                   | unit        | `cd packages/indexer && npx vitest run src/strategies/quality-scorer.test.ts`   | ❌ W0       | ⬜ pending |
| 20-02-02 | 02   | 1    | PRMT-04                   | integration | `cd packages/indexer && npx vitest run && cd ../vector-store && npx vitest run` | ✅          | ⬜ pending |
| 20-03-01 | 03   | 2    | PRMT-05                   | type-check  | `cd packages/cli && npx tsc --noEmit`                                           | ✅          | ⬜ pending |
| 20-03-02 | 03   | 2    | PRMT-05                   | unit        | `cd packages/cli && npx vitest run src/commands/prompt.command.test.ts`         | ❌ W0       | ⬜ pending |

_Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky_

---

## Wave 0 Requirements

- [ ] `packages/indexer/src/strategies/prompt-examples.test.ts` — stubs for PRMT-01
- [ ] `packages/indexer/src/strategies/prompt.test.ts` — stubs for PRMT-01, PRMT-02, PRMT-03
- [ ] `packages/indexer/src/strategies/quality-scorer.test.ts` — stubs for PRMT-04
- [ ] `packages/cli/src/commands/prompt.command.test.ts` — stubs for PRMT-05

_All four test files are created as part of TDD tasks within their respective plans (tdd="true" tasks write tests first)._

---

## Manual-Only Verifications

_All phase behaviors have automated verification._

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
