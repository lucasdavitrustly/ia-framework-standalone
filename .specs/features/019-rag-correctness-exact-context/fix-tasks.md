# RAG Correctness, Deterministic Query Planning, and Exact Token-Efficient Context Delivery — Fix Tasks (iteration 2)

## Execution Protocol (MANDATORY -- do not skip)

Implement these tasks with the `tlc-spec-driven` skill: **activate it by name and follow its Execute flow and Critical Rules.** Do not search for skill files by filesystem path. The skill is the source of truth for the full flow (per-task cycle, sub-agent delegation, adequacy review, Verifier, discrimination sensor).

**If the skill cannot be activated, STOP and tell the user — do not proceed without it.**

---

**Spec**: `.specs/features/019-rag-correctness-exact-context/spec.md`
**Design**: `.specs/features/019-rag-correctness-exact-context/design.md`
**Context**: `.specs/features/019-rag-correctness-exact-context/context.md` (lowercase — `tasks.md:13` mis-cites this as `CONTEXT.md`)
**Verification report**: `.specs/features/019-rag-correctness-exact-context/validation.md`
**Status**: remediation batch for the iteration-1 **FAIL** — 18 confirmed spec gaps, 29 spec-precision gaps, 4 surviving mutants
**Iteration**: **2 of a maximum 3** fix→re-verify cycles
**Scope tier**: Complex — 31 tasks, 6 phases (F6 split into F6a/F6b), 11 packages

---

## Root Cause (why iteration 1 passed 48 task gates and still failed)

`mcp-server` requirements were verified against **intermediate objects** instead of the **final serialized
tool response**. Behavior that never reached the model still passed its gate. The Test Coverage Matrix
(`tasks.md:41`) always required serialized-response assertions; the rule was simply not enforced.

Every task in this batch is therefore bound by the **Serialized-Response Rule** below.

---

## Non-Negotiable Rules For Every Task In This Batch

1. **TDD** (constitution Principle I, `.specify/memory/constitution.md:20-34`): failing test first, then the
   minimum implementation, then refactor.
2. **Serialized-Response Rule**: every `packages/mcp-server` assertion about what the caller receives MUST
   read `content[].text` or `structuredContent`. Asserting an intermediate object (`BudgetEnforcement`,
   `ContextItem`, `RetrievalResult`, a mock call argument) does **not** satisfy such a requirement. This
   single rule is why iteration 1 failed — enforce it without exception.
3. **No shallow assertions.** Litmus: *would it still pass under a plausible wrong implementation?*
   Specifically banned: tautologies; `expect(true).toBe(true)`; conditional assertions
   (`if (x) expect(...)`); `toBeGreaterThan(0)` where an exact value is specified; absence assertions whose
   fixture could never produce the string; mock-call-count-only where output/state is what the spec demands.
4. **Never weaken, skip, or disable a test** to make the suite pass. If a test is genuinely wrong per spec,
   STOP and ask the user. (Deleting a test whose production referent is being deleted is governed by
   Decision D-7 below and is *not* an exception to this rule.)
5. **One atomic Conventional Commit per task.** Never batch tasks. Touch only the files the task names — no
   "while I'm here".
6. **Never edit `packages/benchmark`** (spec success criterion `spec.md:950`). Its tests run as Full-gate
   fan-out; if one fails, the fix belongs in the changed package.
7. **Never rename or alter any existing Flyway migration** (checksum validation).
8. **Leave your own new code gate-clean.** Any file a task in F1–F5 touches must introduce **zero** new
   typecheck or lint findings. F6 cleans the pre-existing backlog; it must not have to clean up after F1–F5.

---

## Approved Decisions — Do Not Re-Open

| # | Decision |
| - | -------- |
| **D-1** | **Budget enforcement = measure-then-retrim, bounded to 2 passes.** Assemble → serialize → measure the real string → if over budget, drop/compact from the bottom of the BUD-07 priority ladder → re-serialize **once**. Deterministic because the drop order is the ladder. Resolves BUD-05 ("enforcement occurs after the final response has been assembled") vs `context.md` decision 6 ("single-pass") **in favour of BUD-05**, because BUD-12 requires reported tokens to describe the *actual serialized response*. |
| **D-2** | **Contract refusal = per-request assert, cached per collection**, returned as a normal successful tool result with `status: 'refused'` — never an MCP protocol error (`context.md` decision 2, AD-004). Plus a startup **warning** for operator visibility. Do **not** fail-fast at server startup: `bin.ts` turns a throw into `process.exit(1)`, giving the agent an opaque dead server instead of an actionable refusal. |
| **D-3** | **Retire the legacy mismatch check.** `ContractStore` becomes the single source of truth for embedding-contract state. |
| **D-4** | **Gate cleanup is Option B — genuinely green.** All pre-existing typecheck and lint findings are fixed, not just 019's regressions. Measured workload: **57 typecheck errors / 11 files** and **394 lint errors / 11 packages**. |
| **D-5** | **B1 — one documented deviation.** `packages/benchmark/src/benchmark-runner.test.ts:273` (`'callCount' is assigned a value but never used`) is **pre-existing** (identical at `fab0016`) and lives in the one package the spec forbids modifying. It is **left unfixed**. `pnpm lint` therefore ends red by **exactly this one error**; every package we are permitted to touch ends green. Rejected alternatives: editing benchmark (breaks `spec.md:950`); adding an eslint ignore for benchmark (hides a real finding by shrinking gate scope — same category of cheat as weakening an assertion). |
| **D-6** | **The embedding contract is a per-collection invariant.** Confirmed by the user. Every repo sharing a Qdrant collection must share one contract (provider, model, dimension, prefix pair, tokenizerVersion, sparseHashVersion). This deliberately **narrows** the retired per-repo legacy check (D-3), which wrote per-repo state after every run while the contract writes only on collection creation. Correct per EMB-08 + AD-002 ("collection-scoped metadata is persisted inside the Qdrant collection"). Recorded here so the Verifier reads it as intended, not as drift. |
| **D-7** | **Dead-abstraction deletions are authorized, tests included.** Per `implement.md` Check C, a test whose production referent no longer exists maps to no requirement and is scope creep. Production symbol and its tests are therefore deleted **together**, in one commit, with every removed test named in the commit body. This is consistent with Rule 4 (never delete a test *to make a failing suite pass*), not an exception to it. `LiveSourceReader` is **wired** by F5.1, never deleted. |

---

## Deliberately Out Of Scope (surface as follow-ups; do not fix here)

Pre-existing architectural gaps, not regressions from 019. Document them; do not expand the batch. If you
believe one blocks a fix, **ask the user before promoting it**.

- `scrollForHierarchy` / `scrollForImplementations` / `scrollByName` / `scrollByDefines` exist only as
  optional interface members plus test doubles — no production implementation, so `expandHierarchy` and
  `multiHopExpand` early-return `[]` against every real engine (FLT-02).
