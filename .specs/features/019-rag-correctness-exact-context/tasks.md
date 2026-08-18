# RAG Correctness, Deterministic Query Planning, and Exact Token-Efficient Context Delivery — Tasks

## Execution Protocol (MANDATORY -- do not skip)

Implement these tasks with the `tlc-spec-driven` skill: **activate it by name and follow its Execute flow and Critical Rules.** Do not search for skill files by filesystem path. The skill is the source of truth for the full flow (per-task cycle, sub-agent delegation, adequacy review, Verifier, discrimination sensor).

**If the skill cannot be activated, STOP and tell the user — do not proceed without it.**

---

**Spec**: `.specs/features/019-rag-correctness-exact-context/spec.md`
**Design**: `.specs/features/019-rag-correctness-exact-context/design.md`
**Context**: `.specs/features/019-rag-correctness-exact-context/CONTEXT.md`
**Status**: Verifier returned **FAIL** (iteration 1 of max 3) — T1-T48 complete, fix tasks required before delivery
**Scope tier**: Complex — 105 requirements, 8 packages, 7 phases, 48 tasks

## Execution Checkpoint

- **Branch**: `019-rag-correctness-exact-context`
- **Completed**: T1-T48 (original feature) **plus the full iteration-2 remediation batch F1-F6b (31 tasks)** defined in `fix-tasks.md`. Every checklist item in both files is marked `[X]`; one atomic commit per task.
- **Next task**: **none — re-dispatch the independent Verifier for iteration 2.** No implementation work remains in scope.
- **Pending**: independent re-verification. The iteration-1 FAIL verdict in `validation.md` stands until the Verifier re-derives coverage and re-runs the discrimination sensor. The fix batch's author does not certify their own work.
- **Last task commit**: `docs(019): record fix-batch completion and gate state` (fix batch range `b055c1e..ec3bd8c`, 31 commits).
- **Verification**: iteration 1 (2026-08-12) returned **FAIL** — 18 spec gaps, 29 spec-precision gaps, 4 surviving mutants; root cause was `mcp-server` requirements verified against intermediate objects rather than the final serialized tool response. The iteration-2 batch bound every new assertion to the **Serialized-Response Rule**.
- **Gate state at `ec3bd8c`** (measured with `npx turbo <task> --continue`, since plain `pnpm typecheck`/`pnpm lint` short-circuit at the first failing package): build ✅ 14/14 · test ✅ **1878 passed / 0 failed / 1 pre-existing skip** (up from 1804) · typecheck ✅ **0 errors** (down from 57) · lint **1 error** (down from 394) — the single remaining error is the documented **D-5** deviation at `packages/benchmark/src/benchmark-runner.test.ts:273`, pre-existing at `fab0016` and inside the one package `spec.md:950` forbids modifying. No `eslint-disable`, `@ts-ignore`, `@ts-expect-error`, or `any` widening was introduced anywhere in the cleanup.
- **Surviving mutants**: all four are **reported killed** by the fix batch — M1 and M2 by F1.3 (serialized-response budget enforcement and measured `estimated_tokens`), M3 by F4.4 (exact sparse filter + limit + two-repo isolation), M6 by F3.2 (exact source never replaced by an enrichment summary). **These are author claims; re-running the sensor is the Verifier's job.**
- **Resume instruction**: re-dispatch the independent Verifier for **iteration 2 of a maximum 3**. Pass condition: M1/M2/M3/M6 all killed and the 18 confirmed GAPs closed. `/delivery` is authorized only on a PASS verdict. On a FAIL this becomes iteration 3 — the last before escalation to the user.

---

## Test Coverage Matrix

> Generated from codebase, project guidelines, and spec — confirm before Execute. Guidelines found: `.specify/memory/constitution.md` (Principle I "TDD (Non-Negotiable)" `:20-34`; Quality Gates `:171-176`; test placement `:182-183`), `.planning/codebase/CONVENTIONS.md` (`:10` `kebab-case.test.ts`, `:17` `make`-prefixed fixture factories, `:173`/`:180` constructor DI for mockability), `CLAUDE.md:12` (Vitest + TDD). **No `vitest.config.*` exists anywhere** — Vitest runs zero-config per package via Turbo, using its default `**/*.{test,spec}.?(c|m)[jt]s?(x)` glob. **No numeric coverage threshold exists** and `@vitest/coverage-v8` is not installed, so coverage is a qualitative gate (constitution `:29-31` + the per-task `file:line` evidence rule). **No CI exists** (`.github/` absent) — `pnpm test` + `pnpm build` is the merge gate by convention.

| Code Layer | Required Test Type | Coverage Expectation | Location Pattern | Run Command |
| ---------- | ------------------ | -------------------- | ---------------- | ----------- |
| `core` pure primitives (tokenizer, sparse builder, token estimator, embedding contract, capabilities, error taxonomy) | unit | All branches; 1:1 to spec ACs; every listed edge case has a test | `packages/core/src/**/*.test.ts` (co-located) | `pnpm --filter @ia-framework/core test` |
| `core` config schema (Zod) | unit | Every added/changed field asserted present after parse (round-trip), plus rejection cases | `packages/core/src/config/schema.test.ts` | `pnpm --filter @ia-framework/core test` |
| `embedding` providers (OpenAI / Ollama / caching) | unit | All branches; 1:1 to spec ACs; request-shape and response-validation edge cases each have a test | `packages/embedding/src/**/*.test.ts` (co-located) | `pnpm --filter @ia-framework/embedding test` |
| `vector-store` adapter + contract store + filter-only (data-access) | integration (mocked Qdrant client) | Key query paths + error paths + pagination-to-exhaustion + repo isolation; every AC of SPR-01..06 / FLT-01..13 / EMB-08..11 | `packages/vector-store/src/*.test.ts` (co-located) | `pnpm --filter @ia-framework/vector-store test` |
| `indexer` pipeline / budgeter / oversized handler (service) | unit | All branches; 1:1 to spec ACs; every listed edge case (oversized, partial failure, cancellation, repack) | `packages/indexer/src/**/*.test.ts` + `packages/indexer/src/__tests__/*.test.ts` | `pnpm --filter @ia-framework/indexer test` |
| `retrieval` planner / search engine / expansion (service) | unit | All branches; 1:1 to spec ACs; determinism, filter threading, tokenizer agreement, branch provenance | `packages/retrieval/src/*.test.ts` + `packages/retrieval/src/__tests__/*.test.ts` | `pnpm --filter @ia-framework/retrieval test` |
| `mcp-server` tool handlers / assembler / budget / diagnostics (presentation + contract boundary) | integration (asserted on the final serialized tool response) | All routes in scope: happy path + every listed edge case + error/failure paths; assertions read the serialized `content[].text` and `structuredContent`, never intermediate candidates | `packages/mcp-server/src/**/*.test.ts` + `packages/mcp-server/src/tools/__tests__/*.test.ts` | `pnpm --filter @ia-framework/mcp-server test` |
| `ast-parser` chunker / splitter / parsers | unit | All branches for the new line-offset fields; per-language coverage for every parser that emits them | `packages/ast-parser/src/**/*.test.ts` | `pnpm --filter @ia-framework/ast-parser test` |
| `cli` commands (index summary, exit code, agents template) | unit | Key paths + error paths: exit code on skipped chunks, summary identity rendering, injected-guidance content | `packages/cli/src/commands/*.test.ts` | `pnpm --filter @ia-framework/cli test` |
| Type-only declarations / re-export barrels (`index.ts`) | none | — (build + typecheck gate only) | — | build gate only |
| Markdown documentation (`README.md`, `.specs/**`) | none | — (no runtime behavior) | — | build gate only |

**Note on "integration":** this repo has no real-service test tier — every existing suite mocks its
dependencies (`vi.mock` for third-party modules, injected object literals for owned collaborators).
"Integration" here therefore means *cross-module, contract-level, mocked-boundary* tests, matching
`.specify/memory/constitution.md:183` ("Integration tests in dedicated `__tests__/` … directories")
and design risk row `design.md:902`. Where real-server behavior is load-bearing (sparse query shape,
`next_page_offset`, `order_by` absence), the design pins the assumption to quoted vendor docs
rather than to a live server.

## Gate Check Commands

> Generated from codebase — confirm before Execute.

| Gate Level | When to Use | Command |
| ---------- | ----------- | ------- |
| Quick | After a task whose tests are unit tests inside a single package | `pnpm --filter @ia-framework/<pkg> test` |
| Full | After a task with integration tests, or that changes a cross-package contract | `pnpm --filter ...@ia-framework/<pkg> test` (package **and all its dependents**) |
| Build | After phase completion, or for a type-only / barrel-only / documentation-only task | `pnpm build && pnpm typecheck && pnpm lint && pnpm test` |

**Verified filter semantics:** `--filter=...@ia-framework/core` expands to that package **plus every
dependent** (`ast-parser`, `embedding`, `vector-store`, `indexer`, `retrieval`, `mcp-server`, `cli`,
`db-context`, `observability`, `project-detector`, `dashboard-api`, `benchmark`), while
`--filter=@ia-framework/core...` expands to the package alone. The **Full** gate deliberately uses
the leading-dot form so a contract change cannot go green while it breaks a consumer.

**`packages/benchmark` note:** it appears in the Full gate's *dependent* set and its tests will
execute. That is read-only fan-out and does not violate the spec's "no file under
`packages/benchmark` is modified" success criterion — but if a `benchmark` test fails because of a
changed contract, the fix goes in the changed package or the task is wrong. Never edit
`packages/benchmark`.

---

**Co-located tests:** Every task below that creates or modifies a code layer with a required test
type includes writing/updating those tests in the same task. Tests are never separate tasks, and
they must satisfy the layer's **Coverage Expectation**, not merely exist.

**TDD ordering (constitution Principle I, non-negotiable):** within each task, write the failing
test first, then the minimum implementation, then refactor. The `Done when` lists are written so the
test criterion precedes the implementation criterion.

---

## Tools Available During Execute

**MCP servers:**

| MCP | Use it for | Applies to |
| --- | --- | --- |
| `context7` | Re-verifying third-party library contracts before hardcoding a limit or a request shape: OpenAI embeddings (`/websites/developers_openai_api`), Ollama (`/ollama/ollama`), Qdrant JS client (`/qdrant/qdrant-js`) | T4, T9, T10, T12, T23, T24, T28, T32 |
| `ia-framework` | **Not used by any task.** | — |

**Why `ia-framework` is excluded:** this repo is the codebase being modified, and it is **not indexed
into itself** — the configured collections contain the `achpro` and `merchant-gateway` repos, verified
by a probe query for `QdrantVectorStore initialize payload index creation` that returned only
`achpro-server` / `merchant-gateway-server` matches. Its results would therefore be irrelevant at best
and misleading at worst. Every task uses `Read`, `Grep`, and `Glob` against the working tree instead —
which is also the only correct choice while the retrieval code is mid-refactor, since a task that
changes `search-engine.ts` cannot trust a retrieval tool built on it.

**Skills:** no task requires a skill beyond `tlc-spec-driven` itself, which the Execution Protocol at
the top of this file already mandates. The `rag-architect` skill informed the spec and design and does
not need re-loading during implementation.

---

## Execution Plan

Phases are ordered and run sequentially — each phase completes before the next begins, and tasks
within a phase execute in order. Phase order follows `design.md:956-973` ("Recommended Phase Order")
with two phases split at dependency seams to stay near the ~7-task worker budget.

### Phase 1: Core primitives (7 tasks)

Pure, dependency-free foundations in `@ia-framework/core`. No behavior change to any consumer yet;
unblocks everything downstream.

```
T1 → T2 → T3 → T4 → T5 → T6 → T7
```

### Phase 2: WS1 embedding contract (7 tasks)

Providers apply and validate the contract; the collection persists it; `initialize()` stops being
destructive. Establishes the refusal gate that makes the later mandatory re-index safe.

```
T8 → T9 → T10 → T11 → T12 → T13 → T14
```

### Phase 3: WS4 input safety + AP-4 AST line offsets (7 tasks)

Indexer-side. Must land **before** the re-index so the new payload fields exist when the corpus is
rebuilt.

```
T15 → T16 → T17 → T18 → T19 → T20 → T21
```

### Phase 4: WS2 sparse retrieval (6 tasks)

Store-side sparse primitives plus the index/query hash unification. Requires the contract gate from
Phase 2 and the tokenizer from Phase 1.

```
T22 → T23 → T24 → T25 → T26 → T27
```

### Phase 5: WS3 filter-only retrieval and expansion (7 tasks)

Replaces all six zero-vector fakes, closes the payload-decode gaps, and makes repo isolation
compiler-enforced.

```
T28 → T29 → T30 → T31 → T32 → T33 → T34
```

### Phase 6: WS5 planning + WS6 enrichment (6 tasks)

Retire both classifiers behind one deterministic plan; widen `RetrievalResult` so enrichment reaches
the MCP layer.

```
T35 → T36 → T37 → T38 → T39 → T40
```

### Phase 7: WS7 assembly + WS8 budget + WS9 failures (7 tasks)

The MCP-side payoff. Depends on every prior phase.

```
T41 → T42 → T43 → T44 → T45 → T46 → T47
```

### Phase 8: P2 documentation alignment (1 task)

Last, so it describes shipped behavior.

```
T48
```

**Phase sizing check:** no phase exceeds ~10 tasks (≈1.5× the ~7-task worker budget), so no phase
forces an over-sized worker. Design's phase 4 ("WS2 sparse + WS3 filter-only") was **split** into
Phases 4 and 5 at a genuine seam — sparse retrieval is a *vector-query* capability while filter-only
retrieval is a *payload-selection* capability; they share only the base filter helper, which lands in
Phase 4 (T24) and is consumed in Phase 5. Design's phase 6 stays whole at 7 tasks because assembly,
budget, and failure surfacing are one tight dependency chain through `ContextAssembler`.

---

## Task Breakdown

### Phase 1 — Core primitives

---

### T1: Create the canonical `LexicalTokenizer` in `core`

**What**: Add one deterministic tokenizer that splits identifier case boundaries **before**
lowercasing, preserves quoted phrases as single terms, and handles dot/path/package/annotation forms.
**Where**: `packages/core/src/lexical/tokenizer.ts` (new), `packages/core/src/lexical/tokenizer.test.ts` (new)
**Depends on**: None
**Reuses**: `packages/retrieval/src/bm25-reranker.ts:32-41` — the only one of the three existing
tokenizers that already splits camelCase before lowercasing; port it as the base and extend it for
quoted phrases, dots, paths, packages, and annotations.
**Requirement**: SPR-08, SPR-09, A-16, AD-003

**Tools**:

- MCP: NONE — read `packages/retrieval/src/bm25-reranker.ts` directly with `Read`
- Skill: NONE

**Done when**:

- [X] Failing test written first, then implementation (constitution Principle I)
- [X] `tokenize('getUserById')` yields `['get','user','by','id']` — case split precedes lowercasing
- [X] PascalCase (`PaymentService`), acronym-boundary (`HTTPServer`), snake_case, dot-notation
      (`PaymentService.refund`), path (`src/services/payment.ts`), package (`com.acme.billing`),
      and annotation (`@Transactional`) forms each have a test asserting the exact term list
- [X] A quoted phrase (`"exact phrase here"`) survives as one term
- [X] Single-character and two-character queries are deterministic and do not drop the only signal
      the query has (spec Edge Cases → Sparse retrieval)
- [X] `TOKENIZER_VERSION` exported as a numeric constant
- [X] Same input twice yields a deeply-equal array (determinism)
- [X] Exported from `packages/core/src/index.ts`
- [X] Gate check passes: `pnpm --filter @ia-framework/core test`
- [X] Test count: ≥12 tests pass (no silent deletions)

**Tests**: unit
**Gate**: quick

**Commit**: `feat(core): add canonical lexical tokenizer with identifier-boundary splitting`

---

### T2: Create shared `buildSparseVector` in `core`

**What**: Build a sparse vector from tokenized sources with unique ascending indices, values aligned
to indices, and colliding-term weights summed deterministically.
**Where**: `packages/core/src/lexical/sparse.ts` (new), `packages/core/src/lexical/sparse.test.ts` (new)
**Depends on**: T1
**Reuses**: `packages/retrieval/src/search-engine.ts:958-991` (`computeTermFrequencySparseVector`) —
its collision-summing behavior is already correct for SPR-10; keep that and discard its
`hash & 0x7fffffff` projection. The index side's `hash % 65536` (`packages/indexer/src/embedder.ts:84`)
is likewise discarded — one shared hash replaces both (design F1, `design.md:28-44`).
**Requirement**: SPR-10, A-16, AD-003

**Tools**:

- MCP: NONE — this repo is not self-indexed (see note above)
- Skill: NONE

**Done when**:

- [X] Failing test written first, then implementation
- [X] One `sparseHash(term: string): number` exported alongside `SPARSE_HASH_VERSION`
- [X] `indices` are strictly ascending and unique; `values.length === indices.length` (SPR-10)
- [X] Two distinct terms forced onto the same index have their weights **summed**, and the test
      asserts the summed value (spec Edge Cases → "two distinct terms hash to the same sparse index")
- [X] An input producing zero surviving tokens returns an empty vector distinguishable from a
      failure (feeds the "branch skipped, not executed-with-zero-results" rule)
- [X] Term weighting stays compatible with the collection's `modifier: 'idf'` sparse config —
      asserted by a test documenting the raw-TF contract the modifier expects
- [X] Golden-vector test: a fixed input string produces a byte-stable `{indices, values}` snapshot,
      so any future hash change is a visible test failure rather than a silent mismatch
- [X] Exported from `packages/core/src/index.ts`
- [X] Gate check passes: `pnpm --filter @ia-framework/core test`
- [X] Test count: ≥8 tests pass (no silent deletions)

**Tests**: unit
**Gate**: quick

**Commit**: `feat(core): add shared sparse vector builder with deterministic collision summing`

---

### T3: Create the calibrated `TokenEstimator` in `core`

**What**: A conservative, dependency-free token estimator that never under-reports beyond a
documented, test-asserted margin.
**Where**: `packages/core/src/tokens/estimator.ts` (new), `packages/core/src/tokens/estimator.test.ts` (new)
**Depends on**: None
**Reuses**: `packages/mcp-server/src/tools/token-cap.ts:23-25` (`estimateTokens`) as the starting
point — but its `ceil(len/4)` **under-reports** dense code and non-ASCII, which BUD-13 forbids.
Replace with a character-class-weighted estimate.
**Requirement**: BUD-13, A-08

