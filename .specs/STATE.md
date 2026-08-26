# Project State

Project memory for `ia-framework`. Decisions are append-only; supersede rather than edit.

---

## Decisions

Architectural decisions that constrain future features. Every `active` entry is a project-level
constraint that later designs must either conform to or explicitly supersede.

### AD-001 — Shared cross-package contracts live in `@ia-framework/core`

- **Status**: active
- **Decided**: 2026-08-07 (feature 019, Design)
- **Decision**: Types and pure primitives shared by more than one package go in
  `@ia-framework/core`. Query planning lives in `@ia-framework/retrieval` (its plan *type* is
  exported from `core`). Response/context assembly lives in `@ia-framework/mcp-server`. No new
  package is created to host a shared abstraction.
- **Rationale**: Follows the existing dependency direction (`indexer`/`retrieval`/`mcp-server` →
  `core`). A dedicated shared package inverts into a cycle: an assembler needs `RetrievalResult`
  from `retrieval`, while `retrieval` needs the lexical primitives — so the primitives end up in
  `core` regardless, leaving the extra package holding only the assembler.
- **Consequence**: `core` is permitted to grow broader. Duplicating a shared primitive across
  packages is not an acceptable alternative to placing it in `core`.

### AD-002 — Collection-scoped metadata is persisted inside the Qdrant collection

- **Status**: active
- **Decided**: 2026-08-07 (feature 019, Design)
- **Decision**: Metadata that describes a Qdrant collection (embedding contract, index
  generation, tokenizer/hash versions) is stored as a **reserved point inside that collection**
  at a fixed deterministic id, not in a local file under `.ia-framework/`.
- **Rationale**: Qdrant's `createCollection` accepts no arbitrary-metadata field (verified
  against current docs). A local file can assert a contract for a collection that was dropped,
  recreated elsewhere, or is shared remotely — turning fail-closed into fail-wrong. A point
  inside the collection lives and dies with the data it describes.
- **Consequence**: Every query, scroll, and count path must exclude reserved points. This is
  enforced through one centralized base-filter helper rather than per-call-site discipline.

### AD-003 — One canonical lexical tokenizer

- **Status**: active
- **Decided**: 2026-08-07 (feature 019, Design)
- **Decision**: There is exactly one lexical tokenizer, in `@ia-framework/core`, used by sparse
  vector construction (both index and query side), BM25 reranking, and lexical similarity. It
  splits identifier case boundaries **before** lowercasing, preserves quoted phrases, and handles
  dot/path/package/annotation forms. Its version participates in the persisted collection
  contract.
- **Rationale**: Three divergent tokenizers previously disagreed about what a token is, so the
  sparse and lexical channels could not reinforce each other. A duplicated implementation pinned
  by a shared fixture is not equivalent — it is two implementations a test hopes agree.
- **Consequence**: A tokenizer change is a contract change and must bump its version, which
  causes stale collections to refuse rather than silently mis-match.

### AD-004 — MCP failures are successful tool results carrying a status, not protocol errors

- **Status**: active
- **Decided**: 2026-08-07 (feature 019, Design)
- **Decision**: A refused, degraded, or infrastructure-unavailable MCP outcome is returned as a
  normal successful tool result whose body states the failure, its cause, and its remediation,
  plus a machine-readable status from the closed set
  `ok | empty | low_confidence | unavailable | refused`. It is not raised as an MCP protocol
  error.
- **Rationale**: A protocol error commonly reaches the consuming agent as an opaque "tool failed"
  wrapper, which pushes the agent back to `grep`/`find` — the behavior the framework exists to
  eliminate. A readable body with a status field is actionable and branchable.
- **Consequence**: Failure responses must never return evidence unrelated to the query, and must
  not imply an answer is available when it is not.

### AD-005 — Retrieval scope filters are required parameters, not optional ones

- **Status**: active
- **Decided**: 2026-08-07 (feature 019, Design)
- **Decision**: Every direct retrieval, fallback, and expansion path accepts the effective filter
  (repository scope + user metadata filters + test exclusion) as a **required** parameter.
  Optional or defaulted filter arguments are not acceptable on any retrieval path.