- `DependencyGraph.getNeighborFiles` accepts then discards its filter (`void filter;`); its test asserts the
  filter has *no* effect (FLT-06).
- `QdrantVectorStore.capabilities()` reports `filterOnly: false` while the adapter implements it and the MCP
  boundary hardcodes `true` (A-04).
- Indexer packing sizes inputs as semantic+signature concatenated but compares against the single-input
  limit, over-rejecting legitimately-sized chunks (accounted for, not silent).

---

## Test Coverage Matrix (inherited from `tasks.md:34-46`)

Unchanged. The row that governs this batch:

| Code Layer | Required Test Type | Coverage Expectation | Location Pattern | Run Command |
| ---------- | ------------------ | -------------------- | ---------------- | ----------- |
| `mcp-server` tool handlers / assembler / budget / diagnostics (presentation + contract boundary) | integration (**asserted on the final serialized tool response**) | All routes in scope: happy path + every listed edge case + error/failure paths; assertions read the serialized `content[].text` and `structuredContent`, **never intermediate candidates** | `packages/mcp-server/src/**/*.test.ts` | `pnpm --filter @ia-framework/mcp-server test` |
| `vector-store` adapter + contract store + filter-only | integration (mocked Qdrant client) | Key query paths + error paths + repo isolation; every AC of EMB-08..11 | `packages/vector-store/src/*.test.ts` | `pnpm --filter @ia-framework/vector-store test` |
| `retrieval` planner / search engine / expansion | unit | All branches; filter threading, branch provenance | `packages/retrieval/src/**/*.test.ts` | `pnpm --filter @ia-framework/retrieval test` |
| `indexer` pipeline | unit | All branches; contract persistence at index time | `packages/indexer/src/**/*.test.ts` | `pnpm --filter @ia-framework/indexer test` |
| `cli` commands | unit | Key paths + error paths | `packages/cli/src/commands/*.test.ts` | `pnpm --filter @ia-framework/cli test` |

## Gate Check Commands

| Gate Level | When to Use | Command |
| ---------- | ----------- | ------- |
| Quick | Task whose tests are unit tests inside a single package | `pnpm --filter @ia-framework/<pkg> test` |
| Full | Task with integration tests, or that changes a cross-package contract | `pnpm --filter ...@ia-framework/<pkg> test` (package **and all dependents** — leading dots) |
| Build | Final task of F6b only | `pnpm build && pnpm typecheck && pnpm lint && pnpm test` |

**Amended phase-end gate (forced by ordering — documented deviation).** The true Build gate cannot pass
until F6 completes, because 451 pre-existing findings predate this batch. Therefore:

- **Phase-end tasks in F1–F5** run: Full gate for the changed package **+** `pnpm build` **+**
  `npx turbo typecheck --continue` and `npx turbo lint --continue` scoped to the changed packages, asserting
  **zero new findings versus the recorded baseline** (Rule 8).
- **Only F6b's final task** runs the unqualified Build gate, which must then be green except for D-5's single
  benchmark error.

**Important:** plain `pnpm typecheck` / `pnpm lint` **short-circuit at the first failing package** — this is
how iteration 1 recorded "23 typecheck / 3 lint" when the true totals are 57 / 394. Always use
`npx turbo <task> --continue` when measuring.

**Recorded gate baseline at `16cb011`** (measured against a clean `fab0016` worktree):

| Gate | Baseline `fab0016` | At `16cb011` | Note |
| ---- | ------------------ | ------------ | ---- |
| build | ✅ | ✅ | — |
| test | — | ✅ 1804 passed / 0 failed / 1 skipped | floor for this batch |
| typecheck | 61 errors | **57 errors / 11 files** | 16 in `indexer` are a **019 regression** (T22 made `searchSparse` + `capabilities()` required on `VectorStore`; `makeMockVectorStore()` uses `satisfies VectorStore`) |
| lint | 355 errors | **394 errors / 11 packages** | **+37 net from 019**: retrieval +28, vector-store +6, embedding +5, cli +1, mcp-server −3 |

---

## Execution Plan

Phases run **strictly sequentially**; tasks within a phase run in order.
**F1 must land before F3 and F4** — both depend on the corrected budget/serialization path.
**F6 must run last** — F1–F5 add code that would otherwise re-redden a pre-cleaned gate.

```
F1 (5) → F2 (4) → F3 (4) → F4 (4) → F5 (4) → F6a (5) → F6b (5)
```

| Phase | Tasks | Theme | Priority |
| ----- | ----- | ----- | -------- |
| F1 | 5 | Budget truth | **BLOCKER** |
| F2 | 4 | Contract wiring | **BLOCKER** |
| F3 | 4 | Context shape | MAJOR |
| F4 | 4 | Honest diagnostics and isolation | MAJOR |
| F5 | 4 | Failure paths, shallow assertions, cleanup | MAJOR/MINOR |
| F6a | 5 | Gate cleanup — heavy packages | required by D-4 |
| F6b | 5 | Gate cleanup — light packages + final Build gate | required by D-4 |

**Total: 31 tasks.**

**Mutant kill obligations** (iteration-2 pass condition): **M1** and **M2** by F1.3; **M3** by F4.4;
**M6** by F3.2.

---

## Task Breakdown

### Phase F1 — Budget truth (BLOCKER)

Root cause: `search-codebase.ts:1284-1285` computes the serialized estimate and immediately discards it
(`const serializedEstimate = …; void serializedEstimate;`), so the budget is enforced on an item-level sum
that excludes headers, code fences, the guardrail lead, templates and diagnostics. Three of five routes never
reach enforcement at all. Measured previously: budget 3000 → ~6510 serialized tokens.

---

### F1.1: Make compaction actually reduce cost

**What**: The compaction branch sets `form: 'anchor-only'` and `degraded: 'compacted'` but leaves
`item.text` intact, while `estimateItem` costs `item.text` — so `compactEstimate === estimate` and the branch
is structurally unreachable (`compaction_count` is provably always 0 for every budget 1..20000). Render the
compacted form (anchor + signature) into `text` before estimating.
**Where**: `packages/mcp-server/src/context/budget.ts`, `packages/mcp-server/src/context/budget.test.ts`
**Depends on**: None
**Requirement**: BUD-10

**Done when**:

- [X] Failing test written first, then implementation (constitution Principle I)
- [X] The compacted item's `text` is the rendered anchor + signature, not the original body
- [X] `estimateItem(compacted) < estimateItem(original)` asserted for a body that exceeds its anchor
- [X] A test asserts an **exact non-zero** `compaction_count` (not `toBeGreaterThan(0)`) for a pinned fixture
- [X] The pre-existing conditional assertion at `budget.test.ts:216-218` (`if (compacted) expect(...)`) is
      replaced by an unconditional assertion on the expected case (L-009)
- [X] Gate: `pnpm --filter @ia-framework/mcp-server test`

