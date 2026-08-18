# LESSONS — auto-maintained by scripts/lessons.py

> Machine-owned. Do NOT hand-edit. Changes are overwritten on the next `lessons.py` write.
> Canonical state lives in `.specs/lessons.json`. Edit lessons only via the script.
> promote_threshold=2 distinct features · window_days=45 · quarantine_threshold=2

## Confirmed (load these at Specify/Design)

Corroborated across multiple features. Safe to apply as guidance.

_none_

## Candidates (under observation — do NOT load as guidance yet)

Seen once or not yet corroborated. Tracked, not trusted.

### L-001 — When a requirement is about what the caller finally receives, assert on the serialized response payload, not on the intermediate object that produces it — otherwise removing the whole step keeps the suite green.
- signal: `surviving_mutant` · recurrence: 1 feature(s) · scope: `packages/mcp-server` · harmful: 0
- features: 019-rag-correctness-exact-context
- evidence: M1: packages/mcp-server/src/tools/search-codebase.ts:1290 (packages/mcp-server)
- last seen: 2026-08-12T20:03:25Z

### L-002 — For any reported metric, assert its computed value and not merely that its key is present in the response.
- signal: `surviving_mutant` · recurrence: 1 feature(s) · scope: `packages/mcp-server` · harmful: 0
- features: 019-rag-correctness-exact-context
- evidence: M2: packages/mcp-server/src/tools/search-codebase.ts:1380 (packages/mcp-server)
- last seen: 2026-08-12T20:03:25Z

### L-003 — Never assert a call argument with expect.any/objectContaining when the argument's exact contents are the security or isolation boundary being tested.
- signal: `surviving_mutant` · recurrence: 1 feature(s) · scope: `packages/retrieval` · harmful: 0
- features: 019-rag-correctness-exact-context
- evidence: M3: packages/retrieval/src/search-engine.ts:284 (packages/retrieval)
- last seen: 2026-08-12T20:03:25Z

### L-004 — A fallback chain (a || b || c) needs an explicit test that the lower-priority branch is NOT taken when the higher-priority value exists.
- signal: `surviving_mutant` · recurrence: 1 feature(s) · scope: `packages/mcp-server` · harmful: 0
- features: 019-rag-correctness-exact-context
- evidence: M6: packages/mcp-server/src/context/assembler.ts:136 (packages/mcp-server)
- last seen: 2026-08-12T20:03:25Z

### L-005 — When a requirement says a policy governs EVERY route, enumerate the routes and assert the policy on each one; a single happy-path route leaves early returns unguarded.
- signal: `ac_gap` · recurrence: 1 feature(s) · scope: `packages/mcp-server` · harmful: 0
- features: 019-rag-correctness-exact-context
- evidence: BUD-01 / packages/mcp-server/src/tools/search-codebase.ts:850,895,999 (packages/mcp-server)
- last seen: 2026-08-12T20:03:34Z

### L-006 — A guard behind an optional-config early-return is dead until a production caller supplies that config — assert the wiring end-to-end, not just the guard in isolation.
- signal: `ac_gap` · recurrence: 1 feature(s) · scope: `packages/vector-store` · harmful: 0
- features: 019-rag-correctness-exact-context
- evidence: EMB-09 / packages/vector-store/src/qdrant.ts:273 (packages/vector-store)
- last seen: 2026-08-12T20:03:34Z

### L-007 — If a degraded/compact form is supposed to cost less, assert the reduced cost; changing only a form label leaves the estimate unchanged and the branch unreachable.
- signal: `ac_gap` · recurrence: 1 feature(s) · scope: `packages/mcp-server` · harmful: 0
- features: 019-rag-correctness-exact-context
- evidence: BUD-10 / packages/mcp-server/src/context/budget.ts:158-167 (packages/mcp-server)
- last seen: 2026-08-12T20:03:34Z

### L-008 — An absence assertion (not.toContain) is only meaningful if the fixture could plausibly have produced the string; otherwise it is a tautology.
- signal: `ac_gap` · recurrence: 1 feature(s) · harmful: 0
- features: 019-rag-correctness-exact-context
- evidence: packages/mcp-server/src/tools/search-codebase.test.ts:419
- last seen: 2026-08-12T20:03:34Z

### L-009 — Never guard an assertion behind a conditional (if (x) expect(...)) — if the value can be absent, assert which case is expected.
- signal: `spec_precision_gap` · recurrence: 1 feature(s) · harmful: 0
- features: 019-rag-correctness-exact-context
- evidence: packages/mcp-server/src/context/budget.test.ts:216-218
- last seen: 2026-08-12T20:03:42Z

### L-010 — Do not verify a source-free or size-bounded claim against an empty result set; the risk only exists when results are present.
- signal: `spec_precision_gap` · recurrence: 1 feature(s) · harmful: 0
- features: 019-rag-correctness-exact-context
- evidence: packages/mcp-server/src/context/diagnostics.test.ts:126,132
- last seen: 2026-08-12T20:03:42Z

### L-011 — Do not report planned values as executed values; if a spec distinguishes skipped from executed-with-zero-results, the response must carry what actually ran.
- signal: `ac_gap` · recurrence: 1 feature(s) · scope: `packages/mcp-server` · harmful: 0
- features: 019-rag-correctness-exact-context
- evidence: packages/mcp-server/src/tools/search-codebase.ts:306 (packages/mcp-server)
- last seen: 2026-08-12T20:03:42Z

### L-012 — Before trusting a surviving mutant, confirm the mutated site actually reaches the output; a value later overwritten downstream yields a false survival.
- signal: `surviving_mutant` · recurrence: 1 feature(s) · scope: `mcp-server` · harmful: 0
- features: 019-rag-correctness-exact-context
- evidence: validation.md iteration-2 sensor table, mutation M2-trap (search-codebase.ts:1870 estimated vs :1922 estimated_tokens) (mcp-server)
- last seen: 2026-08-13T18:20:19Z

### L-013 — A requirement naming several enforcement sites is only met when every named site has its own assertion; validating one site does not cover the others.
- signal: `ac_gap` · recurrence: 1 feature(s) · scope: `embedding` · harmful: 0
- features: 019-rag-correctness-exact-context
- evidence: validation.md iteration-2, EMB-03 (spec.md:222-224) — still no query/hybrid dimension validation at fab0016..6303337 (embedding)
- last seen: 2026-08-13T18:20:25Z

### L-014 — Deleting the named duplicates of a single-source-of-truth abstraction does not satisfy it while unnamed duplicates of the same computation remain; enumerate every caller that recomputes the value.
- signal: `spec_precision_gap` · recurrence: 1 feature(s) · scope: `retrieval` · harmful: 0
- features: 019-rag-correctness-exact-context
- evidence: validation.md iteration-2 QP-04 — classifyQueryLambda (mmr.ts:72) and detectIntent (intent-detector.ts:42) still classify query text outside the plan (retrieval)
- last seen: 2026-08-13T18:20:34Z

### L-015 — Measure monorepo gates with a runner that continues past the first failing package; a short-circuiting runner under-reports the true finding count.
- signal: `gate_fail` · recurrence: 1 feature(s) · scope: `build` · harmful: 0
- features: 019-rag-correctness-exact-context
- evidence: validation.md iteration-2 Gate Check — plain pnpm reported 23/3 findings where turbo --continue reported 57/394 (build)
- last seen: 2026-08-13T18:20:34Z

## Quarantined (failed when applied — ignore)

A confirmed lesson that recurred alongside failure. Kept for the maintainer to review.

_none_