- **Rationale**: Repository isolation previously held only at the MCP boundary; five of eight
  expansion paths forwarded nothing, and colliding relative paths across repos are expected.
  Making the parameter required moves enforcement from code review to the compiler.
- **Consequence**: Adding a new retrieval or expansion path requires threading the filter; it
  cannot compile otherwise.

### AD-006 — Distributable skills are governed by a closed allowlist

- **Status**: active
- **Decided**: 2026-08-21 (DEV-306771, Tasks)
- **Decision**: A directory in `skills/` is not distributed unless its `skill.json` `.name` field
  appears in `OFFICIAL_SKILLS`. Adding a skill is a deliberate two-place edit.
- **Rationale**: Before this, `scan_skills()` distributed anything with a `skill.json` present in
  `skills/`, so dropping a new directory into the repo silently shipped it. A closed allowlist
  makes "what ships" a single, reviewable array rather than an implicit consequence of directory
  layout.
- **Consequence**: Constrains every future skill: a `skill.json` alone is not sufficient for
  distribution — its name must also be added to `OFFICIAL_SKILLS` in `scripts/install-skills.sh`.

### AD-007 — Removing a shipped asset requires a permanent hardcoded manifest entry

- **Status**: active
- **Decided**: 2026-08-21 (DEV-306771, Tasks)
- **Decision**: Cleanup of a removed skill's assets must never glob the source tree for files
  whose source is being deleted — the manifest of what to remove is a permanent, hardcoded,
  history-derived entry. Unattended (`is_noninteractive`) runs must never delete a `copied`/real
  directory.
- **Rationale**: Once a skill's source directory is deleted, a glob-based cleanup path finds
  nothing and silently leaves stale links and live hook registrations behind. A hardcoded manifest
  survives the deletion of its own source. The non-interactive carve-out prevents unattended CI
  runs from destroying unversioned local work that happens to occupy a former skill's directory
  name.
- **Consequence**: Constrains every future rename or deprecation, alongside
  `LEGACY_SKILL_RENAMES`: the asset list to remove must be recorded as a literal before or at the
  moment the source is deleted, not derived from the tree at removal time.

---

## Handoff
- **Active feature**: `019-rag-correctness-exact-context`
- **Phase**: Execute — **the iteration-2 remediation batch is complete**. All 31 fix tasks (F1-F6b) from
  `fix-tasks.md` are committed, one atomic commit each. Awaiting **independent re-verification**
  (iteration 2 of a maximum 3).
- **Branch**: `019-rag-correctness-exact-context`
- **Uncommitted files**: none (working tree clean).
- **Next step**: **re-dispatch the independent Verifier** — no implementation work remains in scope.
  Provide it `spec.md`, `fix-tasks.md`, `validation.md`, and the diff range `b055c1e..ec3bd8c`
  (31 commits). Pass condition: mutants **M1, M2, M3, M6 all killed** and the 18 confirmed GAPs closed.
  `/delivery 019-rag-correctness-exact-context` is authorized **only** on a PASS verdict, and must be
  shown to the user rather than run. On a FAIL this becomes iteration 3 — the last before escalation.
- **Blockers**: none blocking re-verification. One **deliberate, documented** gate deviation remains:
  per **D-5**, `packages/benchmark/src/benchmark-runner.test.ts:273`
  (`'callCount' is assigned a value but never used`) is left unfixed because it is pre-existing at
  `fab0016` and lives in the one package `spec.md:950` forbids modifying. `pnpm lint` therefore ends red
  by **exactly this one error**. Adding an eslint ignore for `packages/benchmark` was explicitly rejected
  — it would hide a real finding by shrinking gate scope.
- **Gate state at `ec3bd8c`**: build ✅ 14/14 · test ✅ **1878 passed / 0 failed / 1 pre-existing skip**
  (up from 1804; the skip is the documented indexer streaming-timeout test from T17) · typecheck ✅
  **0 errors** (down from 57) · lint **1 error** (down from 394 — the D-5 deviation only).
  **Always measure with `npx turbo <task> --continue`**: plain `pnpm typecheck` / `pnpm lint`
  short-circuit at the first failing package, which is how iteration 1 recorded "23 typecheck / 3 lint"
  when the true totals were 57 / 394.