**Tests**: unit
**Gate**: quick
**Commit**: `fix(mcp-server): render compacted form so compaction reduces token cost`

---

### F1.2: Add serialized-response budget enforcement

**What**: New `BudgetGovernor` method that measures `JSON.stringify` of the assembled response, re-trims from
the bottom of the BUD-07 ladder when over budget (**max 2 passes**, per D-1), and returns the **measured**
estimate.
**Where**: `packages/mcp-server/src/context/budget.ts`, `packages/mcp-server/src/context/budget.test.ts`
**Depends on**: F1.1
**Requirement**: BUD-03, BUD-05, BUD-12, BUD-13

**Done when**:

- [X] Failing test written first, then implementation
- [X] The method measures the **serialized string**, not a sum of item estimates
- [X] Over-budget input re-trims from the ladder bottom and re-serializes **exactly once** (assert pass count ≤ 2)
- [X] The returned estimate equals a conservative measurement of the final serialized string
- [X] Determinism: identical input twice yields a deeply-equal result
- [X] BUD-13's documented non-under-reporting margin is asserted with a pinned value
- [X] Gate: `pnpm --filter @ia-framework/mcp-server test`

**Tests**: unit
**Gate**: quick
**Commit**: `feat(mcp-server): enforce the token budget on the measured serialized response`

---

### F1.3: Wire serialized enforcement into the semantic route

**What**: Replace `void serializedEstimate` with real enforcement; report the **measured** value as
`estimated_tokens`; carry the overflow **amount** (not just the boolean) into `structuredContent` — today only
`exact_node_overflow: boolean` reaches the caller while `OverflowReport` already carries
`configured/estimated/amount`.
**Where**: `packages/mcp-server/src/tools/search-codebase.ts`,
`packages/mcp-server/src/context/diagnostics.ts` (`DiagnosticsInput`, `Diagnostics`, `buildDiagnostics`),
`packages/mcp-server/src/tools/search-codebase.test.ts`,
`packages/mcp-server/src/context/diagnostics.test.ts`
**Depends on**: F1.2
**Requirement**: BUD-08, BUD-12 — **must kill mutants M1 and M2**

**Done when**:

- [X] Failing test written first, then implementation
- [X] **M1 killed**: a serialized-response test fails if trimming is bypassed (serialize untrimmed
      `contextItems` instead of `budgetResult.included`) — assert reduced `content[].text` **and** non-zero
      `omitted_count` (L-001)
- [X] **M2 killed**: a test asserts `estimated_tokens` equals the measured serialized value, so reporting
      `estimated: 0` fails (L-002)
- [X] The overflow **amount**, configured budget and estimate all reach `structuredContent`
- [X] A prose overflow line still appears when A-09 fires (`context.md` decision 4)
- [X] Gate: `pnpm --filter @ia-framework/mcp-server test`

**Tests**: integration (serialized response)
**Gate**: quick
**Commit**: `fix(mcp-server): enforce and report the budget on the serialized semantic response`

---

### F1.4: Enforce the budget on every route

**What**: The keyword, existence, aggregation and zero-result-fallback branches all
`return withDiagnostics(...)` *before* the governor runs (`search-codebase.ts:850`, `:895`, `:910`, `:999`,
`:1327`). Route them through the same budget contract.
**Where**: `packages/mcp-server/src/tools/search-codebase.ts`,
`packages/mcp-server/src/tools/search-codebase.test.ts`,
`packages/mcp-server/src/context/diagnostics.test.ts`
**Depends on**: F1.3
**Requirement**: BUD-01, BUD-16

**Done when**:

- [X] Failing test written first, then implementation
- [X] Each of the five routes (keyword, existence, aggregation, semantic, zero-result fallback) has its own
      serialized-response test asserting the budget governed it (L-005 — enumerate the routes, don't rely on
      one happy path)
- [X] Existence and aggregation remain **source-free** (no code fences) *and* are budget-accounted — asserted
      against a **non-empty** result set, not `engine([])` (L-010, fixes the BUD-16 vacuity at
      `diagnostics.test.ts:126,132`)
- [X] `estimated_tokens` is the measured serialized value on every route
- [X] Gate: `pnpm --filter @ia-framework/mcp-server test`

**Tests**: integration (serialized response)
**Gate**: quick
**Commit**: `fix(mcp-server): apply one budget contract to every search route`

---

### F1.5: Cost live source honestly + phase keystone test

**What**: Empty stored payload must not be treated as costless. Plus the spec's own Independent Test
(`spec.md:580-584`), implemented explicitly.
**Where**: `packages/mcp-server/src/context/budget.ts`,
`packages/mcp-server/src/tools/search-codebase.ts`,
`packages/mcp-server/src/tools/search-codebase.test.ts`
**Depends on**: F1.4
**Requirement**: BUD-06, BUD-11

**Done when**:

- [X] Failing test written first, then implementation
- [X] An item with empty stored payload but populated live source is costed by its **live** content
- [X] The presence-only assertion at `search-codebase.test.ts:397` is strengthened to assert cost
- [X] **Keystone test**: with a small budget and a live source that vastly exceeds it, assert on the
      **serialized response** that (a) it respects the budget, (b) `estimated_tokens` matches a conservative
      measurement of the actual serialized string, and (c) `omitted_count` **and** `compaction_count` are
      non-zero (exact values, not `> 0`)
- [X] A monotonicity test: shrinking the budget provably shrinks the serialized response
- [X] Gate: Full — `pnpm --filter ...@ia-framework/mcp-server test`, plus `pnpm build` and scoped
      `turbo typecheck/lint --continue` showing **zero new findings** (Rule 8)

**Tests**: integration (serialized response)
**Gate**: full
**Commit**: `fix(mcp-server): cost live source and pin the end-to-end budget contract`

---

### Phase F2 — Contract wiring (BLOCKER)

`assertSearchable` has exactly one caller, inside `QdrantVectorStore.initialize()`, guarded by
`if (!config.embeddingContract) return;`. No production caller supplies `embeddingContract`, and `mcp-server`
never calls `initialize()` at all — it constructs the store and hands it straight to `SearchEngine`. So the
contract is never persisted and never checked. WS1's headline guarantee is enforced only inside unit tests of
an unwired component.

**`resolveContract` does not need to be called again** — every provider already exposes `.contract`
(including `CachingEmbeddingProvider`, which passes it through).

**Blast radius to expect**: ~18 `initialize()` call sites in `packages/vector-store/src/qdrant.test.ts`
(6 already pass a contract fixture) plus one assertion in `packages/indexer/src/pipeline.test.ts:266`
("run() calls vectorStore.initialize() before upserting"). Keeping the new fields **optional** contains this.

---

### F2.1: Widen the `VectorStore.initialize` interface