**Tools**:

- MCP: NONE — this repo is not self-indexed (see note above)
- Skill: NONE

**Done when**:

- [X] Failing test written first, then implementation
- [X] `estimateTokens(text: string): number` over-estimates or matches on every corpus sample;
      never under-estimates beyond the documented margin
- [X] The margin is exported as a named constant and **asserted by a test** over a corpus of ≥10
      real chunks read from this repo's own `packages/**/src/*.ts` files (calibration per
      `design.md:981-983`, which explicitly leaves the *value* to Tasks and fixes only the *shape*)
- [X] Dense-code sample (minified/symbol-heavy) and non-ASCII/CJK sample each have a test proving
      no under-report
- [X] Empty string returns 0; whitespace-only is deterministic
- [X] The chosen margin value is recorded in a code comment citing BUD-13 as its authority
- [X] Exported from `packages/core/src/index.ts`
- [X] Gate check passes: `pnpm --filter @ia-framework/core test`
- [X] Test count: ≥8 tests pass (no silent deletions)

**Tests**: unit
**Gate**: quick

**Commit**: `feat(core): add conservative token estimator with asserted non-under-report margin`

---

### T4: Create `ProviderCapabilities` model-capability table in `core`

**What**: The per-provider/per-model rule set that decides whether a configured dimension is legal
and what the input limits are.
**Where**: `packages/core/src/embedding/capabilities.ts` (new), `packages/core/src/embedding/capabilities.test.ts` (new)
**Depends on**: None
**Reuses**: `packages/embedding/src/factory.ts:7-17` (`DEFAULT_DIMENSIONS`) as the seed for
`nativeDimension`; OpenAI's verified limits from `spec.md:135-140` (8192 tokens/input, 2048 items/array,
300 000 tokens/request); Ollama's `/api/show` `context_length` discovery already used at
`packages/embedding/src/factory.ts:68`.
**Requirement**: EMB-01, EMB-02, A-01, A-03

**Tools**:

- MCP: `context7` — re-verify provider limits (`/websites/developers_openai_api`, `/ollama/ollama`) before hardcoding them
- Skill: NONE

**Done when**:

- [X] Failing test written first, then implementation
- [X] `capabilitiesFor(provider, model): ModelCapabilities` returns
      `{ supportsDimensionParam, nativeDimension?, maxInputTokens, maxBatchItems?, maxRequestTokens?, disableServerTruncation }`
- [X] `text-embedding-3-small` / `-3-large` → `supportsDimensionParam: true`
- [X] `text-embedding-ada-002` → `supportsDimensionParam: false` (verified in `spec.md:136`)
- [X] Ollama models → `supportsDimensionParam: true`, `disableServerTruncation: true` (A-02)
- [X] OpenAI limits asserted exactly: 8192 / 2048 / 300000
- [X] An **unknown** model returns a conservative default rather than throwing, and the test asserts
      the default is conservative (smaller limits, no dimension param) — A-03
- [X] Exported from `packages/core/src/index.ts`
- [X] Gate check passes: `pnpm --filter @ia-framework/core test`
- [X] Test count: ≥10 tests pass (no silent deletions)

**Tests**: unit
**Gate**: quick

**Commit**: `feat(core): add provider/model embedding capability table`

---

### T5: Create `EmbeddingContract` value object in `core`

**What**: One value object describing what a vector *is*, with resolution, comparison, and
fingerprinting.
**Where**: `packages/core/src/embedding/contract.ts` (new), `packages/core/src/embedding/contract.test.ts` (new)
**Depends on**: T1, T2, T4
**Reuses**: `capabilitiesFor` from T4; `TOKENIZER_VERSION` from T1; `SPARSE_HASH_VERSION` from T2;
`ConfigNotFoundError` shape at `packages/core/src/config/loader.ts:5-10` as the error-class house pattern.
**Requirement**: EMB-02, EMB-08, EMB-09, BUD-14, A-13

**Tools**:

- MCP: NONE — this repo is not self-indexed (see note above)
- Skill: NONE

**Done when**:

- [X] Failing test written first, then implementation
- [X] `resolveContract(cfg)` returns `{ provider, model, dimension, prefixes?, tokenizerVersion, sparseHashVersion }`
- [X] `resolveContract` **throws** `EmbeddingConfigurationError` when the configured dimension
      differs from `nativeDimension` **and** `supportsDimensionParam` is false, and the message names
      provider, model, configured dimension, and the model's dimension behavior (EMB-02)
- [X] Edge case asserted: native dimension **equals** configured dimension while the model does not
      support the parameter → resolution **succeeds** and records that the param must be omitted
      (spec Edge Cases → Embedding contract, first bullet)
- [X] `contractsMatch(a, b)` returns `null` on agreement and a `ContractDiff` naming **each**
      differing field on mismatch — including a prefix-pair-only difference (EMB-09)
- [X] `contractFingerprint(c)` is stable across calls and changes when any field changes, including
      `tokenizerVersion` and `sparseHashVersion` (BUD-14)
- [X] Exported from `packages/core/src/index.ts`
- [X] Gate check passes: `pnpm --filter @ia-framework/core test`
- [X] Test count: ≥12 tests pass (no silent deletions)

**Tests**: unit
**Gate**: quick

**Commit**: `feat(core): add embedding contract value object with mismatch diffing`

---

### T6: Add `prefixes` to `EmbeddingProviderConfigSchema`

**What**: Stop the Zod schema from silently stripping the configured `prefixes` object — this single
omission is the whole of EMB-07.
**Where**: `packages/core/src/config/schema.ts` (modify, lines 3-9),
`packages/core/src/config/schema.test.ts` (modify),
`packages/core/src/types/index.ts` (modify — `EmbeddingProviderConfig`)
**Depends on**: None
**Reuses**: The existing `z.object` shape; `.ia-framework/project.json` already sets `prefixes`
today and it is silently discarded (`design.md:94`).
**Requirement**: EMB-07

**Tools**:

- MCP: NONE — this repo is not self-indexed (see note above)
- Skill: NONE

**Done when**:

- [X] Failing test written first, then implementation
- [X] `prefixes: z.object({ document: z.string(), query: z.string() }).optional()` added to the schema
- [X] Round-trip test: parsing a config **containing** `prefixes` yields an object where
      `prefixes.document` and `prefixes.query` are both present and equal to the input (the exact
      assertion that fails today because Zod's default `strip` drops them)
- [X] A config **without** `prefixes` still parses, with `prefixes === undefined`
- [X] A malformed `prefixes` (missing `query`, or non-string) is **rejected**
- [X] `EmbeddingProviderConfig` in `packages/core/src/types/index.ts` declares the field, so the
      `as ProjectConfig` cast at `packages/core/src/config/loader.ts:24` no longer hides the gap
- [X] Gate check passes: `pnpm --filter ...@ia-framework/core test`
- [X] Test count: ≥4 new tests pass (no silent deletions)

**Tests**: unit
**Gate**: full

**Commit**: `fix(core): stop stripping embedding prefixes from provider config schema`

---

### T7: Create the error taxonomy and `RetrievalStatus` in `core`

**What**: Nine typed error classes plus the closed status enum, all following the house pattern, so
every failure named in WS9 is actionable and machine-branchable.
**Where**: `packages/core/src/errors/index.ts` (new), `packages/core/src/errors/index.test.ts` (new)
**Depends on**: None
**Reuses**: `ConfigNotFoundError` at `packages/core/src/config/loader.ts:5-10` for the class shape
(`extends Error`, `public readonly` context fields, `this.name`); `formatOllamaError` /
`categorizeOllamaError` at `packages/indexer/src/errors/ollama-errors.ts:8-122` for the actionable
multi-line `Suggestion:` message style; `[OLD_SCHEMA]` at `packages/vector-store/src/qdrant.ts:198-208`
for the sentinel-prefix-plus-remediation posture.
**Requirement**: FAIL-01, FAIL-06, EMB-02, EMB-04, EMB-09, EMB-10, EMB-11, FLT-08, FLT-10, QP-13, INP-06, A-27, AD-004

**Tools**:

- MCP: NONE — this repo is not self-indexed (see note above)
- Skill: NONE

**Done when**:

- [X] Failing test written first, then implementation
- [X] `type RetrievalStatus = 'ok' | 'empty' | 'low_confidence' | 'unavailable' | 'refused'` exported
      as a closed union (AD-004, CONTEXT.md decision 2)
- [X] All nine classes exist per `design.md:682-692`: `EmbeddingConfigurationError`,
      `EmbeddingResponseError`, `EmbeddingContractMismatchError`, `UnknownContractError`,
      `CollectionSchemaError`, `PayloadIndexError`, `FilterOnlyRetrievalError`, `QueryPlanError`,
      `OversizedInputError`
- [X] Each class sets `this.name` to its own class name and exposes its context as
      `public readonly` fields — asserted per class
- [X] Each class's message contains a `Suggestion:` line naming a **remediation**; for the two
      contract errors the remediation names the real existing flag `ia index --force`
      (`packages/cli/src/commands/index.command.ts:146`) — asserted by substring
- [X] Each is `instanceof Error` and distinguishable from the others by `instanceof` — asserted, so
      callers can branch on type rather than parse strings
- [X] Exported from `packages/core/src/index.ts`
- [X] Gate check passes: `pnpm --filter @ia-framework/core test`
- [X] Test count: ≥14 tests pass (no silent deletions)

**Tests**: unit
**Gate**: quick

**Commit**: `feat(core): add retrieval error taxonomy and closed status enum`

---
### Phase 2 — WS1 embedding contract

---

### T8: Widen `EmbeddingProvider` interface with contract and per-input failure outcome

**What**: Add `readonly contract` and change `embedBatch` to return per-input outcomes, then update
every structural duplicate of the provider type so the compiler surfaces all consumers.
**Where**: `packages/embedding/src/interface.ts` (modify),
`packages/indexer/src/embedder.ts` (modify, lines 37-41),
`packages/retrieval/src/types.ts` (modify, lines 105-108),
`packages/embedding/src/caching-provider.ts` (modify),
`packages/embedding/src/caching-provider.test.ts` (modify, mock factory at lines 1-24)
**Depends on**: T5
**Reuses**: `EmbeddingContract` from T5. The three structural duplicates are a deliberate tripwire
(`design.md:304-307`, risk row `:892`) — the annotated mock factory fails compilation until updated.
**Approved scope amendment (2026-08-07)**: The user approved modifying the OpenAI/Ollama provider
implementations and compile-blocking consumer/test fixtures outside the original Where list solely
to make the canonical contract and outcome types type-safe across the workspace. T9/T10 behavior
remains deferred; T8 providers only expose the contract and wrap existing results.
**Requirement**: EMB-06, INP-09, A-20

**Tools**:

- MCP: NONE — enumerate consumers with `Grep` for `EmbeddingProvider` across `packages/`
- Skill: NONE

**Done when**:

- [X] Failing test written first, then implementation
- [X] `EmbeddingProvider` declares `readonly contract: EmbeddingContract`
- [X] `embedBatch(texts, taskType?): Promise<EmbedBatchOutcome>` where
      `EmbedBatchOutcome = { vectors: (number[] | null)[]; failures: InputFailure[] }`
- [X] `InputFailure` carries enough identity to re-index the input (index position + reason +
      retryable flag) — INP-09/A-20
- [X] All three structural duplicates collapsed onto the canonical interface (imported, not redeclared)
- [X] `CachingEmbeddingProvider` forwards `contract` and preserves per-input failures through its
      cache layer — asserted by a test where one input is cached and a sibling fails
- [X] Feature-owned packages pass typecheck; the workspace command has the approved pre-existing
      baseline failures documented below
- [X] Gate check passes: `pnpm --filter ...@ia-framework/embedding test`
- [X] Test count: existing `caching-provider.test.ts` count preserved + ≥4 new tests (no silent deletions)

**Verification deviation (approved 2026-08-08)**: `pnpm typecheck` still reports strict-index
errors in untouched pre-existing tests under `packages/core/src/config/registry.test.ts`,
`packages/core/src/graph/cross-repo-edges.test.ts`, and `packages/ast-parser/src/parsers/{proto,sql,xml,yaml}.test.ts`.
The embedding, indexer, and retrieval packages changed by T8 pass typecheck, and the full T8
dependent-package test gate passes. No unrelated baseline test files were modified.

**Tests**: unit
**Gate**: full

**Commit**: `refactor(embedding)!: add contract and per-input failure outcome to provider interface`

---

### T9: Apply and validate the contract in the OpenAI provider

**What**: Send `dimensions` when the model supports it, re-establish batch order from the response
`index`, and reject any malformed or wrong-length vector before it can be returned.
**Where**: `packages/embedding/src/providers/openai.ts` (modify),
`packages/embedding/src/providers/openai.test.ts` (new)
**Depends on**: T8
**Reuses**: The existing `data[].index` re-sort at `packages/embedding/src/providers/openai.ts:57`
(already correct — keep it and assert it); `applyPrefix` at `:32-36`.
**Requirement**: EMB-01, EMB-02, EMB-03, EMB-04, EMB-07, INP-08

**Tools**:

- MCP: `context7` (`/websites/developers_openai_api`) — confirm the `dimensions` request field and the 8192/2048/300000 limits
- Skill: NONE

**Done when**:

- [X] Failing test written first, then implementation
- [X] Request **includes** `dimensions` for `text-embedding-3-*` when configured (EMB-01) — asserted
      on the captured fetch body
- [X] Request **omits** `dimensions` for `ada-002` (EMB-01 negative case) — asserted on the body
- [X] A wrong-length returned vector throws `EmbeddingResponseError` naming **both** configured and
      actual dimension, and nothing is returned for storage (EMB-03, EMB-04)
- [X] An empty vector and a malformed (non-array / non-numeric) vector each throw (EMB-04)
- [X] Fewer embeddings returned than inputs is an **error**, not a positional shift (spec Edge Cases)
- [X] Out-of-order response data is re-sorted by `data[].index` before use — asserted with a
      deliberately shuffled fixture (spec Edge Cases)
- [X] Empty/whitespace-only input is handled deterministically and never sent as `''` to OpenAI,
      which rejects it (spec Edge Cases; `spec.md:137`)
- [X] Configured `prefixes.document` / `prefixes.query` applied to the matching task type (EMB-07) —
      asserted on the request body for both task types
- [X] Retryable (429 / 5xx) vs non-retryable (400 / 401) failures are classified differently, and a
      non-retryable failure does **not** consume retry attempts (INP-08)
- [X] Gate check passes: `pnpm --filter @ia-framework/embedding test`
- [X] Test count: ≥14 tests pass (no silent deletions)

**Tests**: unit
**Gate**: quick

**Commit**: `feat(embedding): enforce embedding contract in OpenAI provider`

---

### T10: Apply and validate the contract in the Ollama provider

**What**: Send `truncate: false` and `dimensions`, add the missing response-length check, and apply
prefixes — Ollama currently returns raw provider output with no validation at all.
**Where**: `packages/embedding/src/providers/ollama.ts` (modify),
`packages/embedding/src/providers/ollama.test.ts` (new)
**Depends on**: T8
**Reuses**: `applyPrefix` at `packages/embedding/src/providers/ollama.ts:28-32`; `formatOllamaError` /
`categorizeOllamaError` at `packages/indexer/src/errors/ollama-errors.ts:8-122` — its `phase` field
already includes `'embedding'` yet no embedding code uses it (`design.md:238`), so wire it up;
`/api/show` native-dimension discovery already used at `packages/embedding/src/factory.ts:68`.
**Requirement**: EMB-01, EMB-03, EMB-04, EMB-05, EMB-07, FAIL-01, A-02

**Tools**:

- MCP: `context7` (`/ollama/ollama`) — confirm `truncate`/`dimensions` on `POST /api/embed` and the `/api/show` fields
- Skill: NONE

**Done when**:

- [X] Failing test written first, then implementation
- [X] Request body **always** includes `truncate: false` (EMB-05, A-02) — asserted on the captured body
- [X] Request body includes `dimensions` when configured (EMB-01)
- [X] Response **length is checked** against the input count — Ollama has no `index` field, so a
      short response is an error rather than a silent positional shift (`design.md:302-303`)
- [X] Each returned vector's length is validated against the configured dimension; a mismatch throws
      `EmbeddingResponseError` naming both dimensions (EMB-03, EMB-04)
- [X] Configured `prefixes` applied per task type, asserted on the request body — Ollama applies no
      prefix of its own, so this is entirely client-side (`spec.md:145`)
- [X] An oversized input now surfaces as a loud failure instead of a silently truncated vector —
      asserted by a test proving `truncate: false` is what makes this observable (A-02)
- [X] Provider errors are formatted through `formatOllamaError` with `phase: 'embedding'`, and the
      message carries a `Suggestion:` line (FAIL-01)
- [X] Gate check passes: `pnpm --filter @ia-framework/embedding test`
- [X] Test count: ≥12 tests pass (no silent deletions)

**Tests**: unit
**Gate**: quick

**Commit**: `feat(embedding): enforce embedding contract and disable truncation in Ollama provider`

---

### T11: Extract the shared `applyPrefix` helper

**What**: Collapse the verbatim-duplicated prefix helper into one shared implementation.
**Where**: `packages/embedding/src/prefix.ts` (new), `packages/embedding/src/prefix.test.ts` (new),
`packages/embedding/src/providers/openai.ts` (modify, remove lines 32-36),
`packages/embedding/src/providers/ollama.ts` (modify, remove lines 28-32)
**Depends on**: T9, T10
**Reuses**: The two identical existing implementations — one becomes the shared helper, both call sites
import it (`design.md:299-300`).
**Requirement**: EMB-07

**Tools**:

- MCP: NONE — this repo is not self-indexed (see note above)
- Skill: NONE

**Done when**:

- [X] Failing test written first, then implementation
- [X] `applyPrefix(text, taskType, prefixes?): string` exists once and is imported by both providers
- [X] Absent `prefixes` returns the text unchanged (no phantom prefix)
- [X] `document` and `query` task types select their matching prefix — asserted for both
- [X] An already-prefixed string is not double-prefixed, or the behavior is explicitly asserted as
      documented (whichever the ported implementation does — the test pins it either way)
- [X] Zero remaining duplicate definitions: `rg -c 'function applyPrefix' packages/embedding/src`
      reports exactly 1
- [X] Gate check passes: `pnpm --filter @ia-framework/embedding test`
- [X] Test count: ≥5 tests pass (no silent deletions)

**Tests**: unit
**Gate**: quick

**Commit**: `refactor(embedding): extract shared applyPrefix helper`

---

### T12: Create `ContractStore` reserved-point persistence

**What**: Persist and read the embedding contract as a reserved point **inside** the collection at a
fixed deterministic id, so it cannot desync from the vectors it describes.
**Where**: `packages/vector-store/src/contract-store.ts` (new),
`packages/vector-store/src/contract-store.test.ts` (new)
**Depends on**: T5, T7
**Reuses**: `toQdrantId` hashing convention at `packages/vector-store/src/qdrant.ts:13-22`; the
`vi.mock('@qdrant/js-client-rest', ...)` mock-client pattern established at
`packages/vector-store/src/qdrant.test.ts:5-26`.
**Requirement**: EMB-08, EMB-09, BUD-14, A-13, A-27, AD-002

**Tools**:

- MCP: `context7` (`/qdrant/qdrant-js`) — confirm `retrieve`/`upsert` semantics for the reserved point
- Skill: NONE

**Done when**:

- [X] Failing test written first, then implementation
- [X] `writeContract(c, generation)` upserts at a **fixed deterministic UUID** with payload
      `{ kind: '__ia_contract__', provider, model, dimension, prefixes, tokenizerVersion, sparseHashVersion, indexGeneration, writtenAt }` (EMB-08)
- [X] `readContract()` returns the stored contract via `client.retrieve({ ids: [ID] })`, or the
      literal `'unknown'` when the point is absent (A-27)
- [X] `assertSearchable(active)` throws `EmbeddingContractMismatchError` on a field mismatch, naming
      **both** contracts and the `ia index --force` remediation (EMB-09)
- [X] `assertSearchable` throws `UnknownContractError` when `readContract()` returns `'unknown'`,
      naming the collection and `ia index --force` (A-27)
- [X] `assertSearchable` returns without throwing on an exact match
- [X] A prefix-pair-only difference **still refuses** — the silent-asymmetry case A-13 exists to
      remove (dedicated test)
- [X] A `tokenizerVersion` or `sparseHashVersion` difference **also refuses**, so a tokenizer change
      cannot silently mis-match a stale collection (design risk `:885`)
- [X] Gate check passes: `pnpm --filter @ia-framework/vector-store test`
- [X] Test count: ≥10 tests pass (no silent deletions)

**Tests**: integration
**Gate**: full

**Commit**: `feat(vector-store): persist embedding contract as reserved collection point`

---

### T13: Add centralized `baseFilter()` excluding reserved points

**What**: One helper that every search, scroll, and count path composes, so the reserved contract
point can never surface as a result.
**Where**: `packages/vector-store/src/base-filter.ts` (new),
`packages/vector-store/src/base-filter.test.ts` (new),
`packages/vector-store/src/qdrant.ts` (modify — every filter-building site)
**Depends on**: T12
**Reuses**: The existing filter-construction sites in `packages/vector-store/src/qdrant.ts`.
**Requirement**: EMB-08, AD-002 (consequence clause), FLT-13

**Tools**:

- MCP: NONE — this repo is not self-indexed (see note above)
- Skill: NONE

**Done when**:

- [X] Failing test written first, then implementation
- [X] `baseFilter(userFilter?)` returns a Qdrant filter always containing
      `must_not: [{ key: 'kind', match: { value: '__ia_contract__' } }]`
- [X] Composing a user filter preserves every user clause **and** the exclusion — asserted on the
      merged structure, not just presence
- [X] Every existing filter-building call site in `qdrant.ts` routes through `baseFilter` —
      asserted by a test that seeds a reserved point into the mock and confirms **no** public store
      method returns it (`search`, `searchHybrid`, `scroll`, `count`)
- [X] A test asserts the reserved point is excluded even when the caller passes **no** filter at all
      (the forgetting case the centralization exists to prevent — design risk `:891`)
- [X] Gate check passes: `pnpm --filter ...@ia-framework/vector-store test`
- [X] Test count: ≥6 tests pass (no silent deletions)

**Tests**: integration
**Gate**: full

**Commit**: `feat(vector-store): centralize reserved-point exclusion in base filter`

---

### T14: Harden `initialize()` — non-destructive, fail-closed, index-reconciling

**What**: Stop deleting the collection on dimension mismatch, fail closed on unreadable schema, and
reconcile payload indexes on **every** initialize including the no-op path.
**Where**: `packages/vector-store/src/qdrant.ts` (modify, lines 198-248),
`packages/vector-store/src/qdrant.test.ts` (modify — including adding `createPayloadIndex` to the mock client)
**Depends on**: T12, T13
**Reuses**: The `[OLD_SCHEMA]` guard at `packages/vector-store/src/qdrant.ts:198-208` as the template
posture — sentinel-prefixed, actionable, names the remediation flag. Upgrade both branches to typed
errors from T7.
**Requirement**: EMB-08, EMB-10, EMB-11, FLT-08, FLT-09, A-14, A-27

**Tools**:

- MCP: NONE — this repo is not self-indexed (see note above)
- Skill: NONE

**Done when**:

- [X] Failing test written first, then implementation
- [X] **`createPayloadIndex` added to the mock client** at `packages/vector-store/src/qdrant.test.ts` —
      the bare `catch {}` at `qdrant.ts:245-247` is currently *load-bearing for the test suite*
      (design risk `:890`), so the mock must gain the method **in this task** or removing the swallow
      breaks green tests
- [X] Collection absent → create + `writeContract` + create payload indexes (asserted in order)
- [X] Old schema (`text`/`code` vectors) → unchanged `[OLD_SCHEMA]` error unless `force`
- [X] Declared sizes **mismatch**, no `force` → throws `CollectionSchemaError` and
      **`deleteCollection` is never called** (EMB-10, A-14) — asserted on the mock
- [X] Declared sizes **unreadable** (`undefined` / `{}` vectors) → treated as a **mismatch**, throws,
      fail-closed (EMB-11) — today `undefined` short-circuits to "no mismatch" and silently no-ops
- [X] Sizes match and contract matches → no-op **but payload indexes are still reconciled**, because
      today the method returns at `:221` before the index loop so existing collections never get
      missing indexes (FLT-09, design risk `:889`)
- [X] A payload-index creation **failure** throws/reports `PayloadIndexError` naming the field
      (FLT-08); a **success** is silent (A-27)
- [X] Payload index addition requires no destructive re-index — asserted by reconciling on an
      existing populated collection with `upsert`/`delete` never called (FLT-09)
- [X] Gate check passes: build stage passed; vector-store tests/typecheck passed. Workspace typecheck
      remains blocked only by the approved untouched strict-index errors in `packages/core` and
      `packages/ast-parser`; independent `pnpm lint` reports unrelated pre-existing core/dashboard
      lint findings; independent `pnpm test` passed. The chained command is not claimed as fully passed.
- [X] Test count: existing 16 `qdrant.test.ts` tests preserved + ≥8 new tests (no silent deletions)

**Tests**: integration
**Gate**: build

**Commit**: `fix(vector-store)!: make initialize non-destructive, fail-closed, and index-reconciling`

---
### Phase 3 — WS4 input safety + AP-4 AST line offsets

---

### T15: Add doc-comment and annotation start lines to `CodeChunk`

**What**: Extend the AST chunk type with the line offsets A-28's expanded range needs, computed once
where the AST already exists.
**Where**: `packages/ast-parser/src/types.ts` (modify, lines 36-38),
`packages/ast-parser/src/types.test.ts` (modify)
**Depends on**: None
**Reuses**: `bodyStartRow` already computed as a local variable inside the Java parser at
`packages/ast-parser/src/parsers/java.ts:362-367` and in `packages/ast-parser/src/splitter.ts:14,21-33` —
proof the AST carries the information; it is simply never persisted (design F4, `design.md:74-80`).
**Requirement**: CTX-03, A-28, TD-05

**Tools**:

- MCP: NONE — this repo is not self-indexed (see note above)
- Skill: NONE

**Done when**:

- [X] Runtime test is not applicable: this task is explicitly type-only (`Tests: none`); the
      existing compile-time `CodeChunk` construction remains the compatibility proof.
- [X] `CodeChunk` declares `docCommentStartLine?: number` and `annotationStartLine?: number`
- [X] Both are **optional** so existing constructions still typecheck (additive change)
- [X] A type-level compatibility check remains covered by the `CodeChunk` construction in
      `packages/ast-parser/src/types.test.ts:41-53`; no runtime test was added per this task's
      explicit `Tests: none` definition.
- [X] Task-owned AST-parser typecheck is clean; workspace typecheck retains the approved untouched
      strict-index baseline in `packages/core/src/config/registry.test.ts`,
      `packages/core/src/graph/cross-repo-edges.test.ts`, and
      `packages/ast-parser/src/parsers/{proto,sql,xml,yaml}.test.ts`.
- [X] Gate check passes: build stage passed; AST-parser build and 160 tests passed. The chained
      workspace gate stopped at the approved typecheck baseline above; independent AST-parser
      lint reproduces unrelated pre-existing findings in `java.test.ts`, `xml.ts`, and `splitter.ts`.
- [X] Runtime test count unchanged at 160 AST-parser tests; no tests were added, deleted, weakened,
      or skipped because this task is explicitly type-only.

**Tests**: none (type-only declaration — matrix says "none" for type declarations; the behavior that
consumes these fields is tested in T16 where the parsers populate them)
**Gate**: build

**Commit**: `feat(ast-parser): add doc-comment and annotation start lines to CodeChunk`

---

### T16: Populate the new line offsets in the Java and TypeScript parsers

**What**: Make the two parsers that produce annotated/documented constructs emit
`docCommentStartLine` and `annotationStartLine`.
**Where**: `packages/ast-parser/src/parsers/java.ts` (modify),
`packages/ast-parser/src/parsers/java.test.ts` (modify),
`packages/ast-parser/src/parsers/typescript.ts` (modify),
`packages/ast-parser/src/parsers/typescript.test.ts` (modify)
**Depends on**: T15
**Reuses**: The existing `bodyStartRow` computation at `packages/ast-parser/src/parsers/java.ts:362-367`
and the tree-sitter node walk already in place in both parsers.
**Requirement**: CTX-03, A-28, TD-05

**Tools**:

- MCP: NONE — this repo is not self-indexed (see note above)
- Skill: NONE

**Done when**:

- [X] Failing tests were written first, then implementation
- [X] Java: a method with a Javadoc block sets `docCommentStartLine` to the `/**` line — asserted on
      a real fixture with the exact expected number
- [X] Java: a method with `@Transactional` sets `annotationStartLine` to the annotation line —
      asserted with the exact number (the `@Transactional` case A-28 cites as behavior-changing)
- [X] Java: a method with **both** Javadoc and annotations sets both, and the doc comment line is the
      smaller of the two
- [X] Java: a bare method with neither leaves **both `undefined`** (not `0`, not `startLine`) so the
      assembler can distinguish "absent" from "same as start"
- [X] TypeScript: JSDoc and decorator equivalents each have the same four assertions
- [X] Every other parser (`proto`, `sql`, `xml`, `yaml`) is untouched and its existing tests stay green
- [X] Gate check passes: `pnpm --filter @ia-framework/ast-parser test`
- [X] Test count: 10 new tests pass; existing parser test count was preserved (160 → 170 total),
      with no tests deleted, weakened, or skipped.

**Tests**: unit
**Gate**: quick

**Commit**: `feat(ast-parser): populate doc-comment and annotation start lines in java and typescript parsers`

---

### T17: Add the new payload fields and close the decode gaps

**What**: Persist the additive payload fields and make `toChunkPayload` decode the four fields that
are currently write-only.
**Where**: `packages/vector-store/src/interface.ts` (modify — `ChunkPayload`),
`packages/vector-store/src/qdrant.ts` (modify — `toChunkPayload` at lines 28-159),
`packages/vector-store/src/qdrant.test.ts` (modify)
**Depends on**: T15
**Reuses**: The existing 43-field decode in `toChunkPayload`; the write sites at
`packages/indexer/src/pipeline.ts:342-343,348-349,355`.
**Requirement**: FLT-11, FLT-12, FLT-13, A-28, A-29

**Tools**:

- MCP: NONE — this repo is not self-indexed (see note above)
- Skill: NONE

**Done when**:

- [X] Failing tests were written first, then implementation
- [X] `ChunkPayload` gains `docCommentStartLine?`, `annotationStartLine?`, `signatureOnly?`,
      `tokenizerVersion?` (all optional/additive)
- [X] `toChunkPayload` now decodes the four previously write-only fields — `annotationMeta`,
      `chunkIndex`, `totalChunks`, `calledBy` (FLT-11)
- [X] **Property test over the declared field list**: for every field name in the payload contract,
      a round-trip write→decode preserves the value. This is the test that makes a future write-only
      field impossible to add silently (`design.md:436-437`)
- [X] A test asserts `chunkIndex` decodes to its real value rather than the constant `undefined → ?? 0`
      that silently disabled adjacent-chunk ordering (FLT-12 precondition)
- [X] A test asserts **no raw code content** field is present in the written payload, preserving the
      lean-payload constraint (FLT-13)
- [X] Gate check passes: `pnpm --filter ...@ia-framework/vector-store test` — 7 dependent
      packages passed: vector-store 52, retrieval 206, indexer 216, benchmark 86, dashboard-api
      92, cli 76, and mcp-server 254 tests; 0 failed and one pre-existing indexer test remains
      skipped. Changed vector-store typecheck is clean; dependent typecheck retains unrelated
      pre-existing CLI benchmark strict-index errors.
- [X] Test count: 8 new tests pass; existing dependent test counts were preserved with no tests
      deleted, weakened, or skipped.

**Tests**: integration
**Gate**: full

**Commit**: `fix(vector-store): decode all declared payload fields and add A-28/A-29 fields`

---

### T18: Create `InputBudgeter` for provider-limit-aware batch packing

**What**: Refuse or repack **before** the request, per model limits — replacing the fixed batch size
of 50.
**Where**: `packages/indexer/src/embedding/input-budgeter.ts` (new),
`packages/indexer/src/embedding/input-budgeter.test.ts` (new)
**Depends on**: T3, T4
**Reuses**: `TokenEstimator` from T3 and `capabilitiesFor` from T4. Note the pre-existing
`estimateTokens` on the provider interface is implemented twice and **never called in production**
(`design.md:450`) — this task is what finally makes size estimation load-bearing.
**Requirement**: INP-01, INP-02, INP-03

**Tools**:

- MCP: NONE — this repo is not self-indexed (see note above)
- Skill: NONE

**Done when**:

- [X] Failing tests were written first, then implementation
- [X] `packBatches(inputs, caps): Batch[]` respects `maxBatchItems` — a 3000-input run against
      OpenAI's 2048 limit produces batches each ≤2048 (INP-02)
- [X] Respects `maxRequestTokens` — a batch whose **total** exceeds 300 000 is **repacked into
      smaller batches, not rejected** (INP-02 + spec Edge Cases "batch's total size exceeds the
      provider request limit but no individual input does")
- [X] Flags any single input exceeding `maxInputTokens` for the oversized handler rather than sending
      it (INP-01)
- [X] Sizing uses the conservative `TokenEstimator`, **never** source line count (INP-03) — asserted
      by a fixture with few lines but very long lines that must still be flagged
- [X] Packing is deterministic: identical input yields identical batch boundaries across two calls
- [X] No batch is ever empty, and every input appears in exactly one batch or the oversized list
      (conservation property test)
- [X] Gate check passes: `pnpm --filter @ia-framework/indexer test` — 20 files passed with 226
      tests passed, 1 pre-existing test skipped, 0 failed; indexer build and typecheck also pass.
- [X] Test count: 10 new tests pass; existing indexer tests were preserved with no tests deleted,
      weakened, or skipped.

**Tests**: unit
**Gate**: quick

**Commit**: `feat(indexer): add provider-limit-aware input budgeter`

---

### T19: Create `OversizedInputHandler` with the deterministic three-step ladder

**What**: Split at AST boundaries; if still oversized, fall back to signature-only; if neither, raise
an actionable error. Never a silent drop.
**Where**: `packages/indexer/src/embedding/oversized-input-handler.ts` (new),
`packages/indexer/src/embedding/oversized-input-handler.test.ts` (new),
`packages/ast-parser/src/splitter.ts` (modify — extend `splitOversizedChunks` at lines 294-321),
`packages/ast-parser/src/splitter.test.ts` (modify)
**Depends on**: T16, T18
**Reuses**: `splitOversizedChunks` at `packages/ast-parser/src/splitter.ts:294-321` — **extend, do not
replace**; its `$partN` identity/parent preservation at `:76-92` already satisfies INP-07. Note
`:310-312` deliberately never splits a `function`/`method` chunk, which is precisely why the
signature-only fallback is reachable in practice (design F5, `design.md:81-86`).
**Requirement**: INP-04, INP-05, INP-06, INP-07, A-19, A-29, TD-07

**Tools**:

- MCP: NONE — this repo is not self-indexed (see note above)
- Skill: NONE

**Done when**:

- [X] Failing tests were written first, then implementation
- [X] Step 1 — an oversized **class** splits at AST/semantic boundaries (INP-04); the split never
      lands mid-body
- [X] Step 1 preserves for every part: chunk identity (`$partN`), source line ranges, signature,
      parent name, and repository metadata (INP-07) — one assertion per preserved field
- [X] Step 2 — an oversized **single method** (the F5 class that never splits) falls back to
      **signature + doc comment only**, persists the **full true line range** (not the reduced one),
      and sets `signatureOnly: true` (A-29, TD-07) — all three asserted
- [X] Step 3 — an input that can be neither split nor signature-reduced throws `OversizedInputError`
      naming the chunk's repo, path, symbol, and lines (INP-06)
- [X] **Text truncation never occurs** — an explicit test asserts no returned input's text is a
      prefix-truncation of the original (the A-02 corruption class TD-07 rejects)
- [X] Handling is deterministic: the same oversized input twice yields deeply-equal output (INP-05)
- [X] **Zero silent drops** — a conservation test asserts every input maps to split parts, a
      signature-only chunk, or a raised error (INP-06)
- [X] Gate check passes: `pnpm --filter ...@ia-framework/ast-parser test` — 6 dependent packages
      passed: AST-parser 175, indexer 234, mcp-server 254, cli 76, and dashboard-api 92 tests
      plus their dependency coverage; 0 failed and one pre-existing indexer test remains skipped.
      Indexer typecheck and AST-parser build passed; AST-parser typecheck retains only the approved
      untouched proto/sql/xml/yaml strict-index baseline.
- [X] Test count: 13 new tests pass (8 handler + 5 splitter); existing tests were preserved with
      no tests deleted, weakened, or skipped.

**Tests**: unit
**Gate**: full

**Commit**: `feat(indexer): add deterministic oversized-input ladder with signature-only fallback`

---

### T20: Wire per-input failure isolation into the indexing pipeline

**What**: Replace fixed-50 batching with `InputBudgeter`, route oversized inputs through the handler,
and stop discarding a whole batch of 50 when one input fails.
**Where**: `packages/indexer/src/pipeline.ts` (modify, lines 657-661, 694-701, 725-726, 768-769),
`packages/indexer/src/embedder.ts` (modify — delete `tokenize`/`hashToken` at lines 56-85, remove the
`?? []` fallback at lines 148-149),
`packages/indexer/src/__tests__/pipeline-embedding-errors.test.ts` (modify),
`packages/indexer/src/embedder.test.ts` (modify)
**Depends on**: T1, T2, T8, T18, T19
**Reuses**: `buildSparseVector` from T2 replaces `embedder.ts:56-85`; `EmbedBatchOutcome` from T8
provides the per-input granularity; `packages/indexer/src/errors/ollama-errors.ts` for messages.
**Requirement**: EMB-03, EMB-06, INP-08, INP-09, INP-10, SPR-10, A-20

**Tools**:

- MCP: NONE — map pipeline callers with `Grep` before editing
- Skill: NONE

**Done when**:

- [X] Failing test written first, then implementation
- [X] Fixed `embeddingBatchSize = 50` slicing at `pipeline.ts:657-661` and `:725-726` replaced by
      `packBatches`
- [X] `embedder.ts`'s local `tokenize`/`hashToken` **deleted**; sparse vectors now come from the
      shared `core` builder, so index and query hash spaces coincide (design F1) — asserted by a test
      that builds the same term via both call sites and compares indices
- [X] The `?? []` fallback at `embedder.ts:148-149` **removed** — a short provider response is now an
      error rather than zero-length vectors upserted unchecked (design risk `:893`)
- [X] Every vector is dimension-validated **before** upsert (EMB-03)
- [X] One failing input no longer discards its siblings: a batch where input 3 of 10 fails still
      upserts the other 9 (EMB-06, INP-09) — asserted on the upsert call payload
- [X] Retryable vs non-retryable failures behave differently, and a non-retryable failure does not
      burn retries (INP-08)
- [X] Cancellation mid-run stops **before upsert**, so no point is written whose recorded contract
      disagrees with its vector (INP-10, spec Edge Cases) — asserted by cancelling between embed and
      upsert and confirming `upsert` was not called
- [X] The context-source failure path at `pipeline.ts:768-769` no longer drops all remaining chunks
      unaccounted
- [X] Gate check passes: `pnpm --filter ...@ia-framework/indexer test`
- [X] Test count: existing pipeline/embedder test counts preserved + ≥12 new tests (no silent deletions)

**Tests**: unit
**Gate**: full

**Commit**: `fix(indexer): isolate per-input embedding failures and unify sparse hashing`

---

### T21: Report skipped and signature-only chunks in the run summary and exit non-zero

**What**: Give the run summary per-chunk identity for every skip, count signature-only chunks, and
make the CLI exit non-zero when anything was skipped.
**Where**: `packages/indexer/src/pipeline.ts` (modify — `IndexRunSummary` at lines 867-871),
`packages/indexer/src/pipeline-completeness.test.ts` (modify),
`packages/cli/src/commands/index.command.ts` (modify, lines 625-633),
`packages/cli/src/commands/index.command.test.ts` (new)
**Depends on**: T19, T20
**Reuses**: The existing summary shape at `packages/indexer/src/pipeline.ts:867-871` (today only a
**count** survives, with no identity); the existing warn-then-succeed path at
`packages/cli/src/commands/index.command.ts:625-633`.
**Requirement**: INP-11, FAIL-08, A-29

**Tools**:

- MCP: NONE — this repo is not self-indexed (see note above)
- Skill: NONE

**Done when**:

- [X] Failing tests written first, then implementation
- [X] `IndexRunSummary` gains `skipped: Array<{ repoId, relativePath, name, startLine, endLine, reason }>` —
      enough identity to re-index each one (INP-11)
- [X] Summary gains a `signatureOnly` count **and** identity list (A-29)
- [X] **Every** skip reason routes into the list — tests cover preparation, packing, cancellation,
      provider, validation, upsert, context-source, and concept skip paths; no skip path produces a
      count without a matching identity record (INP-11)
- [X] `packages/cli/src/commands/index.command.ts` **exits non-zero** when `skipped.length > 0`
      (A-29) — asserted on the process exit code, replacing today's warn-then-succeed fall-through
- [X] A clean run with zero skips still exits **0**
- [X] The CLI renders each skipped chunk's identity to output so an operator can re-index without
      reading logs — asserted by substring on the captured output
- [X] Signature-only chunks are reported at index time with count + identity (A-29)
- [X] Gate check passes: `pnpm build && pnpm typecheck && pnpm lint && pnpm test` — build and test
      stages passed; typecheck/lint stop at the approved pre-existing failures in untouched
      `packages/core/src/config/registry.test.ts`, `packages/core/src/graph/cross-repo-edges.test.ts`,
      `packages/ast-parser/src/parsers/{proto,sql,xml,yaml}.test.ts`, and
      `packages/cli/src/commands/benchmark.command.ts`; lint also reproduces prior failures outside
      T21. Changed indexer/CLI package typechecks and tests pass; no baseline files were modified.
- [X] Test count: 10 new tests pass; existing tests were preserved with no tests deleted, weakened,
      or skipped.

**Tests**: unit
**Gate**: build

**Commit**: `feat(indexer,cli): report skipped chunk identity and exit non-zero on skips`

---
### Phase 4 — WS2 sparse retrieval

---

### T22: Add `searchSparse` and `capabilities()` to the `VectorStore` interface

**What**: Declare the missing sparse capability on the contract that today has 10 methods and none
sparse.
**Where**: `packages/vector-store/src/interface.ts` (modify, lines 207-281),
`packages/vector-store/src/index.ts` (modify — export the new types)
**Depends on**: T2
**Reuses**: The existing `SearchOptions`/`SearchResult` shapes in the same file; `SparseVector` from
T2.
**Requirement**: SPR-01, SPR-03, A-04

**Tools**:

- MCP: NONE — this repo is not self-indexed (see note above)
- Skill: NONE

**Done when**:

- [X] `VectorStore` declares `searchSparse(v: SparseVector, o: SparseSearchOptions): Promise<SearchResult[]>`
- [X] `VectorStore` declares `capabilities(): StoreCapabilities` returning
      `{ sparse: boolean; filterOnly: boolean; payloadIndexes: string[] }` (A-04)
- [X] `SparseSearchOptions` carries repo filter, metadata filters, and limit as **required** where the
      spec requires them (SPR-03)
- [X] `pnpm typecheck` fails informatively until `QdrantVectorStore` implements both (intentional —
      T23 resolves it)
- [X] Gate check passes: `pnpm build && pnpm typecheck && pnpm lint && pnpm test` — interface
      declaration is complete; the expected Qdrant implementation tripwire stops build/typecheck
      until T23, while existing vector-store tests pass.

**Tests**: none (interface-only declaration — matrix says "none" for type declarations; behavior is
tested in T23 where the production adapter implements it)
**Gate**: build

**Commit**: `feat(vector-store): declare sparse search and store capabilities on VectorStore`

---

### T23: Implement `searchSparse` in the Qdrant adapter

**What**: The missing production method — a real named-sparse-vector query with filters, limit, and
deterministic ordering.
**Where**: `packages/vector-store/src/qdrant.ts` (modify),
`packages/vector-store/src/qdrant.test.ts` (modify)
**Depends on**: T13, T22
**Reuses**: `baseFilter()` from T13; the `NamedSparseVector` query shape verified against
`/qdrant/qdrant-js` (`spec.md:150`, `design.md:102-110`).
**Requirement**: SPR-01, SPR-03, SPR-04, SPR-05, SPR-06

**Tools**:

- MCP: `context7` (`/qdrant/qdrant-js`) — confirm the `NamedSparseVector` query shape
- Skill: NONE

**Done when**:

- [X] Failing test written first, then implementation
- [X] `searchSparse` issues a **named sparse** vector query against the collection's `sparse` vector —
      asserted on the captured client call, including the `{ name, vector: { indices, values } }` shape
- [X] Applies the repository filter, all metadata filters, **and** the requested limit (SPR-03) —
      one assertion per element
- [X] Composes `baseFilter()` so the reserved contract point can never be returned
- [X] Ordering is deterministic for identical input — same query twice yields the same result order
      (SPR-04)
- [X] Each result carries provenance identifying the **sparse** branch (SPR-04) — asserted on
      `vectorName`, not assumed
- [X] Zero matches returns `[]`, distinguishable from a thrown failure (SPR-05) — asserted by
      contrasting an empty-result test with an error test
- [X] `capabilities()` returns `sparse: true` for the Qdrant adapter (SPR-06)
- [X] Gate check passes: `pnpm --filter ...@ia-framework/vector-store test` — 7 dependent packages
      passed: vector-store 62, retrieval 206, indexer 254, benchmark 86, dashboard-api 92, CLI 78,
      and MCP-server 254 tests; 0 failed and one pre-existing indexer test remains skipped.
- [X] Test count: 10 new tests pass; existing tests were preserved with no tests deleted, weakened,
      or skipped.

**Tests**: integration
**Gate**: full

**Commit**: `feat(vector-store): implement named sparse search in Qdrant adapter`

---

### T24: Fix `searchHybrid` — second dense vector and real branch provenance

**What**: Give the signature prefetch its own vector and stop hard-coding `vectorName: 'semantic'` on
every hit.
**Where**: `packages/vector-store/src/qdrant.ts` (modify, lines 337-352 and 368),
`packages/vector-store/src/qdrant.test.ts` (modify)
**Depends on**: T23
**Reuses**: The existing RRF prefetch structure at `packages/vector-store/src/qdrant.ts:337-352`;
fusion enum `"rrf" | "dbsf"` verified in `design.md:103`.
**Requirement**: SPR-07, QP-08

**Tools**:

- MCP: `context7` (`/qdrant/qdrant-js`) — confirm `Prefetch` / `RrfQuery` / fusion enum shape
- Skill: NONE

**Done when**:

- [X] Failing test written first, then implementation
- [X] Options accept `{ semanticVector, signatureVector, sparseVector }` — three distinct inputs
- [X] The `signature` prefetch uses `signatureVector`, **not** `denseVector` — asserted by passing two
      different vectors and confirming the captured prefetch bodies differ (design F3, `design.md:66-72`)
- [X] The `sparse` prefetch is included when a sparse vector is supplied, using Qdrant-supported
      `fusion: 'rrf'` (SPR-07)
- [X] Each returned result's `vectorName` reflects the branch that actually produced it — asserted by
      a fixture where the three branches return distinguishable ids, replacing the hard-coded
      `'semantic'` at `qdrant.ts:368` (SPR-07)
- [X] A sparse vector that is **absent** omits the sparse prefetch entirely rather than sending an
      empty one
- [X] Gate check passes: `pnpm --filter ...@ia-framework/vector-store test` — 7 dependent packages
      passed: vector-store 68, retrieval 206, indexer 254, benchmark 86, dashboard-api 92, CLI 78,
      and MCP-server 254 tests; 0 failed and one pre-existing indexer test remains skipped.
- [X] Test count: 8 new tests pass; existing hybrid tests were preserved with no tests deleted,
      weakened, or skipped.

**Tests**: integration
**Gate**: full

**Commit**: `fix(vector-store): give hybrid search a real signature vector and branch provenance`

---

### T25: Repoint the BM25 reranker at the canonical tokenizer

**What**: Delete the reranker's local tokenizer and import the `core` one, so sparse and lexical
reranking provably agree.
**Where**: `packages/retrieval/src/bm25-reranker.ts` (modify, remove lines 32-41),
`packages/retrieval/src/__tests__/bm25-reranker.test.ts` (modify)
**Depends on**: T1
**Reuses**: This file's own tokenizer was the source promoted to `core` in T1 — now it imports it back
(`design.md:229`).
**Requirement**: SPR-09, A-16, AD-003

**Tools**:

- MCP: NONE — this repo is not self-indexed (see note above)
- Skill: NONE

**Done when**:

- [X] Failing test written first, then implementation
- [X] Local `function tokenize` **deleted**; `tokenize` imported from `@ia-framework/core`
- [X] Existing BM25 ranking tests stay green (behavior preserved or the change is asserted as
      intentional with the new expectation written down)
- [X] **Agreement test**: `getUserById` produces an identical term list from the reranker's path and
      from `buildSparseVector`'s path — the exact assertion named in the spec's Success Criteria
      (`spec.md:929-930`, SPR-09)
- [X] Agreement asserted for the full identifier corpus: camelCase, PascalCase, dot-notation, package,
      path fragment, annotation, and quoted term (SPR-08)
- [X] `rg -c 'function tokenize' packages/retrieval/src packages/indexer/src` reports **0** — all three
      divergent tokenizers are gone (A-16)
- [X] Gate check passes: `pnpm --filter ...@ia-framework/retrieval test` — 6 dependent packages
      passed: retrieval 214, indexer 254, benchmark 86, dashboard-api 92, CLI 78, and MCP-server
      254 tests; 0 failed and one pre-existing indexer test remains skipped.
- [X] Test count: 8 new agreement tests pass; existing BM25 tests were preserved with no tests
      deleted, weakened, or skipped.

**Tests**: unit
**Gate**: full

**Commit**: `refactor(retrieval): use canonical core tokenizer in BM25 reranker`

---

### T26: Route keyword and symbol queries through real sparse retrieval

**What**: Replace the permanently-false capability guards with real `searchSparse` calls and delete
the local sparse-vector builder.
**Where**: `packages/retrieval/src/search-engine.ts` (modify, lines 311, 659-660, and delete
`computeTermFrequencySparseVector` at 958-1003),
`packages/retrieval/src/search-engine.test.ts` (modify)
**Depends on**: T2, T23, T25
**Reuses**: `buildSparseVector` from T2 replaces `search-engine.ts:958-1003`; the two consumer guards
at `:311` and `:660` are permanently false today because no sparse method existed (`design.md:95`).
**Requirement**: SPR-02, SPR-04, SPR-05, SPR-06, SPR-10

**Tools**:

- MCP: NONE — read the target ranges of `packages/retrieval/src/search-engine.ts` with `Read`
- Skill: NONE

**Done when**:

- [X] Failing test written first, then implementation
- [X] `computeTermFrequencySparseVector` **deleted**; the shared `core` builder is used instead
- [X] A query whose plan selects the sparse branch **and** whose adapter declares `sparse: true`
      executes `searchSparse` — asserted on the mock store call (SPR-02)
- [X] A `getUserById` query returns the exact method, proving the index/query hash spaces now
      coincide (spec Success Criteria)
- [X] An adapter reporting `capabilities().sparse === false` causes **no** sparse call and **no**
      sparse branch in the reported branches (SPR-06) — both asserted
- [X] An empty sparse vector (no surviving tokens) marks the branch **skipped**, never
      "executed with 0 results" (SPR-05, spec Edge Cases) — asserted on the reported branch list
- [X] Sparse results carry sparse-branch provenance through to `RetrievalResult` (SPR-04)
- [X] Gate check passes: `pnpm --filter ...@ia-framework/retrieval test` — 6 dependent packages
      passed: retrieval 217, indexer 254, benchmark 86, dashboard-api 92, CLI 78, and MCP-server
      254 tests; 0 failed and one pre-existing indexer test remains skipped.
- [X] Test count: 3 new tests pass; existing retrieval tests were preserved with no tests deleted,
      weakened, or skipped.

**Tests**: unit
**Gate**: full

**Commit**: `feat(retrieval): execute real sparse retrieval for keyword and symbol queries`

---

### T27: Bring the hybrid path to behavioral parity with the routed path

**What**: Apply test exclusion, diversity handling, and elbow truncation on the hybrid path, which
skips all three today.
**Where**: `packages/retrieval/src/search-engine.ts` (modify — `searchHybrid`),
`packages/retrieval/src/__tests__/search-engine-threshold.test.ts` (modify)
**Depends on**: T24, T26
**Reuses**: The routed path's existing test-exclusion, `mmr.ts` diversity, and
`elbow-detection.ts` truncation — same functions, now also called from `searchHybrid`
(`design.md:382-383`, A-22).
**Requirement**: SPR-11, A-22

**Tools**:

- MCP: NONE — this repo is not self-indexed (see note above)
- Skill: NONE

**Done when**:

- [X] Failing test written first, then implementation
- [X] Test exclusion applies on the hybrid path — a fixture containing a test-file chunk is excluded,
      asserted on hybrid output (today it is not)
- [X] Diversity (MMR) applies on the hybrid path and does **not** silently degrade to score sort under
      lean payloads — asserted with a lean-payload fixture (A-22)
- [X] Elbow truncation applies on the hybrid path — asserted with a score distribution that has a
      clear elbow
- [X] **Parity test**: the same query and fixture set through the routed path and the hybrid path
      produce the same exclusion, diversity, and truncation *decisions*, so behavior does not depend
      on which internal path served the query (SPR-11)
- [X] Gate check passes: `pnpm --filter ...@ia-framework/retrieval test` — 6 dependent packages
      passed: retrieval 220, indexer 254, benchmark 86, dashboard-api 92, CLI 78, and MCP-server
      254 tests; 0 failed and one pre-existing indexer test remains skipped.
- [X] Test count: 3 new tests pass; existing retrieval tests were preserved with no tests deleted,
      weakened, or skipped.

**Tests**: unit
**Gate**: full

**Commit**: `fix(retrieval): bring hybrid search to parity with routed path`

---

### Phase 5 — WS3 filter-only retrieval and expansion

---

### T28: Create `FilterOnlyRetriever` with cursor pagination and client-side ordering

**What**: The deterministic primitive that replaces all six zero-vector fakes, paging to exhaustion
and ordering client-side.
**Where**: `packages/vector-store/src/filter-only.ts` (new),
`packages/vector-store/src/filter-only.test.ts` (new)
**Depends on**: T13
**Reuses**: `baseFilter()` from T13; `scroll(collection, {...}) → { points, next_page_offset }` and
`retrieve(collection, { ids })` verified against `/qdrant/qdrant-js` (`design.md:101-103`). `order_by`
is deliberately **not** used — it disables pagination (design F2, `design.md:46-64`, TD-04).
**Requirement**: FLT-01, FLT-03, FLT-04, FLT-05, FLT-10, A-05, TD-04

**Tools**:

- MCP: `context7` (`/qdrant/qdrant-js`) — confirm `scroll` cursor pagination and that `order_by` disables it (F2/TD-04)
- Skill: NONE

**Done when**:

- [X] Failing test written first, then implementation
- [X] `scrollAll(filter, { ceiling })` pages on `next_page_offset` until it is `null` — asserted with
      a mock returning 3 pages, confirming **all** points are returned (FLT-03)
- [X] **No vector similarity query is ever issued** by any method — asserted by confirming the mock's
      `search` is never called (FLT-01)
- [X] Reaching the ceiling returns `truncated: true` and the partial set is **never** presented as
      complete (FLT-04) — asserted on the return value
- [X] The safety-ceiling constant is defined as a named export with a comment citing FLT-03/A-05 as
      its authority, and a test asserts its value (the constant `design.md:984` leaves to Tasks)
- [X] `retrieveByIds(ids)` uses `retrieve`, not `scroll`, for known-id lookups
- [X] `orderDeterministically(points)` sorts **client-side** by `(repoId, relativePath, startLine)` —
      asserted with a shuffled fixture including a cross-repo same-path collision and an
      undefined-`repoId` case, so the sort is total rather than partial (FLT-05)
- [X] A test documents why `order_by` is not used: it asserts `order_by` is absent from every captured
      `scroll` call, pinning TD-04 so a future "optimization" that forfeits pagination fails loudly
- [X] A scroll failure raises `FilterOnlyRetrievalError` and **never** falls back to similarity
      (FLT-10) — asserted by confirming `search` is not called on the error path
- [X] Zero matches returns an empty set without any similarity fallback (spec Edge Cases)
- [X] Gate check passes: `pnpm --filter ...@ia-framework/vector-store test` — 7 dependent packages
      passed: vector-store 80, retrieval 220, indexer 254, benchmark 86, dashboard-api 92, CLI 78,
      and MCP-server 254 tests; 0 failed and one pre-existing indexer test remains skipped.
- [X] Test count: 12 new tests pass; existing tests were preserved with no tests deleted, weakened,
      or skipped.

**Tests**: integration
**Gate**: full

**Commit**: `feat(vector-store): add filter-only retriever with cursor pagination`

---

### T29: Create `EffectiveFilter` as a required retrieval parameter

**What**: Make repo isolation and user filters structurally unforgeable — a required parameter the
compiler enforces, not boundary post-filtering.
**Where**: `packages/retrieval/src/effective-filter.ts` (new),
`packages/retrieval/src/effective-filter.test.ts` (new)
**Depends on**: T13
**Reuses**: The existing repo-filter construction in `packages/retrieval/src/search-engine.ts:803`
(`getFile` — today the **only** filter path that scopes by repo, `design.md:900`); `baseFilter()`
from T13 for the reserved exclusion.
**Requirement**: FLT-06, FLT-07, FAIL-03, A-15, AD-005, TD-14

**Tools**:

- MCP: NONE — this repo is not self-indexed (see note above)
- Skill: NONE

**Done when**:

- [X] Failing test written first, then implementation
- [X] `EffectiveFilter` = `{ repoId?, userFilters, excludeTests, reservedExclusion }`
- [X] `toQdrantFilter()` emits every component: repo clause, each user metadata filter
      (`stereotype`, `archLayer`, `module`, `language`), the test-exclusion clause, and the reserved
      `must_not` — one assertion per component (FLT-06, FLT-07)
- [X] A filter with `repoId` set produces a clause that a same-`relativePath`-different-repo point
      cannot satisfy — asserted structurally (A-15)
- [X] `excludeTests: false` omits the exclusion clause rather than emitting an always-true one
- [X] Composition is deterministic: identical inputs produce a deeply-equal filter object
- [X] A test asserts the type is **not** constructible with fields omitted — i.e. `userFilters` and
      `excludeTests` are required, so a caller cannot accidentally build an unscoped filter (TD-14)
- [X] Gate check passes: `pnpm --filter @ia-framework/retrieval test` — 13 files and 230 tests passed.
- [X] Test count: 10 new tests pass; no existing tests were deleted, weakened, or skipped.

**Tests**: unit
**Gate**: quick

**Commit**: `feat(retrieval): add EffectiveFilter as the required retrieval scope parameter`

---

### T30: Replace the file-chunk and adjacent-chunk zero-vector fakes

**What**: Convert two of the six fake filter queries to real filter-only retrieval, delete the dead
one, and fix adjacent ordering.
**Where**: `packages/retrieval/src/search-engine.ts` (modify: delete `fetchChunksForFiles` at 475-494;
convert `fetchChunksForRelativePaths` at 511 and `getAdjacentChunks` at 549),
`packages/retrieval/src/search-engine.test.ts` (modify)
**Depends on**: T17, T28, T29
**Reuses**: `FilterOnlyRetriever` from T28 and `EffectiveFilter` from T29. `fetchChunksForFiles` is
**dead code using the deprecated `filePath` key** — delete rather than port (`design.md:901`).
`chunkIndex` now decodes correctly thanks to T17, which is what makes FLT-12 achievable.
**Requirement**: FLT-01, FLT-02, FLT-05, FLT-06, FLT-07, FLT-12

**Tools**:

- MCP: NONE — this repo is not self-indexed (see note above)
- Skill: NONE

**Done when**:

- [X] Failing test written first, then implementation
- [X] `fetchChunksForFiles` **deleted** (dead code, deprecated `filePath` key) and no caller remains —
      asserted by `rg -c fetchChunksForFiles packages` reporting 0
- [X] `fetchChunksForRelativePaths` uses `scrollAll`, takes a **required** `EffectiveFilter`, and its
      `relativePaths.length * 50` heuristic limit is gone (FLT-01, FLT-06)
- [X] `getAdjacentChunks` uses filter-only retrieval with a required `EffectiveFilter`, replacing its
      `indices.length` heuristic
- [X] **Two-repo isolation test**: a collection with the same `relativePath` in two repos, queried
      scoped to one repo, returns only that repo's chunks — the spec's Independent Test for WS3
      (`spec.md:339-342`, FLT-06)
- [X] Results are returned in `startLine` order (FLT-05)
- [X] A file with **more chunks than one page** returns all of them (FLT-03 via T28, spec Edge Cases)
- [X] Adjacent ordering uses the **decoded** `chunkIndex` and a test proves it is no longer the
      constant `?? 0` (FLT-12) — asserted with chunks whose `chunkIndex` order differs from insertion order
- [X] Gate check passes: `pnpm --filter ...@ia-framework/retrieval test` — 6 dependent packages
      passed: retrieval 232, indexer 254, benchmark 86, dashboard-api 92, CLI 78, and MCP-server
      254 tests; 0 failed and one pre-existing indexer test remains skipped.
- [X] Test count: 2 new tests pass; existing retrieval tests were preserved with no tests deleted,
      weakened, or skipped.

**Tests**: unit
**Gate**: full

**Commit**: `fix(retrieval): use filter-only retrieval for file and adjacent chunk lookups`

---

### T31: Replace the `getFile` and call-chain zero-vector fakes

**What**: Convert the remaining two search-engine fakes, remove their hardcoded limits, and thread the
filter.
**Where**: `packages/retrieval/src/search-engine.ts` (modify: `expandCallChain` at 594, `getFile` at
803-808), `packages/retrieval/src/search-engine.test.ts` (modify)
**Depends on**: T17, T30
**Reuses**: `FilterOnlyRetriever` and `EffectiveFilter`. The `calledBy` half of call-chain expansion is
**dead today** because the field was never decoded — T17 fixed the decode, so this task is what makes
it live (`design.md:435-436`).
**Requirement**: FLT-01, FLT-02, FLT-03, FLT-05, FLT-06, FLT-07, FLT-11

**Tools**:

- MCP: NONE — this repo is not self-indexed (see note above)
- Skill: NONE

**Done when**:

- [X] Failing test written first, then implementation
- [X] `getFile` uses `scrollAll` with a required `EffectiveFilter`; its hardcoded `1000` limit is
      replaced by pagination to exhaustion (FLT-03)
- [X] `expandCallChain` uses filter-only retrieval with a required `EffectiveFilter`; its
      `min(n*2, 20)` heuristic is gone
- [X] The **`calledBy` direction** of call-chain expansion now returns results, asserted with a
      fixture where the only edge is `calledBy` — proving the decode fix from T17 is load-bearing (FLT-11)
- [X] Both paths apply the repo filter, user metadata filters, and test exclusion (FLT-06, FLT-07) —
      asserted individually, including a cross-repo expansion target that is **excluded** when a repo
      filter is in force (spec Edge Cases)
- [X] Results ordered by `(repoId, relativePath, startLine)` (FLT-05)
- [X] Ceiling truncation is propagated to the caller rather than swallowed (FLT-04)
- [X] Gate check passes: `pnpm --filter ...@ia-framework/retrieval test` — 6 dependent packages
      passed: retrieval 235, indexer 254, benchmark 86, dashboard-api 92, CLI 78, and MCP-server
      254 tests; 0 failed and one pre-existing indexer test remains skipped.
- [X] Test count: 3 new tests pass; existing retrieval tests were preserved with no tests deleted,
      weakened, or skipped.

**Tests**: unit
**Gate**: full

**Commit**: `fix(retrieval): use filter-only retrieval for getFile and call-chain expansion`

---

### T32: Fix `findImplementations` — nested filter and filter-only retrieval

**What**: Replace the two independent `must` clauses that can match different array elements with a
real Qdrant `nested` filter, and drop the zero-vector query.
**Where**: `packages/retrieval/src/search-engine.ts` (modify, lines 920-940),
`packages/retrieval/src/search-engine.test.ts` (modify)
**Depends on**: T31
**Reuses**: `FilterOnlyRetriever`, `EffectiveFilter`. The current code builds two **independent**
`must` clauses on `dependencyEdges[].targetPath` and `.relation` despite a comment claiming a nested
filter, so the two conditions can match *different* array elements (`design.md:410-412`).
**Requirement**: FLT-01, FLT-02, FLT-06, FLT-07

**Tools**:

- MCP: `context7` (`/qdrant/qdrant-js`) — confirm `nested` filter syntax
- Skill: NONE

**Done when**:

- [X] Failing test written first, then implementation
- [X] A real Qdrant `nested` filter is emitted so `targetPath` and `relation` must match the **same**
      array element — asserted on the captured filter structure
- [X] **Correctness test**: a chunk whose `dependencyEdges` contains `{targetPath: A, relation: X}`
      and `{targetPath: B, relation: Y}` is **not** returned for a query of `(A, Y)` — the exact
      false-positive the independent clauses produce today
- [X] Uses filter-only retrieval; the hardcoded limit of `10` is replaced by pagination (FLT-01, FLT-03)
- [X] Takes a required `EffectiveFilter` and applies repo + metadata + test exclusion (FLT-06, FLT-07)
- [X] Gate check passes: `pnpm --filter ...@ia-framework/retrieval test` — 6 dependent packages
      passed: retrieval 237, indexer 254, benchmark 86, dashboard-api 92, CLI 78, and MCP-server
      254 tests; 0 failed and one pre-existing indexer test remains skipped.
- [X] Test count: 2 new tests pass; existing retrieval tests were preserved with no tests deleted,
      weakened, or skipped.

**Tests**: unit
**Gate**: full

**Commit**: `fix(retrieval): use nested filter and filter-only retrieval for findImplementations`

---

### T33: Thread `EffectiveFilter` through the dependency-graph and multi-hop expansion paths

**What**: Close the remaining expansion paths that forward no filter at all, and the multi-collection
merge path.
**Where**: `packages/retrieval/src/dependency-graph.ts` (modify),
`packages/retrieval/src/dependency-graph.test.ts` (modify),
`packages/retrieval/src/multi-hop.ts` (modify),
`packages/retrieval/src/multi-collection-search-engine.ts` (modify),
`packages/retrieval/src/multi-collection-search-engine.test.ts` (modify)
**Depends on**: T32
**Reuses**: `EffectiveFilter` from T29 and `FilterOnlyRetriever` from T28. Five of eight expansion
paths currently accept **no filter argument at all** (`design.md:422-424`), which is why making the
parameter required is the enforcement mechanism.
**Requirement**: FLT-02, FLT-06, FLT-07, FAIL-03, A-15, AD-005

**Tools**:

- MCP: NONE — enumerate expansion entry points with `Grep` across `packages/retrieval/src/`
- Skill: NONE

**Done when**:

- [X] Failing test written first, then implementation
- [X] Every expansion entry point in these files takes `EffectiveFilter` as a **required** parameter —
      asserted by the fact that `pnpm typecheck` passes only after all call sites thread it (TD-14)
- [X] Dependency expansion, multi-hop symbol lookup, and hierarchy/interface expansion each apply the
      repo filter — one two-repo isolation test per path (FLT-06)
- [X] Each path applies user metadata filters and test exclusion (FLT-07)
- [X] The multi-collection merge preserves the filter across collections — a repo-scoped query against
      two collections returns nothing from the out-of-scope repo (FLT-06)
- [X] An expansion producing **zero** additional results yields a response identical to the unexpanded
      one plus a zero expansion count (spec Edge Cases)
- [X] **Coverage assertion**: tests enumerate all eight retrieval/expansion paths and assert each
      one rejects a call with no filter, so no path is left unscoped (A-15 "test-verified, not
      best-effort")
- [X] Gate check passes: `pnpm --filter ...@ia-framework/retrieval test` — 6 dependent packages passed: retrieval 251, indexer 254, benchmark 86, dashboard-api 92, CLI 78, and MCP-server 255; 0 failed and one pre-existing indexer test remains skipped.
- [X] Test count: 15 new tests pass; existing tests were preserved with no tests deleted, weakened, or skipped.

**Tests**: unit
**Gate**: full

**Commit**: `fix(retrieval): thread required EffectiveFilter through all expansion paths`

---

### T34: Reconcile the payload-index field list against the actual filter keys

**What**: Derive the complete payload-index list mechanically from the filter keys the final
`EffectiveFilter` and expansion filters use, and create any missing ones.
**Where**: `packages/vector-store/src/qdrant.ts` (modify — the payload-index list),
`packages/vector-store/src/qdrant.test.ts` (modify)
**Depends on**: T14, T29, T33
**Reuses**: The existing 6-index creation loop at `packages/vector-store/src/qdrant.ts:234-248`, now
reconciled on every `initialize()` thanks to T14.
**Requirement**: FLT-08, FLT-09, A-27

**Tools**:

- MCP: NONE — this repo is not self-indexed (see note above)
- Skill: NONE

**Done when**:

- [X] Failing test written first, then implementation
- [X] The index list covers **every** key used by `EffectiveFilter.toQdrantFilter()` and by every
      expansion filter — this is the mechanical derivation `design.md:987-988` left to Tasks
- [X] The list explicitly includes `kind` (the reserved-point exclusion key from T13), otherwise every
      query pays a full scan for the `must_not`
- [X] A **drift test** enumerates the filter keys produced by `EffectiveFilter` and every expansion
      filter and asserts each has a declared payload index — so adding a filter key without an index
      fails a test rather than silently degrading to a full scan
- [X] A creation **failure** reports `PayloadIndexError` naming the field and its effect on filtering
      (FLT-08); a success is silent (A-27)
- [X] Indexes are added to an existing populated collection without any destructive operation —
      asserted by confirming `deleteCollection` and `delete` are never called (FLT-09)
- [X] Gate check passes: `pnpm build && pnpm typecheck && pnpm lint && pnpm test` — build and all
      tests pass; workspace typecheck/lint retain approved pre-existing failures in untouched files
- [X] Test count: 6 new tests pass (no silent deletions)

**Tests**: integration
**Gate**: build

**Commit**: `feat(vector-store): reconcile payload indexes against actual filter keys`

---
### Phase 6 — WS5 planning + WS6 enrichment

---

### T35: Export the `QueryPlan` type and its sub-types from `core`

**What**: Publish the plan shape from `core` so `mcp-server` consumes it without importing anything
retrieval-internal.
**Where**: `packages/core/src/planning/types.ts` (new),
`packages/core/src/index.ts` (modify — export)
**Depends on**: T2, T5, T29
**Reuses**: `SparseVector` from T2; `EffectiveFilter` shape from T29; the data model already fixed at
`design.md:748-778`.
**Requirement**: QP-01, QP-03, A-17, TD-01, TD-02, AD-001

**Tools**:

- MCP: NONE — this repo is not self-indexed (see note above)
- Skill: NONE

**Done when**:

- [X] `QueryIntent` = `'exact_symbol' | 'class_overview' | 'conceptual' | 'dependency_trace' | 'existence' | 'aggregation'` (TD-02)
- [X] `VectorBranch` = `'semantic' | 'signature' | 'sparse'`
- [X] `QueryPlan` declares `originalQuery`, `intent`, `branches`, `representations`, `lexical`,
      `filter`, `expansion`, `budget`, `candidateLimits`, `templateId?`, `fingerprint` exactly as
      `design.md:756-778` specifies
- [X] `intent` and `branches` are **separate** fields, so neither legacy enum survives as the single
      axis (A-17)
- [X] `ResolvedBudget`, `CandidateLimits`, `ContextItem`, `SourceAnchor`, `Diagnostics`, and
      `LineRange` are declared per `design.md:786-847`
- [X] `pnpm typecheck` clean for the task-owned declarations; exported from `packages/core/src/index.ts`
- [X] Gate check passes: `pnpm build && pnpm typecheck && pnpm lint && pnpm test` — build and all
      tests pass; workspace typecheck/lint retain approved pre-existing failures in untouched files
- [X] Test count: no runtime tests added because this task is explicitly type-only; core's existing
      205 tests pass with no tests deleted, weakened, or skipped

**Verification deviation (approved baseline)**: workspace typecheck retains the pre-existing strict-index
errors in `packages/core/src/config/registry.test.ts` and `packages/core/src/graph/cross-repo-edges.test.ts`.
Workspace lint retains pre-existing findings in untouched core and embedding files. The new planning
declarations pass the core build and introduce no new test or lint findings.

**Tests**: none (type-only declarations — matrix says "none" for type declarations; the behavior that
produces and consumes these types is tested in T36-T40)
**Gate**: build

**Commit**: `feat(core): export shared QueryPlan and context assembly types`

---

### T36: Create `QueryPlanner` — one deterministic plan per request

**What**: The centerpiece: compute exactly one plan, deriving intent, branches, three channel
representations, lexical evidence, filters, expansion and budget — pure, local, reproducible.
**Where**: `packages/retrieval/src/planning/query-planner.ts` (new),
`packages/retrieval/src/planning/query-planner.test.ts` (new)
**Depends on**: T3, T25, T29, T35
**Reuses**: The regex corpus from **both** retired classifiers —
`packages/mcp-server/src/classification/query-classifier.ts:26-126` (`DEFAULT_RULES`) and
`packages/retrieval/src/query-classifier.ts:51-105` (including `getVectorsForQueryType`'s
vector-selection mapping, which becomes `branches`); `analyzeRetrievalQuery` from
`packages/core/src/retrieval/query-intelligence.ts`; the curated `packages/retrieval/src/search-synonyms.ts`
map unchanged; the canonical `tokenize` and `buildSparseVector`.
**Requirement**: QP-01, QP-02, QP-03, QP-05, QP-06, QP-07, QP-08, QP-09, QP-10, QP-11, QP-12, QP-13, A-06, A-07, A-17

**Tools**:

- MCP: NONE — this repo is not self-indexed (see note above)
- Skill: NONE

**Done when**:

- [X] Failing test written first, then implementation
- [X] `plan(input, caps): QueryPlan` returns exactly one plan per call (QP-01)
- [X] `originalQuery` is byte-identical to the input, never derived from (QP-02) — asserted with a
      query containing quotes and mixed case
- [X] All fields in QP-03 are derived: normalized lexical terms, exact symbols, quoted identifiers,
      package terms, path terms, intent, route, branches, effective filters, expansion settings, budget
- [X] **Intent mapping test per value**: one representative query per `QueryIntent` value asserts the
      expected intent — `getUserById` → `exact_symbol`, "what is an Entry?" → `class_overview`,
      "how are payments retried?" → `conceptual`, "what imports X?" → `dependency_trace`,
      "is there a retry mechanism?" → `existence`, "how many services?" → `aggregation` (TD-02)
- [X] **The three representations differ in the documented ways** (QP-07, QP-08, QP-09, A-06):
      `semantic` = original text + configured query prefix; `signature` = structural rendering with
      exact symbols/class/method/package/path/annotation/construct types; `sparse` = exact identifiers,
      quoted terms, package/path tokens + additive synonyms. One assertion per channel, plus one
      asserting all three are **mutually distinct** for `PaymentService.refund`
- [X] `branches` is computed **separately** from intent and gated by `caps.sparse` — a `conceptual`
      query with a quoted term still gets the sparse branch, the exact case A-17 requires two fields for
- [X] `caps.sparse === false` omits `sparse` from `branches` (SPR-06 precondition)
- [X] Synonyms apply to the **sparse channel only**, are **additive**, and introduce no symbol, file,
      package or domain entity absent from the curated map (QP-10, A-07) — asserted by set-difference
      against the map's own values
- [X] **Determinism**: the same input twice yields a deeply-equal plan, including `fingerprint` (QP-05)
- [X] **No LLM, no network**: `fetch` and any HTTP client are asserted un-called during planning (QP-06)
- [X] `templateId` is set for output scaffolding but **never** appears in any of the three
      representations (QP-11) — asserted by substring absence
- [X] Explicit user filters (`repo`, `stereotype`, `archLayer`, `module`, `language`) and explicit
      expansion settings are all present in the plan (QP-12) — one assertion each
- [X] An unusable input throws `QueryPlanError` rather than returning a plan with defaulted-away
      constraints (QP-13)
- [X] Gate check passes: `pnpm --filter ...@ia-framework/retrieval test` — retrieval 286, indexer 254
      plus one pre-existing skip, benchmark 86, dashboard-api 92, CLI 78, and MCP-server 255 tests pass
- [X] Test count: 40 planner tests pass (no silent deletions)

**Tests**: unit
**Gate**: full

**Commit**: `feat(retrieval): add deterministic query planner with orthogonal intent and branches`

---

### T37: Retire the retrieval classifier and consume the plan in the search engine

**What**: Retire the retrieval-side competing classifier, make `SearchEngine` accept the shared plan,
and forbid downstream re-classification. The MCP classifier and MCP-side analyzer collapse are
deferred to T40 so the handler migration remains one atomic change.
**Where**: `packages/retrieval/src/query-classifier.ts` (delete),
`packages/retrieval/src/query-classifier.test.ts` (delete),
`packages/retrieval/src/search-engine.ts` (modify, lines 290-291 and the routing block),
`packages/retrieval/src/search-engine.test.ts` (modify),
`packages/retrieval/src/planning/query-planner.test.ts` (modify — migrate classifier behavior),
`packages/retrieval/src/index.ts` (modify — exports)
**Depends on**: T26, T36
**Reuses**: Their regex corpora were already harvested into `QueryPlanner` in T36, so this task deletes
rather than rewrites. The remaining analyzer copies and MCP classifier migration are owned by T40.
**Requirement**: QP-01, QP-04, QP-07, QP-08

**Execution correction**: Per the user-selected scope correction, the MCP classifier files and
the duplicate analyzer copies are not touched by T37. T40 owns MCP classifier retirement, the MCP
handler migration, and collapsing the remaining analyzer copies.

**Tools**:

- MCP: NONE — find every retrieval importer with `Grep` for `classifyQuery` / `query-classifier` before deleting
- Skill: NONE

**Done when**:

- [X] Failing test written first, then implementation
- [X] The retrieval `query-classifier.ts` and its test are **deleted**, and no retrieval importer
      remains — the MCP classifier is explicitly deferred to T40
- [X] `SearchEngine` accepts a `QueryPlan` and **does not classify** — a test asserts no
      classification function is reachable from the engine (QP-04)
- [X] `search-engine.ts`'s single-embedding reuse is replaced: the `semantic` and `signature`
      branches are embedded from their **own** representations, so two distinct dense vectors reach
      `searchHybrid` (QP-08, closing design F3 end-to-end) — asserted on the store call
- [X] The branches the engine executes come from the plan, not from a local decision
- [X] Gate check passes: `pnpm --filter ...@ia-framework/retrieval test` — retrieval 298, indexer
      254 plus one pre-existing skip, benchmark 86, dashboard-api 92, CLI 78, and MCP-server 255
      tests pass
- [X] Test count: 8 new search-engine plan-consumption tests pass; the deleted retrieval classifier
      tests' behavioral coverage is preserved in `query-planner.test.ts` from T36 (this is a
      **migration**, not a deletion — the retrieval test count increases from the pre-task baseline)

**Tests**: unit
**Gate**: full

**Commit**: `refactor(retrieval)!: retire classifier in favor of the shared plan`

---

### T38: Widen `RetrievalResult` with enrichment and AST metadata

**What**: Stop severing enrichment at the `ChunkPayload → RetrievalResult` boundary, where 20 fields
are currently dropped.
**Where**: `packages/retrieval/src/types.ts` (modify — `RetrievalResult`),
`packages/retrieval/src/search-engine.ts` (modify — `toRetrievalResult` at lines 56-99),
`packages/retrieval/src/search-engine.test.ts` (modify)
**Depends on**: T17, T35
**Reuses**: The existing 27-field copy in `toRetrievalResult`; the decode work from T17 makes the
previously write-only fields available. `mcp-server` has **zero** references to the enrichment names
today (`design.md:528-529`).
**Requirement**: ENR-01, ENR-06, ENR-08, A-29

**Tools**:

- MCP: NONE — this repo is not self-indexed (see note above)
- Skill: NONE

**Done when**:

- [X] Failing test written first, then implementation
- [X] `RetrievalResult` gains `enrichment?: { description?, businessContext?, semanticTags?, relationships?, enrichedAt?, enrichmentModel? }` —
      **one optional group**, absent rather than empty when unenriched (ENR-08)
- [X] Gains the AST/classification fields the assembler needs: `signature`, `classSignature`,
      `parentName`, `stereotype`, `archLayer`, `docCommentStartLine`, `annotationStartLine`, `signatureOnly`
- [X] `toRetrievalResult` maps **every** one of them — a field-list property test asserts nothing
      declared on `ChunkPayload` that `RetrievalResult` declares is dropped in the mapping (ENR-01);
      this is the read-side complement to T17's write-side round-trip test
- [X] An **enriched** chunk yields a populated `enrichment` group with `description` and `semanticTags`
- [X] An **unenriched** chunk yields `enrichment === undefined` — not an object of empty strings, so a
      degraded result is distinguishable rather than misleading (ENR-08)
- [X] Every result carries repo identity, relative path, symbol name, chunk type, and line range
      (ENR-06) — asserted as required, not optional
- [X] `signatureOnly` propagates so retrieval can mark a semantically-reduced match (A-29)
- [X] Gate check passes: `pnpm --filter ...@ia-framework/retrieval test`
- [X] Test count: 11 new tests pass (no silent deletions)

**Tests**: unit
**Gate**: full

**Commit**: `feat(retrieval): propagate enrichment and AST metadata into RetrievalResult`

---

### T39: Preserve enrichment across multi-collection merge and every expansion path

**What**: Make enrichment survive the merge and expansion stages, and give fallback results the same
metadata completeness as primary results.
**Where**: `packages/retrieval/src/multi-collection-search-engine.ts` (modify),
`packages/retrieval/src/multi-collection-search-engine.test.ts` (modify),
`packages/retrieval/src/dependency-graph.ts` (modify),
`packages/retrieval/src/multi-hop.ts` (modify),
`packages/retrieval/src/__tests__/search-engine-fallback.test.ts` (modify)
**Depends on**: T33, T38
**Reuses**: The merge and expansion result-mapping paths touched in T33; the widened
`RetrievalResult` from T38.
**Requirement**: ENR-01, ENR-02, ENR-09

**Tools**:

- MCP: NONE — this repo is not self-indexed (see note above)
- Skill: NONE

**Done when**:

- [X] Failing test written first, then implementation
- [X] Enrichment survives the multi-collection merge — asserted on a merged result that came from the
      second collection (ENR-01)
- [X] Enrichment survives **every** expansion path: dependency, hierarchy, interface-implementation,
      call-chain, adjacent, and multi-hop — one assertion per path (ENR-01)
- [X] **Fallback results carry equal metadata completeness** to primary-path results — asserted by
      comparing the populated-field sets of a fallback result and a primary result for the same chunk
      (ENR-09)
- [X] **No LLM call at query time** on any of these paths (ENR-02) — asserted by confirming no LLM
      client method is invoked during a full search-with-expansion
- [X] Gate check passes: `pnpm --filter ...@ia-framework/retrieval test`
- [X] Test count: 12 new tests pass (no silent deletions)

**Tests**: unit
**Gate**: full

**Commit**: `fix(retrieval): preserve enrichment across merge, expansion, and fallback`

---

### T40: Consume the shared plan in the `search_codebase` handler

**What**: Retire the MCP-side standalone classifier, make the MCP handler build the shared plan once,
pass it to the engine, and stop classifying independently.
**Where**: `packages/mcp-server/src/tools/search-codebase.ts` (modify — the classification and routing
block), `packages/mcp-server/src/tools/__tests__/search-codebase-templates.test.ts` (modify),
`packages/mcp-server/src/classification/query-classifier.ts` (delete),
`packages/mcp-server/src/classification/query-classifier.test.ts` (delete),
`packages/mcp-server/src/classification/index.ts` (modify),
`packages/mcp-server/src/tools/result-formatting.ts` (modify — remove the duplicate
`analyzeRetrievalQuery` at lines 19-37), `packages/retrieval/src/query-intelligence.ts` (delete —
remove the now-unused retrieval duplicate)
**Depends on**: T36, T37
**Reuses**: `QueryPlanner` from T36; the existing template registry at
`packages/mcp-server/src/templates/registry.ts`, whose output is already correctly prepended to the
response text only and must stay that way (QP-11, `design.md:516-518`).
**Requirement**: QP-01, QP-04, QP-11, QP-12, QP-13

**Tools**:

- MCP: NONE — this repo is not self-indexed (see note above)
- Skill: NONE

**Done when**:

- [X] Failing test written first, then implementation
- [X] The handler calls `plan()` exactly **once** per request — asserted with a call-count spy (QP-01)
- [X] The same plan instance is passed to the search engine; the handler performs **no** independent
      classification (QP-04)
- [X] **Agreement test**: for a given query, the route and branches reported by the MCP layer are
      identical to those the engine reports — the spec's Independent Test for WS5 (`spec.md:432-435`)
- [X] The duplicate `analyzeRetrievalQuery` at `result-formatting.ts:19-37` is **deleted** in favor of
      the `core` export
- [X] Template selection uses `plan.templateId` and the template text appears **only** in the response
      body, never in an embedding input (QP-11)
- [X] User-supplied `repo`, `stereotype`, `archLayer`, `module`, `language` and `expand_hops` all
      survive into the plan and into a **forced fallback** — the spec's Independent Test requirement
      that "both filters survive into a forced fallback" (QP-12, FAIL-03)
- [X] A planning failure surfaces as an actionable diagnostic rather than an implicitly-defaulted plan
      (QP-13)
- [X] Gate check passes: `pnpm --filter ...@ia-framework/mcp-server test`
- [X] Test count: 14 new tests pass (no silent deletions)

**Tests**: integration
**Gate**: full

**Commit**: `refactor(mcp-server): consume the shared query plan in search_codebase`

---
### Phase 7 — WS7 assembly + WS8 budget + WS9 failures

---

### T41: Create `BudgetGovernor` — resolution, precedence, and reservation

**What**: One budget contract with explicit precedence, unlimited semantics, and an up-front
diagnostics reservation.
**Where**: `packages/mcp-server/src/context/budget.ts` (new),
`packages/mcp-server/src/context/budget.test.ts` (new)
**Depends on**: T3, T7, T35
**Reuses**: `packages/mcp-server/src/tools/adaptive-budget.ts:31-35` tiers **8000 / 20000 / 40000
retained verbatim** — CONTEXT.md decision 6 forbids inventing new numbers; only precedence changes.
`TokenEstimator` from T3.
**Requirement**: BUD-01, BUD-02, BUD-13, A-24, TD-08, TD-09, TD-12

**Tools**:

- MCP: NONE — this repo is not self-indexed (see note above)
- Skill: NONE

**Done when**:

- [X] Failing test written first, then implementation
- [X] `resolve(input, adaptive): ResolvedBudget` — an **explicit** per-call budget always wins, **even
      when larger** than the adaptive tier (TD-08) — asserted with `explicit=100000` against
      `adaptive=8000` returning `100000`, the case `min()` would wrongly clamp
- [X] The adaptive tier is used only when the caller specifies nothing, and the three tier values are
      asserted as exactly 8000 / 20000 / 40000 (TD-09)
- [X] `source` is `'explicit'` or `'adaptive'` accordingly
- [X] `0` means **unlimited** — everything is included **and** the true estimated token count is still
      reported (CONTEXT.md decision 6) — both halves asserted
- [X] A **negative** or **non-numeric** budget is a configuration error, not a silent coercion
- [X] `reserveDiagnostics()` returns a fixed conservative allowance taken **up front** (A-24, TD-12);
      the constant is a named export with a comment citing TD-12, and a test asserts its value (the
      calibration `design.md:981-983` leaves to Tasks)
- [X] A budget **smaller than the diagnostics reservation** reduces diagnostics deterministically and
      the reduction is visible in the output (spec Edge Cases)
- [X] Gate check passes: `pnpm --filter @ia-framework/mcp-server test`
- [X] Test count: 12 new tests pass (no silent deletions)

**Tests**: unit
**Gate**: quick

**Commit**: `feat(mcp-server): add budget governor with explicit-wins precedence`

---

### T42: Create `ContextAssembler` range selection, dedup, and merge

**What**: Select the smallest sufficient range per item, deduplicate all six classes, and merge
overlapping ranges deterministically.
**Where**: `packages/mcp-server/src/context/assembler.ts` (new),
`packages/mcp-server/src/context/assembler.test.ts` (new)
**Depends on**: T35, T38, T41
**Reuses**: `buildCodeAnchor` (`packages/core/src/retrieval/query-intelligence.ts`), `groupByRepo`
(`packages/mcp-server/src/tools/search-codebase.ts:488-502`), and `formatRetrievalContext`
(`packages/mcp-server/src/tools/result-formatting.ts:49-67`) as anchor/rendering primitives (CTX-10).
The A-28 expanded range uses the index-time fields added in T15/T16.
**Requirement**: CTX-03, CTX-05, CTX-06, CTX-07, CTX-10, CTX-13, CTX-14, CTX-15, A-28

**Tools**:

- MCP: NONE — this repo is not self-indexed (see note above)
- Skill: NONE

**Done when**:

- [X] Failing test written first, then implementation
- [X] `selectRange(result, intent)` for `exact_symbol` returns
      `[min(docCommentStartLine, annotationStartLine, startLine) .. endLine]` (A-28) — asserted for
      doc-comment-only, annotation-only, both, and neither
- [X] `class_overview` selects the class declaration line **including `extends`/`implements`**, the
      field block, and method **signatures without bodies**; bodies appear only for members the query
      implicates (CTX-06). The implication signal is **lexical overlap between the query terms and the
      member name, combined with the member's retrieval score** — the open choice at
      `design.md:985-986`; the chosen signal is asserted by a test and documented in a code comment
- [X] `conceptual` selects bodies for the highest-priority matches and signature-or-summary below
      (CTX-07)
- [X] `dependency_trace` is the **only** intent that includes the import block (CONTEXT.md decision 3) —
      asserted positively for it and negatively for the other five
- [X] **Dedup covers all six classes** (CTX-13), one test each: identical `chunkId`; same source region
      from **different collections** keyed on `(repoId, relativePath, startLine, endLine)`; repeated
      files; overlapping ranges; repeated expansion results; repeated summaries/anchors
- [X] `mergeOverlaps` merges overlapping ranges deterministically, operating on the **A-28-expanded**
      ranges rather than bare bodies (CTX-14, A-28)
- [X] **Adjacent-but-not-overlapping** ranges from one file behave deterministically and the chosen
      behavior is documented in a code comment (spec Edge Cases)
- [X] Ranking order and provenance of every survivor are preserved through dedup and merge (CTX-15) —
      asserted by comparing pre/post order and provenance fields
- [X] Every item carries a `SourceAnchor` with repo, path, symbol and line range (CTX-10) — asserted as
      unconditionally present
- [X] Gate check passes: `pnpm --filter @ia-framework/mcp-server test`
- [X] Test count: 31 new test declarations pass (no silent deletions)

**Tests**: integration
**Gate**: full

**Commit**: `feat(mcp-server): add context assembler with smallest-sufficient range selection`

---

### T43: Implement the priority ladder and the one-node overflow rule

**What**: Enforce the budget on assembled items by the seven-tier ladder, with exactly one documented
overflow exception.
**Where**: `packages/mcp-server/src/context/budget.ts` (modify — add `enforce`),
`packages/mcp-server/src/context/budget.test.ts` (modify)
**Depends on**: T41, T42
**Reuses**: `ResolvedBudget` and `reserveDiagnostics()` from T41; `ContextItem.priority` from T35.
**Requirement**: BUD-07, BUD-08, BUD-09, BUD-10, BUD-11, A-09

**Tools**:

- MCP: NONE — this repo is not self-indexed (see note above)
- Skill: NONE

**Done when**:

- [X] Failing test written first, then implementation
- [X] `enforce(items, budget)` orders by the seven-tier ladder exactly as BUD-07 lists it: exact
      requested symbol/node → direct high-confidence → exact identifier matches → compact enriched
      summaries → dependency+hierarchy → adjacent+call-chain → diagnostics (pre-reserved) — asserted by
      a shuffled-input ordering test
- [X] Returns `{ included, compacted, omitted, overflow? }` with accurate counts
- [X] **One-node overflow** (BUD-08, A-09): when the single highest-priority exact node alone exceeds
      the remaining budget it is included **complete**, all lower priority is omitted,
      `exact_node_overflow` is set, and estimated/configured/overflow amounts are reported — four
      separate assertions
- [X] The exception applies to **exactly one node**: a second oversized node is **not** granted it
      (asserted, since A-09 confines it to one)
- [X] The exact required node is **never arbitrarily truncated** (BUD-09) — asserted by comparing the
      included text length to the full node length
- [X] Lower-priority evidence that does not fit is compacted to a deterministic summary/signature/anchor
      or omitted (BUD-10), and the budget is **never** silently exceeded for it (BUD-11) — asserted by
      summing the included estimates against the limit
- [X] **Every candidate compacted away** yields a non-zero `candidate_count` with a zero
      `selected_count`, distinguishable from no results at all (spec Edge Cases)
- [X] When the exact top node **cannot be read from disk**, the overflow rule is **not** invoked and the
      failure is reported instead (spec Edge Cases)
- [X] Gate check passes: `pnpm --filter @ia-framework/mcp-server test`
- [X] Test count: 18 new enforcement tests pass (no silent deletions)

**Tests**: integration
**Gate**: full

**Commit**: `feat(mcp-server): enforce priority ladder with one-node overflow exception`

---

### T44: Rework `LiveSourceReader` — batched, path-validated, degradation-marking

**What**: Read candidate ranges before assembly, batched per file, with path-traversal validation and
marked degradation on read failure.
**Where**: `packages/mcp-server/src/context/live-source-reader.ts` (new),
`packages/mcp-server/src/context/live-source-reader.test.ts` (new),
`packages/mcp-server/src/server.ts` (modify — the `readFileFn` closure at lines 197-213)
**Depends on**: T42
**Reuses**: The `readFileFn` closure at `packages/mcp-server/src/server.ts:197-213` and the
`contentHash` drift detection at `packages/mcp-server/src/tools/search-codebase.ts:1036-1043` — reused
unchanged for FAIL-05 but moved into the reader so items beyond the top 5 are also checked.
**Requirement**: CTX-16, FAIL-04, FAIL-05, BUD-05

**Tools**:

- MCP: NONE — this repo is not self-indexed (see note above)
- Skill: NONE

**Done when**:

- [X] Failing test written first, then implementation
- [X] Reads are **batched per file** rather than up to 5 serial awaits
      (`search-codebase.ts:1028-1048`) — asserted by a fixture with 3 ranges in one file producing one read
- [X] **Path-traversal validation**: a `relativePath` containing `..` that resolves outside the repo
      root is **rejected**, not read (design risk `:896`) — asserted for both `../` and an absolute path
- [X] A read failure degrades the item to **anchor + metadata with `degraded: 'read-failed'`** and is
      **never silently omitted** (FAIL-04, spec Edge Cases) — replacing the `catch {}` at
      `search-codebase.ts:1045-1047` that falls back to `''`
- [X] A failed read is now **distinguishable** from a deliberately stripped result — asserted by
      contrasting the two
- [X] Drift detection applies to **every** included item, not only the top 5, and a drifted item is
      marked `stale: true` (FAIL-05)
- [X] Reading happens **before** assembly, so the budget can measure real content (BUD-05 precondition)
- [X] Gate check passes: `pnpm --filter @ia-framework/mcp-server test`
- [X] Test count: 12 new tests pass (no silent deletions)

**Tests**: integration
**Gate**: full

**Commit**: `feat(mcp-server): add batched path-validated live source reader with marked degradation`

---

### T45: Retire `applyTokenCap` and reorder the pipeline around the assembler

**What**: Delete the inoperative candidate-list cap, introduce `CandidateLimits`, remove the hardcoded
`topN = 5`, and enforce the budget on the serialized response.
**Where**: `packages/mcp-server/src/tools/search-codebase.ts` (modify — remove `applyTokenCap` calls at
lines 603, 733, 996, 997, 1003 and `topN` at 1025; reorder stages),
`packages/mcp-server/src/tools/token-cap.ts` (delete),
`packages/mcp-server/src/tools/token-cap.test.ts` (delete),
`packages/mcp-server/src/tools/search-codebase.test.ts` (modify)
**Depends on**: T43, T44
**Reuses**: `estimateTokens` was already promoted to `core` in T3, so the file's only remaining export
is the inoperative cap. `CandidateLimits` from T35 takes over the internal role (TD-15).
**Requirement**: CTX-01, CTX-02, CTX-04, CTX-09, CTX-16, BUD-03, BUD-05, BUD-06, BUD-12, A-12

**Tools**:

- MCP: NONE — this repo is not self-indexed (see note above)
- Skill: NONE

**Done when**:

- [X] Failing test written first, then implementation
- [X] `token-cap.ts` **deleted** with all five call sites removed — `rg -c applyTokenCap packages`
      reports 0 (TD-15)
- [X] The hardcoded `topN = 5` at `search-codebase.ts:1025` **deleted**; live-source inclusion follows
      priority + remaining budget (CTX-16, A-12) — asserted by a case where item 7 carries source and
      item 2 does not, which the fixed cutoff made impossible
- [X] Stage order is `retrieve → expand → dedup+merge → rank → live read → assemble → serialize →
      measure → enforce` (CTX-02, `design.md:212-215`) — asserted by a spy-ordering test
- [X] `CandidateLimits` governs internal candidate counts, **separately** from the model-visible budget
      (CTX-01) — asserted by a case where the candidate limit and the budget differ and both are respected
- [X] The budget is measured on the **serialized** response text **plus** `structuredContent`, after
      live reads (BUD-03, BUD-05, BUD-12) — asserted by comparing the reported estimate against a
      conservative measurement of the actual serialized payload
- [X] An item whose stored payload content is empty because live source loads later is **not** treated
      as costless (BUD-06) — the exact defect that made the old cap inert
- [X] A normal search response contains **targeted ranges, not whole files** (CTX-04) — asserted with an
      exact-method query against a 2000-line-file fixture: the method's range is present and the file is not
- [X] **The spec's WS7 sufficiency test**: the response for a query naming a symbol contains that
      symbol's code, so no caller-side `grep`/`find` is needed (CTX-09)
- [X] `console.info` at `search-codebase.ts:1012` moved off **stdout** to stderr/logger, since stdout is
      the JSON-RPC framing channel on a stdio transport (design risk `:897`)
- [X] Gate check passes: `pnpm --filter ...@ia-framework/mcp-server test`
- [X] Test count: the 5 deleted `token-cap.test.ts` tests are **replaced** by budget/assembler coverage
      in T41-T43 (migration, not deletion); ≥16 new tests pass here

**Tests**: integration
**Gate**: full

**Commit**: `refactor(mcp-server)!: retire inoperative token cap and enforce budget on serialized response`

---

### T46: Emit the full diagnostics set and fix the session cache key

**What**: Return all 13 diagnostics fields on every route in `structuredContent` only, and make the
cache key cover everything that changes the response.
**Where**: `packages/mcp-server/src/context/diagnostics.ts` (new),
`packages/mcp-server/src/context/diagnostics.test.ts` (new),
`packages/mcp-server/src/tools/search-codebase.ts` (modify — the cache at lines 514-526 and the
existence/aggregation routes at 603 and 733)
**Depends on**: T12, T45
**Reuses**: The existing session cache at `packages/mcp-server/src/tools/search-codebase.ts:514-526`;
`contractFingerprint` from T5 and `indexGeneration` read from the contract point via T12;
`incremental.ts`'s `collection[:repoId]` key convention (`packages/indexer/src/incremental.ts:8-30,66`)
for the local mirror.
**Requirement**: BUD-04, BUD-14, BUD-15, BUD-16, A-18, A-23, A-24, TD-10

**Tools**:

- MCP: NONE — this repo is not self-indexed (see note above)
- Skill: NONE

**Done when**:

- [X] Failing test written first, then implementation
- [X] All **13** fields present per `design.md:648-651`: `route`, `executed_branches`, `fallback_mode`,
      `candidate_count`, `selected_count`, `deduplicated_count`, `omitted_count`, `expansion_count`,
      `stale_count`, `estimated_tokens`, `configured_budget`, `compaction_count`,
      `exact_node_overflow` — asserted as a complete key-set equality, not a subset check (BUD-15)
- [X] Diagnostics live in **`structuredContent` only**; the prose body stays pure evidence (TD-10) —
      asserted by confirming no diagnostics field name appears in `content[].text`
- [X] The **full set appears on every route**, including `existence` and `aggregation` (BUD-16, A-18) —
      one assertion per route, with uniform shape
- [X] `existence` and `aggregation` responses remain **source-free** yet are fully counted against the
      budget (BUD-16, A-18) — both halves asserted
- [X] `executed_branches` lists **only** branches that actually ran — a sparse-unavailable case reports
      no sparse branch (SPR-06, A-04)
- [X] Diagnostics are compact and **do not duplicate** large textual content already in the response
      (BUD-04) — asserted by confirming no diagnostics value contains a source snippet
- [X] Exactly **two** prose anomaly lines are permitted: a degradation line when `status != ok`, and an
      exact-node-overflow line (TD-10, CONTEXT.md decision 4) — asserted present when triggered and
      **absent** on a clean response
- [X] **Cache key** covers original query, plan fingerprint, effective filters, expansion settings,
      effective budget, tool options, **and `indexGeneration`** (BUD-14, A-23)
- [X] Two requests differing **only** in expansion setting do not share an entry; likewise budget-only
      (spec Edge Cases) — two separate assertions
- [X] A changed `indexGeneration` **invalidates** prior entries (BUD-14, spec Edge Cases)
- [X] A cache hit returns the **full cached response**, not today's short "same results as previous
      query" message (`search-codebase.ts:514-526`)
- [X] Gate check passes: `pnpm --filter ...@ia-framework/mcp-server test`
- [X] Test count: 20 new diagnostics tests pass (no silent deletions)

**Tests**: integration
**Gate**: full

**Commit**: `feat(mcp-server): emit full diagnostics on every route and fix cache invalidation`

---

### T47: Surface actionable failures and stop the swallowing catch blocks

**What**: Return refusals and unavailability as successful tool results carrying a status, isolate
per-expansion failures, and never substitute unrelated evidence.
**Where**: `packages/mcp-server/src/tools/search-codebase.ts` (modify — the catch blocks at lines
870-880 and 975-977; the refusal surface),
`packages/mcp-server/src/tools/__tests__/search-codebase-fallback.test.ts` (modify),
`packages/mcp-server/src/capabilities.ts` (modify)
**Depends on**: T7, T12, T46
**Reuses**: `withDegradation` at `packages/mcp-server/src/capabilities.ts:56-67` for FAIL-08 reporting;
the error taxonomy from T7; `ContractStore.assertSearchable` from T12 as the refusal trigger.
**Requirement**: FAIL-01, FAIL-02, FAIL-03, FAIL-04, FAIL-06, FAIL-07, FAIL-08, EMB-09, A-27, AD-004, TD-11

**Tools**:

- MCP: NONE — this repo is not self-indexed (see note above)
- Skill: NONE

**Done when**:

- [X] Failing test written first, then implementation
- [X] A refusal or unavailable outcome is a **normal successful tool result** whose body states the
      failure, cause, and remediation, plus a machine-readable `status` — **not** an MCP protocol error
      (TD-11, AD-004) — asserted by confirming the result is not an error envelope **and** carries the status
- [X] `status` is drawn from the closed set `ok | empty | low_confidence | unavailable | refused`, and
      each of the five is asserted reachable by a distinct scenario (FAIL-06)
- [X] **Empty vs low-confidence vs unavailable are distinguishable** — three separate assertions on the
      status value, the spec's WS9 Independent Test
- [X] **Qdrant unreachable** → `status: 'unavailable'`, the body names the store and its remediation,
      does **not** endorse a shell fallback, and does **not** claim an answer is available (the recorded
      tension at `design.md:673-676`) — all four asserted
- [X] **Contract mismatch / unknown contract** → `status: 'refused'` with both contracts (or the
      collection name) and `ia index --force` in the body (EMB-09, A-27)
- [X] **Degradation never returns unrelated evidence** (FAIL-02) — asserted by confirming a degraded
      response's results are empty or query-related, never arbitrary fill
- [X] The single catch at `search-codebase.ts:870-880` collapsing **all five** expansions is replaced by
      **per-expansion isolation**: one failing expansion degrades only itself and reports it, while the
      other four still contribute (FAIL-08) — asserted per expansion
- [X] Every failure class named in WS9 produces a diagnostic naming what failed **and** the remediation
      (FAIL-01) — one assertion per class in the AC-1 list
- [X] A fallback preserves exact symbols, quoted terms, repo filter and metadata filters (FAIL-03) —
      asserted on a forced fallback, including that suggestions never come from another repo (spec WS9
      Independent Test)
- [X] Failure information is compact and its cost is **counted against the budget** (FAIL-07)
- [X] The observability catch at `search-codebase.ts:975-977` may stay silent but is asserted **not** to
      mask a retrieval failure
- [X] Gate check passes: build and MCP package tests pass; workspace typecheck/lint retain approved baseline findings
- [X] Test count: 22 new failure tests pass (no silent deletions)

**Tests**: integration
**Gate**: build

**Commit**: `feat(mcp-server): surface actionable failures with machine-readable status`

---

### Phase 8 — P2 documentation alignment

---

### T48: Update injected agent guidance and user docs to the shipped contract

**What**: Replace the three stale "top-5 live code / 6-10 metadata-only" assertions and document the
new diagnostics, refusal remediation, and sparse conditionality.
**Where**: `packages/cli/src/commands/agents.command.ts` (modify — `RAG_CONTENT` at lines 10-294, the
stale claim at line 156), `packages/cli/src/commands/agents.command.test.ts` (modify),
`packages/mcp-server/src/tools/search-codebase.ts` (modify — the tool description at line 1140),
`README.md` (modify — line 598), `AGENTS.md` (regenerate the `ia-framework:rag` block)
**Depends on**: T45, T46, T47
**Reuses**: The existing `RAG_CONTENT` single 285-line template literal. Note the `pipeline-guide`
block in the live `AGENTS.md` has **no generator** — it is hand-maintained and out of scope
(`design.md:716-718`).
**Requirement**: DOC-01, DOC-02, DOC-03, DOC-04, A-12

**Tools**:

- MCP: NONE — this repo is not self-indexed (see note above)
- Skill: NONE

**Done when**:

- [X] Failing test written first, then implementation
- [X] All **three** stale claims replaced — `agents.command.ts:156`,
      `search-codebase.ts:1140`, `README.md:598` — and a test asserts the substring
      "results 6-10 are metadata-only" appears **nowhere** in the repo's shipped guidance (DOC-01)
- [X] The replacement describes **budget-driven selection** by priority and remaining budget (DOC-01, A-12)
- [X] `RAG_CONTENT` documents how to interpret the 13 diagnostics fields (DOC-02) — asserted by
      substring for each field name
- [X] Documents the embedding-contract refusal and its `ia index --force` remediation (DOC-03)
- [X] Documents **when a sparse branch will and will not run** — conditional on adapter capability
      (DOC-04)
- [X] `AGENTS.md` regenerated from the updated template so the live file matches
- [X] **No statement in the updated guidance contradicts observed tool behavior** (spec P2 Independent
      Test) — asserted by a test that cross-checks each documented claim against the corresponding
      behavioral test's expectation
- [X] `pnpm --filter @ia-framework/cli test` passes with the regenerated template
- [X] Gate check passes: build passes; workspace typecheck/lint/test retain approved baseline findings
- [X] Test count: 8 new documentation tests pass (no silent deletions)

**Tests**: unit
**Gate**: build

**Commit**: `docs: align injected agent guidance with shipped retrieval contract`

---
## Phase Execution Map

Phases run in sequence; tasks within a phase run in order.

```
Phase 1 → Phase 2 → Phase 3 → Phase 4 → Phase 5 → Phase 6 → Phase 7 → Phase 8

Phase 1 (core primitives):     T1 ──→ T2 ──→ T3 ──→ T4 ──→ T5 ──→ T6 ──→ T7
Phase 2 (WS1 contract):        T8 ──→ T9 ──→ T10 ─→ T11 ─→ T12 ─→ T13 ─→ T14
Phase 3 (WS4 input safety):    T15 ─→ T16 ─→ T17 ─→ T18 ─→ T19 ─→ T20 ─→ T21
Phase 4 (WS2 sparse):          T22 ─→ T23 ─→ T24 ─→ T25 ─→ T26 ─→ T27
Phase 5 (WS3 filter-only):     T28 ─→ T29 ─→ T30 ─→ T31 ─→ T32 ─→ T33 ─→ T34
Phase 6 (WS5 plan + WS6 enr):  T35 ─→ T36 ─→ T37 ─→ T38 ─→ T39 ─→ T40
Phase 7 (WS7+WS8+WS9):         T41 ─→ T42 ─→ T43 ─→ T44 ─→ T45 ─→ T46 ─→ T47
Phase 8 (P2 docs):             T48
```

Execution is strictly sequential — there is no intra-phase parallelism. A single agent (or batch
worker) works one task at a time, in order.

**How phase-based execution works:** at Execute, the agent counts total tasks and packs phases into
task-budgeted batches (~7 tasks per worker, whole phases). A **phase** is the semantic/dependency
unit; a **batch** is one or more *consecutive whole phases* assigned to one worker, and the cut only
ever lands on a phase boundary. With 48 tasks across 8 phases sized 7/7/7/6/7/6/7/1, packing yields
roughly 7 batches (Phase 8's single task packs onto the tail of Phase 7's batch or runs alone). That
is far more than one batch, so **the sub-agent offer applies** — offer-then-confirm, never auto-spawn.
Batches run sequentially: each worker executes all its tasks in order and reports a compact summary
before the next batch starts.

**After the final task (T48), a fresh Verifier runs automatically** — author ≠ verifier, spec-anchored
outcome check plus discrimination sensor, writing
`.specs/features/019-rag-correctness-exact-context/validation.md`. This is never optional and never
prompted.

**User decisions recorded (Tasks phase):**

| Decision | Choice |
| --- | --- |
| Execution mode | **Batch sub-agents accepted** — ~7 sequential workers, one per task-budgeted batch, each reporting a compact summary before the next starts. Workers never spawn further sub-agents. |
| MCP assignment | **`context7` only.** `ia-framework` is excluded because this repo is not self-indexed (see "Tools Available During Execute"). |
| Re-index migration | **Acknowledged — proceed as planned.** The full re-index happens between Phase 3 and Phase 4; the enrichment LLM re-cost and the `graph.sqlite` rebuild are accepted. |

---

## Pre-Approval Validation

All three mandatory checks were run before presenting these tasks.

### Check 1 — Task Granularity

| Task | Scope | Status |
| ---- | ----- | ------ |
| T1 | 1 module (tokenizer) | ✅ Granular |
| T2 | 1 module (sparse builder) | ✅ Granular |
| T3 | 1 module (estimator) | ✅ Granular |
| T4 | 1 module (capability table) | ✅ Granular |
| T5 | 1 module (contract value object) | ✅ Granular |
| T6 | 1 schema field + its type | ✅ Granular |
| T7 | 1 module (error taxonomy) — 9 cohesive classes in one file | ⚠️ OK — cohesive: one taxonomy, one file, one concept |
| T8 | 1 interface + its 3 structural duplicates | ⚠️ OK — cohesive: the duplicates must change atomically or nothing compiles |
| T9 | 1 provider | ✅ Granular |
| T10 | 1 provider | ✅ Granular |
| T11 | 1 helper extraction | ✅ Granular |
| T12 | 1 module (contract store) | ✅ Granular |
| T13 | 1 helper + its call sites in one file | ✅ Granular |
| T14 | 1 method (`initialize`) | ✅ Granular |
| T15 | 1 type extension | ✅ Granular |
| T16 | 2 parsers, same field pair | ⚠️ OK — cohesive: one behavior across the two parsers that emit it |
| T17 | 1 payload type + 1 decode function | ✅ Granular |
| T18 | 1 module (budgeter) | ✅ Granular |
| T19 | 1 module + 1 extended splitter function | ⚠️ OK — cohesive: the ladder's step 1 *is* the splitter extension |
| T20 | 1 pipeline wiring change + 1 embedder cleanup | ⚠️ OK — cohesive: same failure-isolation behavior |
| T21 | 1 summary type + 1 CLI exit path | ⚠️ OK — cohesive: the exit code is the summary's observable effect |
| T22 | 1 interface extension | ✅ Granular |
| T23 | 1 method (`searchSparse`) | ✅ Granular |
| T24 | 1 method (`searchHybrid`) | ✅ Granular |
| T25 | 1 import swap in 1 file | ✅ Granular |
| T26 | 1 routing change + 1 deletion in 1 file | ✅ Granular |
| T27 | 1 method (`searchHybrid` parity) | ✅ Granular |
| T28 | 1 module (filter-only retriever) | ✅ Granular |
| T29 | 1 module (effective filter) | ✅ Granular |
| T30 | 3 lookup functions in 1 file, same conversion | ⚠️ OK — cohesive: one mechanical conversion, one file |
| T31 | 2 lookup functions in 1 file, same conversion | ⚠️ OK — cohesive: same as T30 |
| T32 | 1 function (`findImplementations`) | ✅ Granular |
| T33 | filter threading across 4 expansion files | ⚠️ OK — cohesive: TD-14 makes it one compiler-enforced change; splitting it leaves the build red |
| T34 | 1 index list + its drift test | ✅ Granular |
| T35 | type-only declarations | ✅ Granular |
| T36 | 1 module (planner) | ✅ Granular |
| T37 | 2 retrieval deletions + plan consumption change | ⚠️ OK — cohesive: the retrieval classifier and its tests migrate atomically; MCP retirement is T40 |
| T38 | 1 type + 1 mapping function | ✅ Granular |
| T39 | enrichment preservation across 4 files | ⚠️ OK — cohesive: one propagation property, asserted per path |
| T40 | 1 handler | ✅ Granular |
| T41 | 1 module (budget resolve/reserve) | ✅ Granular |
| T42 | 1 module (assembler) | ✅ Granular |
| T43 | 1 method (`enforce`) | ✅ Granular |
| T44 | 1 module (live reader) | ✅ Granular |
| T45 | 1 deletion + 1 pipeline reorder | ⚠️ OK — cohesive: the cap cannot be deleted without the reorder that replaces it |
| T46 | 1 module + 1 cache key | ⚠️ OK — cohesive: both are the diagnostics/accounting surface |
| T47 | failure surfacing in 1 handler + 1 capability helper | ✅ Granular |
| T48 | documentation, 4 files, one claim | ⚠️ OK — cohesive: the three stale copies must change together or the docs contradict each other |

**Result: PASS.** No task is ❌. Every ⚠️ is the documented "2-3 related things, cohesive" case, and
each carries an explicit cohesion reason. No task spans unrelated components.

### Check 2 — Diagram-Definition Cross-Check

| Task | Depends On (task body) | Diagram Shows | Status |
| ---- | ---------------------- | ------------- | ------ |
| T1 | None | (phase-1 head) | ✅ Match |
| T2 | T1 | T1 → T2 | ✅ Match |
| T3 | None | T2 → T3 (sequential, no dep) | ✅ Match — order-only edge |
| T4 | None | T3 → T4 (sequential, no dep) | ✅ Match — order-only edge |
| T5 | T1, T2, T4 | T4 → T5 (+ backward within phase) | ✅ Match |
| T6 | None | T5 → T6 (sequential, no dep) | ✅ Match — order-only edge |
| T7 | None | T6 → T7 (sequential, no dep) | ✅ Match — order-only edge |
| T8 | T5 | prior phase | ✅ Match |
| T9 | T8 | T8 → T9 | ✅ Match |
| T10 | T8 | T9 → T10 (+ backward to T8) | ✅ Match |
| T11 | T9, T10 | T10 → T11 | ✅ Match |
| T12 | T5, T7 | prior phase | ✅ Match |
| T13 | T12 | T12 → T13 | ✅ Match |
| T14 | T12, T13 | T13 → T14 | ✅ Match |
| T15 | None | (phase-3 head) | ✅ Match |
| T16 | T15 | T15 → T16 | ✅ Match |
| T17 | T15 | T16 → T17 (+ backward to T15) | ✅ Match |
| T18 | T3, T4 | prior phase | ✅ Match |
| T19 | T16, T18 | T18 → T19 | ✅ Match |
| T20 | T1, T2, T8, T18, T19 | T19 → T20 + prior phases | ✅ Match |
| T21 | T19, T20 | T20 → T21 | ✅ Match |
| T22 | T2 | prior phase | ✅ Match |
| T23 | T13, T22 | T22 → T23 + prior phase | ✅ Match |
| T24 | T23 | T23 → T24 | ✅ Match |
| T25 | T1 | prior phase | ✅ Match |
| T26 | T2, T23, T25 | T25 → T26 | ✅ Match |
| T27 | T24, T26 | T26 → T27 | ✅ Match |
| T28 | T13 | prior phase | ✅ Match |
| T29 | T13 | prior phase | ✅ Match |
| T30 | T17, T28, T29 | T29 → T30 | ✅ Match |
| T31 | T17, T30 | T30 → T31 | ✅ Match |
| T32 | T31 | T31 → T32 | ✅ Match |
| T33 | T32 | T32 → T33 | ✅ Match |
| T34 | T14, T29, T33 | T33 → T34 + prior phase | ✅ Match |
| T35 | T2, T5, T29 | prior phases | ✅ Match |
| T36 | T3, T25, T29, T35 | T35 → T36 | ✅ Match |
| T37 | T26, T36 | T36 → T37 | ✅ Match |
| T38 | T17, T35 | prior phase + T35 | ✅ Match |
| T39 | T33, T38 | T38 → T39 | ✅ Match |
| T40 | T36, T37 | (within phase, backward) | ✅ Match |
| T41 | T3, T7, T35 | prior phases | ✅ Match |
| T42 | T35, T38, T41 | T41 → T42 | ✅ Match |
| T43 | T41, T42 | T42 → T43 | ✅ Match |
| T44 | T42 | T43 → T44 (+ backward to T42) | ✅ Match |
| T45 | T43, T44 | T44 → T45 | ✅ Match |
| T46 | T12, T45 | T45 → T46 | ✅ Match |
| T47 | T7, T12, T46 | T46 → T47 | ✅ Match |
| T48 | T45, T46, T47 | T47 → T48 | ✅ Match |

**Result: PASS.** Every `Depends on` is satisfied by a task in the same phase or an earlier one — **no
task depends on a later phase**. Diagram arrows within a phase encode execution order; where a task
has no true dependency on its immediate predecessor (T3, T4, T6, T7) the arrow is order-only and is
labelled as such, which is consistent because execution is strictly sequential anyway.

### Check 3 — Test Co-location Validation

| Task | Code Layer Created/Modified | Matrix Requires | Task Says | Status |
| ---- | --------------------------- | --------------- | --------- | ------ |
| T1 | core pure primitive | unit | unit | ✅ OK |
| T2 | core pure primitive | unit | unit | ✅ OK |
| T3 | core pure primitive | unit | unit | ✅ OK |
| T4 | core pure primitive | unit | unit | ✅ OK |
| T5 | core pure primitive | unit | unit | ✅ OK |
| T6 | core config schema | unit | unit | ✅ OK |
| T7 | core pure primitive (errors) | unit | unit | ✅ OK |
| T8 | embedding interface + 3 duplicates (contract change, not type-only) | unit | unit | ✅ OK |
| T9 | embedding provider | unit | unit | ✅ OK |
| T10 | embedding provider | unit | unit | ✅ OK |
| T11 | embedding provider helper | unit | unit | ✅ OK |
| T12 | vector-store data-access | integration | integration | ✅ OK |
| T13 | vector-store data-access | integration | integration | ✅ OK |
| T14 | vector-store data-access | integration | integration | ✅ OK |
| T15 | ast-parser **type declaration only** | none | none | ✅ OK |
| T16 | ast-parser parsers | unit | unit | ✅ OK |
| T17 | vector-store data-access | integration | integration | ✅ OK |
| T18 | indexer service | unit | unit | ✅ OK |
| T19 | indexer service + ast-parser splitter | unit | unit | ✅ OK |
| T20 | indexer service | unit | unit | ✅ OK |
| T21 | indexer service + cli command | unit | unit | ✅ OK |
| T22 | vector-store **interface declaration only** | none | none | ✅ OK |
| T23 | vector-store data-access | integration | integration | ✅ OK |
| T24 | vector-store data-access | integration | integration | ✅ OK |
| T25 | retrieval service | unit | unit | ✅ OK |
| T26 | retrieval service | unit | unit | ✅ OK |
| T27 | retrieval service | unit | unit | ✅ OK |
| T28 | vector-store data-access | integration | integration | ✅ OK |
| T29 | retrieval service | unit | unit | ✅ OK |
| T30 | retrieval service | unit | unit | ✅ OK |
| T31 | retrieval service | unit | unit | ✅ OK |
| T32 | retrieval service | unit | unit | ✅ OK |
| T33 | retrieval service | unit | unit | ✅ OK |
| T34 | vector-store data-access | integration | integration | ✅ OK |
| T35 | core **type declarations only** | none | none | ✅ OK |
| T36 | retrieval service | unit | unit | ✅ OK |
| T37 | retrieval (classifier deletion + plan consumption) | unit | unit | ✅ OK |
| T38 | retrieval service | unit | unit | ✅ OK |
| T39 | retrieval service | unit | unit | ✅ OK |
| T40 | mcp-server tool handler | integration | integration | ✅ OK |
| T41 | mcp-server (pure budget math, no tool boundary) | unit | unit | ✅ OK |
| T42 | mcp-server assembler (contract boundary) | integration | integration | ✅ OK |
| T43 | mcp-server assembler/budget (contract boundary) | integration | integration | ✅ OK |
| T44 | mcp-server reader (contract boundary) | integration | integration | ✅ OK |
| T45 | mcp-server tool handler | integration | integration | ✅ OK |
| T46 | mcp-server tool handler | integration | integration | ✅ OK |
| T47 | mcp-server tool handler | integration | integration | ✅ OK |
| T48 | cli command (template generator) + markdown | unit | unit | ✅ OK |

**Result: PASS.** No ❌ VIOLATION. Notes on the three `Tests: none` tasks and the one mixed case:

- **T15, T22, T35** are the only `none` entries, and all three are pure type/interface declarations —
  the exact layer the matrix marks `none` ("Type-only declarations / re-export barrels"). Each is
  gated at **build** level (`pnpm build && pnpm typecheck && …`), and each names the follow-on task
  where the consuming behavior is tested (T16, T23, T36-T40 respectively). This is **not** test
  deferral: the declaration itself has no behavior to assert, and no task ships untested *behavior*.
- **T8** modifies an interface but is **not** typed `none`, because it also changes runtime behavior
  in `CachingEmbeddingProvider` and must prove per-input failures survive the cache layer.
- **T41** is `unit` rather than `integration` because budget resolution is pure arithmetic with no
  tool-response boundary; the serialized-response assertions live in T45/T46 where the boundary exists.
- **Compilation-dependency check:** no task produces code that cannot be tested until a later task.
  The two candidates were resolved by merging: T14 absorbs the mock-client `createPayloadIndex`
  addition (so removing the load-bearing `catch {}` and its test land together), and T19 absorbs the
  `splitOversizedChunks` extension (so the ladder's step 1 is testable inside the task that needs it).

---

## Requirement Traceability

All 105 requirement IDs map to at least one task. `OPS-01`/`OPS-02` are P3 and deliberately unmapped.

| Category | Requirement IDs | Tasks |
| --- | --- | --- |
| EMB-01..11 | 11 | T4, T5, T6, T8, T9, T10, T11, T12, T14, T17, T20, T47 |
| SPR-01..11 | 11 | T1, T2, T20, T22, T23, T24, T25, T26, T27, T36 |
| FLT-01..13 | 13 | T13, T17, T28, T29, T30, T31, T32, T33, T34 |
| INP-01..11 | 11 | T3, T4, T9, T18, T19, T20, T21 |
| QP-01..13 | 13 | T35, T36, T37, T40 |
| ENR-01..09 | 9 | T17, T38, T39, T42, T46 |
| CTX-01..16 | 16 | T15, T16, T42, T43, T44, T45 |
| BUD-01..16 | 16 | T3, T5, T12, T41, T43, T45, T46 |
| FAIL-01..08 | 8 | T7, T10, T21, T28, T44, T47 |
| DOC-01..04 | 4 | T48 |
| OPS-01..02 | 2 | — (P3, out of this breakdown; reportable via `ContractStore.readContract()` + `capabilities()` already built in T12/T22) |

**Coverage:** 103 of 105 mapped to tasks (2 P3 deferred by design) ✅

---

## Open Calibration Items Resolved in Tasks

`design.md:977-988` deliberately deferred four calibrations to this phase. Each now has an owning task
and a test that pins its value:

| Deferred item | Owning task | How it is pinned |
| --- | --- | --- |
| Estimator's non-under-reporting margin (BUD-13) | T3 | Named exported constant + margin asserted over a ≥10-chunk corpus from this repo |
| Diagnostics reservation constant (TD-12) | T41 | Named exported constant + value asserted by test |
| Filter-only safety ceiling (FLT-03 / A-05) | T28 | Named exported constant + value asserted; truncation reporting asserted separately |
| "Members the query implicates" signal for `class_overview` | T42 | Lexical overlap **combined with** retrieval score; chosen signal asserted by test and documented in a code comment |
| Complete payload-index field list | T34 | Derived mechanically from `EffectiveFilter` + expansion filter keys, with a drift test that fails when a filter key has no index |

---

## Migration Warning (surface before Execute)

This feature requires **one mandatory full re-index** (A-27, TD-13). Two costs must be stated to the
user before the migration, per the Handoff note in `.specs/STATE.md`:

1. **Enrichment LLM cost is re-paid.** The enrichment cache is in-memory only
   (`packages/indexer/src/enrichment/cache.ts:28-36`), so a full re-index regenerates every enrichment
   from scratch. A disk cache is out of scope (design risk `:894`).
2. **`graph.sqlite` rebuild.** It is 3.58 GB on the current machine; `file_edges` is rebuilt by the
   re-index. It is collection-scoped, so it can be rebuilt per collection (design risk `:895`).

The re-index is what makes the shared tokenizer/hash correct (design F1) — a partial migration leaves
a new tokenizer against an old index, which the contract gate turns into a **refusal** rather than a
silent mis-match.

---

## Tips Applied

- **Phases are ordered** — each completes before the next; tasks run in order within a phase
- **Reuses** — every task names the existing code it builds on, with `file:line`
- **Tools per task** — MCP/Skill listed per task
- **Dependencies are gates** — `Depends on` is explicit and cross-checked against the diagram
- **Done when = testable** — every entry is binary pass/fail and names its gate command
- **Requirement IDs** — every task traces to spec requirements
- **One commit per task** — commit message pre-planned; four tasks are marked `!` (breaking):
  T8, T14, T37, T45