- **What the batch changed**: F1 moved budget enforcement onto the **measured serialized response**
  (measure-then-retrim, bounded to 2 passes per D-1) and made compaction actually reduce cost; F2 wired
  the embedding contract into the index and query paths and retired the legacy per-repo mismatch check
  (D-3/D-6); F3 fixed context shape (signatures without bodies, exact source never replaced by an
  enrichment summary, compact expansion evidence, enrichment surfaced in `structuredContent` only);
  F4 made diagnostics honest (executed vs planned branches, real `deduplicated_count`, all 13 fields on
  failure responses) and pinned sparse-branch filter/limit/repo isolation; F5 surfaced filesystem read
  failures as marked degradation, accounted failure-response cost, strengthened the 9 flagged shallow
  assertions, and deleted dead abstractions with their tests (D-7); F6a/F6b cleared the entire
  pre-existing typecheck and lint backlog (D-4 "Option B").
- **Author claims that must NOT be taken as verified**: the 4 surviving mutants are *reported* killed
  (M1/M2 by F1.3, M3 by F4.4, M6 by F3.2). Re-running the discrimination sensor is the Verifier's job —
  author ≠ verifier. Nothing in `validation.md` was moved to ✅ Verified; addressed requirements are
  marked 🔧 **Addressed — pending verification**.
- **No suppressions were used**: the 394 lint and 57 typecheck findings were cleared without a single
  `eslint-disable`, `@ts-ignore`, `@ts-expect-error`, or widening to `any`. Several **pre-existing**
  `eslint-disable` directives were *removed* by fixing their underlying cause. No test was weakened,
  skipped, or deleted to make a gate pass.
- **Still open, deliberately out of scope** (surface as follow-ups; do not re-litigate during
  verification): **EMB-03**; **FLT-02** — `scrollForHierarchy` / `scrollForImplementations` /
  `scrollByName` / `scrollByDefines` have no production implementation, so `expandHierarchy` and
  `multiHopExpand` early-return `[]` against every real engine; **A-04** —
  `QdrantVectorStore.capabilities()` reports `filterOnly: false` while the adapter implements it and the
  MCP boundary hardcodes `true`; `DependencyGraph.getNeighborFiles` accepts then discards its filter;
  indexer packing sizes semantic+signature concatenated but compares against the single-input limit.
- **Fragile invariant to preserve**: `ResolvedBudget.diagnosticsReserve` was removed from **both**
  `packages/core/src/planning/types.ts` and `packages/mcp-server/src/context/budget.ts`. The two
  interfaces are now structurally identical, which is what lets the cross-package assignment typecheck.
  Re-adding the field to only one side will re-break `search-codebase.ts:1744`.
- **Lessons**: L-001..L-011 remain recorded via `scripts/lessons.py` from iteration 1 (assert the
  serialized response not intermediates; assert metric *values* not key presence; no
  conditional/tautological assertions). The iteration-2 batch was written against them; distilling any
  new lessons is the Verifier's step.
- **What is verifiably solid** (do not re-litigate): all six zero-vector fakes eliminated from source;
  both named route classifiers deleted in favour of one deterministic plan; WS4 input safety 11/11; the
  canonical tokenizer, sparse builder, filter-only pagination/ceiling/ordering, and the 50-field payload
  round-trip property test are discriminating (M4, M5, M7 were killed in iteration 1); `initialize()` is
  non-destructive and fail-closed; budget precedence and the 8000/20000/40000 tiers are correctly
  asserted.
- **Testing conventions confirmed**: Vitest zero-config per package via Turbo (no `vitest.config.*`
  anywhere), `kebab-case.test.ts` co-located or under `__tests__/`, no numeric coverage threshold and
  `@vitest/coverage-v8` not installed, no CI — `pnpm test` + `pnpm build` is the merge gate by
  convention (constitution `:173`).