**What**: `VectorStore.initialize` (`packages/vector-store/src/interface.ts:241`) declares only
`{ textDimensions, codeDimensions, force? }`, while the concrete class already accepts `embeddingContract?`
and `indexGeneration?`. The pipeline types its store as `VectorStore`, so this narrow interface is what
silently blocks the contract. Add both as **optional** fields.
**Where**: `packages/vector-store/src/interface.ts`, `packages/vector-store/src/qdrant.test.ts`
**Depends on**: None
**Requirement**: EMB-08

**Done when**:

- [X] Failing test written first, then implementation
- [X] `embeddingContract?: EmbeddingContract` and `indexGeneration?: string` are declared on the interface
- [X] Both are **optional**, so existing call sites still typecheck
- [X] A type-level test (or compiling call site) proves a `VectorStore`-typed variable accepts both
- [X] Gate: Full — `pnpm --filter ...@ia-framework/vector-store test`

**Tests**: unit
**Gate**: full
**Commit**: `refactor(vector-store): declare embedding contract fields on the VectorStore interface`

---

### F2.2: Persist the contract at index time

**What**: Pass `embeddingProvider.contract` and an `indexGeneration` from the pipeline's `initialize()` call
(`packages/indexer/src/pipeline.ts:698`). **`indexGeneration` has no existing producer** — use
`contractFingerprint()` (`packages/core/src/embedding/contract.ts:112`) combined with the run's ISO
timestamp, which also makes BUD-14's cache invalidation meaningful.
**Where**: `packages/indexer/src/pipeline.ts`, `packages/indexer/src/pipeline.test.ts`
**Depends on**: F2.1
**Requirement**: EMB-08, BUD-14

**Done when**:

- [X] Failing test written first, then implementation
- [X] `vectorStore.initialize()` is called with `embeddingContract` equal to `embeddingProvider.contract`
- [X] `indexGeneration` is derived from `contractFingerprint(contract)` + the run's ISO timestamp, asserted
      by **structure**, not by `expect.any(String)`
- [X] Two runs with the same contract produce different `indexGeneration` values (timestamp participates), so
      a re-index invalidates the cache (BUD-14)
- [X] The existing ordering assertion at `pipeline.test.ts:266` still holds
- [X] Gate: Full — `pnpm --filter ...@ia-framework/indexer test`

**Tests**: unit
**Gate**: full
**Commit**: `feat(indexer): persist the embedding contract and index generation at index time`

---

### F2.3: Refuse at query time

**What**: Assert the contract on the **first search per collection**, cache the verdict, and return
`status: 'refused'` with the `ia index --force` remediation as a **normal successful result** (D-2). Add the
startup **warning** (not a throw — `bin.ts` would turn it into `process.exit(1)`). The existing fallback test
currently only proves the handler *formats* a hand-thrown error; make it cover real wiring.
**Where**: `packages/mcp-server/src/tools/search-codebase.ts`, `packages/mcp-server/src/bin.ts`,
`packages/mcp-server/src/tools/search-codebase.test.ts`
**Depends on**: F2.2
**Requirement**: EMB-09, A-27, AD-004

**Done when**:

- [X] Failing test written first, then implementation
- [X] A mismatched persisted contract yields `status: 'refused'` **from real wiring**, asserted on
      `structuredContent` — not from a hand-thrown error (L-006)
- [X] An **unknown-contract** collection also refuses, naming the collection and `ia index --force`
- [X] The verdict is asserted **cached per collection**: a second search does not re-assert (assert the
      assert-call count *and* the identical response)
- [X] The refusal is a successful tool result, **never** an MCP protocol error (AD-004)
- [X] The refusal returns **no evidence** unrelated to the query (FAIL-02)
- [X] Startup emits a **warning** and the server stays up
- [X] Gate: `pnpm --filter @ia-framework/mcp-server test`

**Tests**: integration (serialized response)
**Gate**: quick
**Commit**: `feat(mcp-server): refuse searches whose persisted embedding contract mismatches`

---

### F2.4: Retire the legacy mismatch check

**What**: Remove the `getLastEmbeddingModel` mismatch block in
`packages/cli/src/commands/index.command.ts:273-314` (model + text dimension in `.ia-framework` JSON, with an
interactive delete prompt). `ContractStore` is a strict superset (adds provider, prefixes, tokenizerVersion,
sparseHashVersion) and the two can diverge — legacy writes per-repo after every run, the contract writes only
on collection creation (D-3, D-6).
**Where**: `packages/cli/src/commands/index.command.ts`,
`packages/cli/src/commands/index.command.test.ts`
**Depends on**: F2.3
**Requirement**: EMB-09

**Done when**:

- [X] Failing test written first, then implementation
- [X] The legacy mismatch block and its now-unused `getLastEmbeddingModel` import are gone
- [X] No interactive delete prompt remains on the index path
- [X] Tests asserting the legacy prompt are removed per D-7 and named in the commit body
- [X] The clean-run test at `index.command.test.ts:195` asserts `exitCode === 0`, not `toBeUndefined()`
      (fixes a listed shallow assertion)
- [X] Gate: Full — `pnpm --filter ...@ia-framework/cli test`, plus `pnpm build` and scoped
      `turbo typecheck/lint --continue` showing zero new findings
- [X] `packages/vector-store`, `packages/indexer`, `packages/mcp-server` and `packages/cli` suites all green

**Tests**: unit
**Gate**: full
**Commit**: `refactor(cli)!: retire the legacy embedding-model mismatch check`

---

### Phase F3 — Context shape (MAJOR)

All four live in `packages/mcp-server/src/context/assembler.ts` plus the response formatter.

---

### F3.1: Class overview must omit bodies

**What**: The field heuristic at `assembler.ts:186` admits any line ending in `;` without `(`, so
`return id;` and `this.amount = a;` are emitted after the signature. Emit **signatures only**.
**Where**: `packages/mcp-server/src/context/assembler.ts`,
`packages/mcp-server/src/context/assembler.test.ts`,
`packages/mcp-server/src/tools/search-codebase.test.ts`
**Depends on**: F1.5
**Requirement**: `context.md` decision 3 — "declaration + field block + signatures with **no bodies**"

> **Authority note**: cite `context.md` decision 3, **not** CTX-06 — `spec.md:496` is a permissive `MAY`
> and cannot ground this assertion.

**Done when**:

- [X] Failing test written first, then implementation
- [X] A fixture whose methods contain `return id;` and `this.amount = a;` yields a class overview with the
      declaration, the field block, and method **signatures**
- [X] Body statements are asserted **absent from the serialized response** using strings the fixture
      genuinely contains (not a tautology — L-008)
- [X] Members the query specifically implicates still render their bodies (`context.md` decision 3)
- [X] Gate: `pnpm --filter @ia-framework/mcp-server test`

**Tests**: integration (serialized response)
**Gate**: quick
**Commit**: `fix(mcp-server): emit signatures without bodies in class overviews`

---

### F3.2: Never substitute enrichment for exact source

**What**: The `exact_symbol` return at `assembler.ts:136` is
`result.content || result.signature || result.enrichment?.description || ''`, which serves a
model-generated summary where the spec requires exact code. Also strip imports on **all** non-dependency
intents — `stripImportLines` is applied only when `score >= 0.75` (`assembler.ts:138`), so the low-score
branch leaks the import block onto the ordinary search path.
**Where**: `packages/mcp-server/src/context/assembler.ts`,
`packages/mcp-server/src/context/assembler.test.ts`,
`packages/mcp-server/src/tools/search-codebase.test.ts`
**Depends on**: F3.1
**Requirement**: ENR-07, A-11, `context.md` decision 3 — **must kill mutant M6**

**Done when**:

- [X] Failing test written first, then implementation
- [X] **M6 killed**: with `content` present **and** `enrichment.description` present, the serialized response
      contains the exact source and **not** the description — the lower-priority branch is proven not taken
      (L-004)
- [X] When exact source is genuinely unavailable, the response degrades to signature/anchor and is **marked**,
      never silently summarized
- [X] Imports are stripped on every non-`dependency_trace` intent, asserted at **both** a high and a low
      score (closes the `score >= 0.75` leak)
- [X] Imports are still **included** for `dependency_trace` (`context.md` decision 3)
- [X] Gate: `pnpm --filter @ia-framework/mcp-server test`

**Tests**: integration (serialized response)
**Gate**: quick
**Commit**: `fix(mcp-server): never substitute enrichment for required exact source`

---

### F3.3: Compact expansion evidence

**What**: Form is chosen by score alone (`assembler.ts:138`), ignoring `expansionSource`, so an `adjacent`
result renders its full body. Default dependency / hierarchy / call-chain / adjacent evidence to
anchor + signature + a one-line description.
**Where**: `packages/mcp-server/src/context/assembler.ts`,
`packages/mcp-server/src/context/assembler.test.ts`,
`packages/mcp-server/src/tools/search-codebase.test.ts`
**Depends on**: F3.2
**Requirement**: CTX-08, ENR-04

**Done when**:

- [X] Failing test written first, then implementation
- [X] Each of the four expansion sources (`dependency`, `hierarchy`, `call-chain`, `adjacent`) has a test
      asserting compact form on the **serialized response**, even at a high score
- [X] A direct high-confidence non-expansion result still carries live source (ENR-05)
- [X] Missing enrichment omits the description line entirely — no empty field, no placeholder (ENR-08)
- [X] Gate: `pnpm --filter @ia-framework/mcp-server test`

**Tests**: integration (serialized response)
**Gate**: quick
**Commit**: `fix(mcp-server): default expansion evidence to compact form`

---

### F3.4: Surface enrichment and the degraded marker

**What**: Enrichment (tags, business context, relationships, provenance) never reaches `content[].text` or
`structuredContent`; `signatureOnly` reaches `ContextItem` but is never rendered, so A-29's "marked at
retrieval" is invisible. Emit enrichment in **`structuredContent` only** (`context.md` decision 5) and render
the signature-only marker.
**Where**: `packages/mcp-server/src/context/assembler.ts`,
`packages/mcp-server/src/tools/search-codebase.ts`,
`packages/mcp-server/src/tools/search-codebase.test.ts`
**Depends on**: F3.3
**Requirement**: ENR-01, A-29

**Done when**:

- [X] Failing test written first, then implementation
- [X] `description`, `businessContext`, `semanticTags`, `relationships` and enrichment provenance appear in
      `structuredContent` for an enriched chunk
- [X] Enrichment stays **out of** the prose body for a direct result that carries live source
      (`context.md` decision 5 — paying twice for the same information)
- [X] An unenriched chunk **in the same response** degrades to AST metadata with no error (ENR-08)
- [X] `signatureOnly` renders a visible marker on the serialized response (A-29)
- [X] No LLM call occurs during MCP query handling (ENR-02)
- [X] Gate: Full — `pnpm --filter ...@ia-framework/mcp-server test`, plus `pnpm build` and scoped
      `turbo typecheck/lint --continue` showing zero new findings

**Tests**: integration (serialized response)
**Gate**: full
**Commit**: `feat(mcp-server): surface enrichment and the signature-only marker to callers`

---

### Phase F4 — Honest diagnostics and isolation (MAJOR)

---

### F4.1: Report executed branches, not planned ones

**What**: `executed_branches` is assigned `plan.branches` (`search-codebase.ts:306`), so a branch that never
ran can be reported as executed — destroying the spec's required "skipped" vs "executed with zero results"
distinction. Thread actual branch provenance from the engine's vector-result loop
(`search-engine.ts:298-325`).
**Where**: `packages/retrieval/src/search-engine.ts`, `packages/retrieval/src/types.ts`,
`packages/mcp-server/src/tools/search-codebase.ts`,
`packages/mcp-server/src/context/diagnostics.ts`,
`packages/retrieval/src/search-engine.test.ts`,
`packages/mcp-server/src/context/diagnostics.test.ts`
**Depends on**: F1.5
**Requirement**: QP branch provenance, SPR-06, spec Edge Cases → Sparse retrieval

**Done when**:

- [X] Failing test written first, then implementation
- [X] An **empty sparse vector** yields a plan that selects sparse but `executed_branches` that **excludes**
      it — reported as skipped, not executed-with-zero (L-011)
- [X] A branch that executed and returned zero results **is** reported as executed — the two cases are
      distinguishable on the serialized response
- [X] An adapter without sparse capability never reports a sparse branch (SPR-06)
- [X] Gate: Full — `pnpm --filter ...@ia-framework/retrieval test`

**Tests**: unit + integration (serialized response)
**Gate**: full
**Commit**: `fix(retrieval): report branches that actually executed`

---

### F4.2: Real `deduplicated_count`

**What**: Hardcoded `0` at `search-codebase.ts:310`; verified: 3 duplicates collapsed to 1 while the field
reported 0.
**Where**: `packages/mcp-server/src/tools/search-codebase.ts`,
`packages/mcp-server/src/context/diagnostics.test.ts`
**Depends on**: F4.1
**Requirement**: BUD-15

**Done when**:

- [X] Failing test written first, then implementation
- [X] A fixture with 3 duplicates collapsing to 1 reports `deduplicated_count: 2` — an **exact** value on
      `structuredContent` (L-002)
- [X] Zero duplicates reports `0`
- [X] Coverage spans the dedup classes CTX-13 lists that this counter observes (identical chunk ids,
      cross-collection same-region, overlapping ranges)
- [X] Gate: `pnpm --filter @ia-framework/mcp-server test`

**Tests**: integration (serialized response)
**Gate**: quick
**Commit**: `fix(mcp-server): report the real deduplicated count`

---

### F4.3: Full diagnostics on failure responses

**What**: `refused` responses carry only `{status, plan_error, answered}` (`search-codebase.ts:221-232`) and
`unavailable` only `{status, answered, results}` (`:234-245`) — **zero of the 13 fields**, contradicting
`context.md` decision 4 ("the full set appears on every response, on every route").
**Where**: `packages/mcp-server/src/tools/search-codebase.ts`,
`packages/mcp-server/src/context/diagnostics.test.ts`
**Depends on**: F4.2
**Requirement**: BUD-15, `context.md` decision 4

**Done when**:

- [X] Failing test written first, then implementation
- [X] All 13 `DIAGNOSTIC_KEYS` appear on a `refused` response and on an `unavailable` response
- [X] A plan failure (`planDiagnostic`) also carries the full set
- [X] The failure body still states cause + remediation and endorses no shell fallback (CTX-09, FAIL-02)
- [X] Gate: `pnpm --filter @ia-framework/mcp-server test`

**Tests**: integration (serialized response)
**Gate**: quick
**Commit**: `fix(mcp-server): emit the full diagnostics set on failure responses`

---

### F4.4: Assert the sparse branch's filter and limit

**What**: The only sparse-call assertion (`search-engine.test.ts:1110-1113`) uses
`expect.objectContaining({ limit: expect.any(Number) })` and never inspects `filter`, so dropping the repo
filter (cross-repo leakage) is invisible. Assert the **exact** filter structure and limit value; add a
two-repo isolation test.
**Where**: `packages/retrieval/src/search-engine.test.ts`,
`packages/retrieval/src/search-engine.ts` (only if a real defect is found)
**Depends on**: F4.3
**Requirement**: SPR-03, FLT-06 — **must kill mutant M3**

**Done when**:

- [X] Failing test written first, then implementation
- [X] **M3 killed**: dropping the repo/metadata filter **or** forcing `limit: 1` on the sparse branch fails
      the suite — the exact filter structure and the exact computed limit are asserted (L-003)
- [X] A two-repo fixture with the **same relative path** in both proves no cross-repo leakage on the sparse
      branch
- [X] The `string`-vs-`SparseVector` comparisons at `query-planner.test.ts:115-116` — which always pass — are
      corrected to compare like types
- [X] Gate: Full — `pnpm --filter ...@ia-framework/retrieval test`, plus `pnpm build` and scoped
      `turbo typecheck/lint --continue` showing zero new findings

**Tests**: unit
**Gate**: full
**Commit**: `test(retrieval): pin the sparse branch filter, limit, and repo isolation`

---

### Phase F5 — Failure paths, shallow assertions, cleanup

---

### F5.1: Surface filesystem read failures

**What**: A bare `catch {}` at `search-codebase.ts:1262-1264` leaves `status: 'ok'` with no marking.
`LiveSourceReader` already implements the marked-degradation contract with 18 passing tests, but is imported
nowhere except `validateRelativePath` (`server.ts:15`). Wire it (or mark degradation inline). This also makes
the `read-failed` branch in `budget.ts:131` reachable instead of dead.
**Where**: `packages/mcp-server/src/tools/search-codebase.ts`,
`packages/mcp-server/src/tools/search-codebase.test.ts`
**Depends on**: F4.4
**Requirement**: FAIL-01, FAIL-04

**Done when**:

- [X] Failing test written first, then implementation
- [X] A failing read produces a response that **states what failed** and still returns the best grounded
      anchor + metadata (FAIL-04)
- [X] `status` is no longer `ok` for that response, and the item is **marked** degraded on the serialized
      response — not silently omitted (spec Edge Cases → Context assembly)
- [X] The `read-failed` branch in `budget.ts` is proven reachable from the handler
- [X] When the **exact highest-priority node** cannot be read, the overflow rule is **not** invoked and the
      failure is reported (spec Edge Cases)
- [X] Gate: `pnpm --filter @ia-framework/mcp-server test`

**Tests**: integration (serialized response)
**Gate**: quick
**Commit**: `fix(mcp-server): surface filesystem read failures as marked degradation`

---

### F5.2: Account failure-response cost

**What**: Failure responses report no `estimated_tokens`, so FAIL-07's "cost accounted" half is unmet.
**Where**: `packages/mcp-server/src/tools/search-codebase.ts`,
`packages/mcp-server/src/context/diagnostics.test.ts`
**Depends on**: F5.1
**Requirement**: FAIL-07

**Done when**:

- [X] Failing test written first, then implementation
- [X] `refused`, `unavailable` and plan-failure responses each report a **non-zero measured**
      `estimated_tokens` for their serialized body
- [X] The failure body stays compact — asserted against a pinned ceiling, not merely "exists"
- [X] Gate: `pnpm --filter @ia-framework/mcp-server test`

**Tests**: integration (serialized response)
**Gate**: quick
**Commit**: `fix(mcp-server): account the token cost of failure responses`

---

### F5.3: Strengthen the 9 shallow assertions

**What**: Strengthen every assertion enumerated in `validation.md` → "Shallow assertions identified".
Any already fixed by an earlier task is confirmed, not re-fixed.
**Where**: `packages/mcp-server/src/tools/search-codebase.test.ts`,
`packages/mcp-server/src/context/budget.test.ts`,
`packages/mcp-server/src/context/diagnostics.test.ts`,
`packages/retrieval/src/planning/query-planner.test.ts`,
`packages/retrieval/src/search-engine.test.ts`,
`packages/retrieval/src/__tests__/search-engine-threshold.test.ts`,
`packages/indexer/src/embedding/input-budgeter.test.ts`,
`packages/cli/src/commands/index.command.test.ts`,
`packages/vector-store/src/qdrant.test.ts`
**Depends on**: F5.2
**Requirement**: `tasks.md:41` Coverage Expectation; `implement.md` Check B

**Done when**:

- [X] `search-codebase.test.ts:419` — `not.toContain('line 2000')` tautology replaced with an absence
      assertion the fixture could genuinely violate (L-008)
- [X] `budget.test.ts:216-218` — conditional `if (compacted) expect(...)` made unconditional (F1.1)
- [X] `diagnostics.test.ts:126,132` — BUD-16 asserted against a **non-empty** engine (F1.4)
- [X] `search-codebase.test.ts:258-263` — "trims results…" asserts real trimming, not `matchCount > 0` plus
      the absence of a retired field
- [X] `query-planner.test.ts:115-116` — `string`-vs-`SparseVector` comparison corrected (F4.4)
- [X] `search-engine.test.ts:1110-1113` — exact filter + limit asserted (F4.4)
- [X] `__tests__/search-engine-threshold.test.ts:315` — `expect(true).toBe(true)` replaced with a real
      assertion or the placeholder removed per D-7
- [X] `input-budgeter.test.ts:80-81` — `.every()` over an asserted-empty array replaced with a non-vacuous
      assertion
- [X] `index.command.test.ts:195` — `exitCode === 0` (F2.4)
- [X] `qdrant.test.ts:482` — the mis-titled "does NOT store content" test either asserts content is absent
      or is renamed to match what it actually proves
- [X] Every replacement satisfies the Rule 3 litmus (fails under a plausible wrong implementation)
- [X] Gate: Full — `pnpm --filter ...@ia-framework/core test` (touches 5 packages)

**Tests**: unit + integration
**Gate**: full
**Commit**: `test: strengthen nine shallow assertions flagged by verification`

---

### F5.4: Delete dead abstractions

**What**: Remove genuinely dead code and its tests together, per D-7.
**Where**: `packages/mcp-server/src/context/assembler.ts` + `assembler.test.ts`,
`packages/mcp-server/src/context/budget.ts` + `budget.test.ts`,
`packages/mcp-server/src/tools/adaptive-budget.ts` + `__tests__/adaptive-budget.test.ts`,
`packages/core/src/planning/types.ts`, `packages/retrieval/src/planning/query-planner.ts` +
`query-planner.test.ts`, `packages/mcp-server/src/tools/search-codebase.ts`
**Depends on**: F5.3
**Requirement**: constitution "minimum code"; `implement.md` Check C

**Done when**:

- [X] `mergeOverlaps` (`assembler.ts:20`, fully tested, never called) removed with its tests
- [X] `BudgetGovernor.enforceUnlimited`, `reserveDiagnostics`, `reservation` removed with their tests
      (`budget.test.ts:50,65,81,98`)
- [X] Unused `plan.candidateLimits.{expansion,semanticPrefetch,signaturePrefetch,sparsePrefetch}` removed
      (`candidateLimits.retrieval` is used at `search-engine.ts:248` — **keep it**)
- [X] `plan.budget.diagnosticsReserve` removed (duplicated by `DIAGNOSTICS_RESERVATION`)
- [X] `plan.lexical.{terms,quotedTerms,pathTerms}` removed **only if** genuinely unreferenced — verify first;
      `evidence.*` equivalents are used inside the planner
- [X] `classifyBudget` in `adaptive-budget.ts:65` removed (duplicates the planner's complexity corpus and can
      drift) with its test file
- [X] The test-only `stageHook` removed from production code **if** F1.3 made stage ordering observable on
      the response; otherwise left with a note explaining why it is still required
- [X] `LiveSourceReader` is **kept** — F5.1 wired it
- [X] Every removed test is named in the commit body (D-7)
- [X] Gate: Full — `pnpm --filter ...@ia-framework/core test`, plus `pnpm build` and scoped
      `turbo typecheck/lint --continue` showing zero new findings

**Tests**: unit (deletions)
**Gate**: full
**Commit**: `refactor: remove dead context, budget, and planning abstractions`

---

### Phase F6a — Gate cleanup, heavy packages (D-4 Option B)

Mechanical conformance work. **No behavior change** — if a fix would alter behavior, stop and ask.
Every task: fix its package's typecheck **and** lint findings to zero, keep its test count at or above the
recorded floor, one commit.

Measured starting counts at `16cb011`. Use `npx turbo <task> --continue` — plain `pnpm` short-circuits.

---

### F6a.1: `mcp-server` — 140 lint, 1 typecheck

**What**: Clear all findings in `packages/mcp-server` (22 lint in `src`, 118 in tests; typecheck error at
`src/tools/index-database-schema.ts:59`).
**Where**: `packages/mcp-server/**`
**Depends on**: F5.4
**Requirement**: D-4

**Done when**:

- [X] `npx turbo typecheck --continue --filter @ia-framework/mcp-server` → 0 errors
- [X] `npx turbo lint --continue --filter @ia-framework/mcp-server` → 0 errors
- [X] No behavior change; no test weakened, skipped or deleted
- [X] Test count ≥ its post-F5 value
- [X] Gate: `pnpm --filter @ia-framework/mcp-server test`

**Tests**: none (conformance only)
**Gate**: quick
**Commit**: `style(mcp-server): clear typecheck and lint findings`

---

### F6a.2: `indexer` — 87 lint, 16 typecheck (019 regression)

**What**: Clear all findings. The 16 typecheck errors are the **019 regression**: T22 made `searchSparse` and
`capabilities()` **required** on `VectorStore`, and `makeMockVectorStore()` (`pipeline.test.ts:106`,
`pipeline-completeness.test.ts:130`) uses `satisfies VectorStore`. Add both members to the mock.
**Where**: `packages/indexer/**`
**Depends on**: F6a.1
**Requirement**: D-4

**Done when**:

- [X] `makeMockVectorStore()` supplies `searchSparse` and `capabilities`, restoring `satisfies VectorStore`
- [X] `npx turbo typecheck --continue --filter @ia-framework/indexer` → 0 errors
- [X] `npx turbo lint --continue --filter @ia-framework/indexer` → 0 errors
- [X] The 1 pre-existing skipped test (streaming timeout, documented at T17) stays skipped — not deleted
- [X] Gate: `pnpm --filter @ia-framework/indexer test`

**Tests**: none (conformance only)
**Gate**: quick
**Commit**: `style(indexer): clear typecheck and lint findings`

---

### F6a.3: `retrieval` — 52 lint

**What**: Clear all findings (5 in `src`, 47 in tests). 28 of these are **019 regressions**, dominated by
`no-unsafe-assignment` (+20) and `no-unsafe-member-access` (+6) in `search-engine.test.ts`,
`__tests__/search-engine-related.test.ts` and `multi-collection-search-engine.test.ts`.
**Where**: `packages/retrieval/**`
**Depends on**: F6a.2
**Requirement**: D-4

**Done when**:

- [X] `npx turbo lint --continue --filter @ia-framework/retrieval` → 0 errors
- [X] `npx turbo typecheck --continue --filter @ia-framework/retrieval` → 0 errors
- [X] Mock typings are tightened rather than silenced — no new `any`, no `eslint-disable` to hide a finding
- [X] Gate: `pnpm --filter @ia-framework/retrieval test`

**Tests**: none (conformance only)
**Gate**: quick
**Commit**: `style(retrieval): clear typecheck and lint findings`

---

### F6a.4: `core` — 30 lint, 10 typecheck

**What**: Clear all findings (21 lint in `src`, 9 in tests; typecheck in `src/config/registry.test.ts` ×8 and
`src/graph/cross-repo-edges.test.ts` ×2).
**Where**: `packages/core/**`
**Depends on**: F6a.3
**Requirement**: D-4

**Done when**:

- [X] `npx turbo typecheck --continue --filter @ia-framework/core` → 0 errors
- [X] `npx turbo lint --continue --filter @ia-framework/core` → 0 errors
- [X] Gate: Full — `pnpm --filter ...@ia-framework/core test` (core changes fan out to every package)

**Tests**: none (conformance only)
**Gate**: full
**Commit**: `style(core): clear typecheck and lint findings`

---

### F6a.5: `dashboard-api` — 30 lint, 2 typecheck

**What**: Clear all findings (7 lint in `src`, 23 in tests; typecheck at `src/routes/tuning.ts:108` ×2 —
`scoreType` missing from a local result type).
**Where**: `packages/dashboard-api/**`
**Depends on**: F6a.4
**Requirement**: D-4

**Done when**:

- [X] `npx turbo typecheck --continue --filter @ia-framework/dashboard-api` → 0 errors
- [X] `npx turbo lint --continue --filter @ia-framework/dashboard-api` → 0 errors
- [X] Gate: `pnpm --filter @ia-framework/dashboard-api test`

**Tests**: none (conformance only)
**Gate**: quick
**Commit**: `style(dashboard-api): clear typecheck and lint findings`

---

### Phase F6b — Gate cleanup, light packages + final Build gate

---

### F6b.1: `vector-store` — 24 lint

**What**: Clear all findings (19 in `src`, 5 in tests; 18 auto-fixable). +6 are 019 regressions
(`require-await` ×4, `no-unsafe-return`, `no-unused-vars`).
**Where**: `packages/vector-store/**`
**Depends on**: F6a.5
**Requirement**: D-4

**Done when**:

- [X] `npx turbo lint --continue --filter @ia-framework/vector-store` → 0 errors
- [X] `npx turbo typecheck --continue --filter @ia-framework/vector-store` → 0 errors
- [X] Gate: `pnpm --filter @ia-framework/vector-store test`

**Tests**: none (conformance only)
**Gate**: quick
**Commit**: `style(vector-store): clear typecheck and lint findings`

---

### F6b.2: `embedding` — 23 lint

**What**: Clear all findings (all 23 in tests; +5 are 019 regressions, all `require-await`).
**Where**: `packages/embedding/**`
**Depends on**: F6b.1
**Requirement**: D-4

**Done when**:

- [X] `npx turbo lint --continue --filter @ia-framework/embedding` → 0 errors
- [X] `npx turbo typecheck --continue --filter @ia-framework/embedding` → 0 errors
- [X] Gate: `pnpm --filter @ia-framework/embedding test`

**Tests**: none (conformance only)
**Gate**: quick
**Commit**: `style(embedding): clear typecheck and lint findings`

---

### F6b.3: `ast-parser` — 3 lint, 23 typecheck

**What**: Clear all findings. Typecheck: 23 `Object is possibly 'undefined'` in
`src/parsers/{proto,sql,xml,yaml}.test.ts`. Lint: unused `classChunk` (`parsers/java.test.ts:335`), unused
`CHUNK_ELEMENT_TYPES` (`parsers/xml.ts:27`), unnecessary type assertion (`splitter.ts:152`). All confirmed
present at `fab0016`.
**Where**: `packages/ast-parser/**`
**Depends on**: F6b.2
**Requirement**: D-4

**Done when**:

- [X] `npx turbo typecheck --continue --filter @ia-framework/ast-parser` → 0 errors
- [X] `npx turbo lint --continue --filter @ia-framework/ast-parser` → 0 errors
- [X] Assertions are made non-optional by narrowing, not by weakening what they check
- [X] Gate: `pnpm --filter @ia-framework/ast-parser test` (175 test floor)

**Tests**: none (conformance only)
**Gate**: quick
**Commit**: `style(ast-parser): clear typecheck and lint findings`

---

### F6b.4: `cli` + `dashboard` — 4 lint, 5 typecheck

**What**: Clear all findings. `cli`: 3 lint + 5 typecheck at `src/commands/benchmark.command.ts` (lines
101, 602, 710, 722, 801 — `string | undefined` vs `string`). `dashboard`: 1 lint
(`react-hooks/exhaustive-deps`). **`benchmark.command.ts` is CLI code that *invokes* benchmark — it is not
under `packages/benchmark` and is in scope.**
**Where**: `packages/cli/**`, `packages/dashboard/**`
**Depends on**: F6b.3
**Requirement**: D-4

**Done when**:

- [X] `npx turbo typecheck --continue --filter @ia-framework/cli --filter @ia-framework/dashboard` → 0 errors
- [X] `npx turbo lint --continue --filter @ia-framework/cli --filter @ia-framework/dashboard` → 0 errors
- [X] **No file under `packages/benchmark` is modified** (verify with `git diff --name-only`)
- [X] Gate: `pnpm --filter @ia-framework/cli test`

**Tests**: none (conformance only)
**Gate**: quick
**Commit**: `style(cli,dashboard): clear typecheck and lint findings`

---

### F6b.5: Final Build gate + traceability close-out

**What**: Run the unqualified Build gate, update the requirement traceability table in `validation.md`, mark
every fix task `[X]` here, update `tasks.md`'s Execution Checkpoint, and update **only** the `## Handoff`
section of `.specs/STATE.md`.
**Where**: `.specs/features/019-rag-correctness-exact-context/fix-tasks.md`,
`.specs/features/019-rag-correctness-exact-context/validation.md`,
`.specs/features/019-rag-correctness-exact-context/tasks.md`, `.specs/STATE.md`
**Depends on**: F6b.4
**Requirement**: D-4, D-5

**Done when**:

- [X] `pnpm build` ✅ — 14/14 tasks successful
- [X] `npx turbo typecheck --continue` → **0 errors across all 14 packages** (measured: 24/24 tasks
      successful, down from 57 errors)
- [X] `npx turbo lint --continue` → **exactly 1 error**, the D-5 benchmark deviation
      (`packages/benchmark/src/benchmark-runner.test.ts:273`), and nothing else (down from 394)
- [X] `pnpm test` ✅ — **1878 passed, 0 failed**, 1 pre-existing skip (indexer streaming timeout, T17)
- [X] Every fix task marked `[X]`
- [X] `validation.md` requirement traceability updated for the requirements this batch addressed
- [X] `tasks.md` Execution Checkpoint updated
- [X] `.specs/STATE.md` — **only** the `## Handoff` section body replaced; `## Decisions` untouched
      (section-scoped write; overwriting the file destroys the AD-001..AD-005 log)
- [X] Gate: Build — `pnpm build && pnpm typecheck && pnpm lint && pnpm test` (with the single documented
      D-5 lint deviation)

**Tests**: none (documentation + gate)
**Gate**: build
**Commit**: `docs(019): record fix-batch completion and gate state`

---

## On Completion

1. **Do not self-certify.** Dispatch the independent Verifier (author ≠ verifier) for **iteration 2**.
2. Iteration-2 pass condition: **M1, M2, M3 and M6 are all killed**, plus the 18 confirmed GAPs closed.
3. On a **PASS** verdict, surface `/delivery 019-rag-correctness-exact-context` and **STOP**. Never run
   `/delivery` — showing the command is the user's authorization.
4. On a **FAIL**, this becomes iteration 3 — the **last** before escalation to the user.

## Self-Check Before Declaring Any Task Done

- Does every new assertion read the **serialized response** where the requirement is about what the caller
  receives?
- Would the assertion **fail** under a plausible wrong implementation?
- Did the gate pass, with the test count **at or above** the prior count?
- Is there **exactly one commit** for this task, touching **only** its named files?
