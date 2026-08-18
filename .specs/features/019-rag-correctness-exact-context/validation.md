# RAG Correctness, Deterministic Query Planning, and Exact Token-Efficient Context Delivery — Validation

**Date**: 2026-08-13
**Spec**: `.specs/features/019-rag-correctness-exact-context/spec.md`
**Fix-batch diff range**: `b055c1e..6303337` (31 commits)
**Whole-feature diff range**: `fab0016..6303337`
**Branch**: `019-rag-correctness-exact-context`
**Verifier**: independent sub-agent (author ≠ verifier). Read-only over the real tree; all sensor
mutations applied to file copies and reverted (`git status --short` empty, zero `MUTANT` markers,
backups deleted).

**Verdict (iteration 2)**: ✅ **PASS**

> Iteration 1 returned FAIL (18 confirmed GAPs, 29 precision gaps, 4/7 mutants surviving). That report
> is preserved verbatim in **[Historical — Iteration 1](#historical--iteration-1-2026-08-12-fail)**
> below so the fix→re-verify trail stays auditable. This iteration-2 verdict supersedes it.

---

## Executive Summary

| Dimension | Iteration 1 | Iteration 2 (this report) |
| --------- | ----------- | ------------------------- |
| Spec-anchored ACs matching spec outcome | 65/112 | **93/112** |
| Confirmed GAPs | 18 | **1** (EMB-03 — explicitly out of batch scope) |
| Spec-precision gaps | 29 | **18** (all carried forward, documented, none new) |
| Discrimination sensor | 3/7 killed, **4 survived** | **11/11 killed, 0 survived** |
| M1 / M2 / M3 / M6 | all SURVIVED | **all KILLED** |
| typecheck (`turbo --continue`) | 57 errors / 11 files | **0 errors** (24/24 tasks) |
| lint (`turbo --continue`) | 394 errors / 11 packages | **1 error** — the documented D-5 deviation only |
| test | 1804 passed / 0 failed / 1 skip | **1878 passed / 0 failed / 1 pre-existing skip** |

The iteration-1 root cause — `mcp-server` requirements verified against intermediate objects instead
of the final serialized tool response — is **genuinely closed**. Every requirement about what the
caller receives is now evidenced by an assertion reading `content[0].text` or `structuredContent`, and
that is empirically confirmed by mutation: bypassing budget trimming (M1) or zeroing the reported
estimate (M2) now break 7 tests each, where iteration 1 left all 352 green.

---

## Task Completion

| Task group | Status | Notes |
| ---------- | ------ | ----- |
| F1.1–F1.5 (budget truth) | ✅ Committed | `fc4905c`, `98be745`, `189dc8e`, `734b9ef`, `3b27f43` |
| F2.1–F2.4 (contract wiring) | ✅ Committed | `bf41053`, `5535127`, `3d6dbb3`, `f49b86a` |
| F3.1–F3.4 (context shape) | ✅ Committed | `c56e51c`, `79bfb53`, `773a19a`, `c25403b` |
| F4.1–F4.4 (diagnostics + isolation) | ✅ Committed | `54031c2`, `1df3c90`, `c996fa7`, `3020f36` |
| F5.1–F5.4 (failure paths, assertions, cleanup) | ✅ Committed | `b63ef0d`, `33a4425`, `f049fac`, `3e64645` |
| F6a.1–F6b.5 (gate cleanup) | ✅ Committed | `dea449e`..`6303337` |

`git rev-list --count b055c1e..HEAD` = **31** — one atomic commit per task, as required. Verified by
inspection: each commit's file set matches its task's named files.

---

## Discrimination Sensor

**Depth**: P0-full — 11 mutations (4 orchestrator-mandated + 1 trap control + 6 Verifier-chosen).
**Method**: file backup → mutate → run that package's suite → restore → confirm `git diff --quiet`
and zero `MUTANT` markers. The real tree was never committed to, stashed, or checked out.

| # | Site (behavior) | Fault injected | Suite | Result |
| - | --------------- | -------------- | ----- | ------ |
| **M1** | `search-codebase.ts` post-enforcement `results = resultsForContextItems(...)` | Bypass trimming: serialize raw `contextItems` (dropping both `budgetResult.included` and the F5.1 `read-failed` append) | mcp-server | ✅ **KILLED** — 7 failed / 406 passed |
| **M2-trap** | `diagnosticsContent(... estimated: budgetResult.estimatedTokens)` | Report `estimated: 0` | mcp-server | ⚪ Survived — **confirmed dead on this route** (overridden by `measuredFinal` at `search-codebase.ts:1922`). Control only; proves nothing. Documented so a future verifier does not mistake it for a real survivor. |
| **M2** | `search-codebase.ts:1922` `estimated_tokens: measuredFinal` (the site that reaches the response) | Report `0` | mcp-server | ✅ **KILLED** — 7 failed / 406 passed |
| **M3-full** | `search-engine.ts:291` `searchSparse(...)` | Drop `filter` **and** force `limit: 1` | retrieval | ✅ **KILLED** — 3 failed / 323 passed |
| **M3a** | same | Drop `filter` **only** | retrieval | ✅ **KILLED** — 3 failed |
| **M3b** | same | Force `limit: 1` **only** | retrieval | ✅ **KILLED** — 3 failed |
| **M6** | `assembler.ts` `renderText` source-vs-enrichment precedence | Prefer `enrichment.description` over `content` | mcp-server | ✅ **KILLED** — 5 failed / 408 passed |
| **MX1** | `budget.ts` `compactItem` | `text: item.text` — compaction no longer reduces cost | mcp-server | ✅ **KILLED** — 3 failed |
| **MX2** | `search-codebase.ts` `executedBranchesFor` | `return plan.branches` — report planned, not executed | mcp-server | ✅ **KILLED** — 2 failed |
| **MX3** | `search-codebase.ts` `deduplicatedFor` | `return 0` | mcp-server | ✅ **KILLED** — 3 failed |
| **MX4** | `searchCodebaseHandler` contract gate | `void refusal` — bypass the refusal path | mcp-server | ✅ **KILLED** — 8 failed |
| **MX5** | `search-codebase.ts` live-read `catch` | Swallow the error (revert to bare `catch {}`) | mcp-server | ✅ **KILLED** — 4 failed |
| **MX6** | `assertContractGates` | Remove per-collection verdict caching | mcp-server | ✅ **KILLED** — 2 failed |
| **MX7** | `assembler.ts` `renderClassOverview` | Always emit member bodies | mcp-server | ✅ **KILLED** — 3 failed |

**Result**: **11/11 real mutations killed** (M2-trap excluded as a deliberate control) — ✅ PASS

**On the M2 trap.** The orchestrator's warning is confirmed empirically. `search-codebase.ts:1870`
feeds `estimated: budgetResult.estimatedTokens` into `diagnosticsContent`, but line 1922 overwrites
`estimated_tokens` with `measuredFinal` in the spread that builds `responseWithDiagnostics`. Mutating
1870 therefore cannot change the response, and a verifier who stopped there would record a false
survivor. The reaching site (1922) is discriminated by 7 tests.

**On M6's reachability.** The batch's own test guards the trap that let M6 survive iteration 1:
`search-codebase.test.ts:2223` asserts `plan.intent === 'exact_symbol'` for the fixture query
`PaymentService.refund`, and `runExactSymbol` (`:2207`) drives the real keyword-returns-zero
fallthrough to semantic so the assembler's `exact_symbol` branch actually executes. Independently
re-derived: `'refund'` alone classifies conceptual; the qualified form is required. That guard is the
reason M6 is now killable.

---

## Spec-Anchored Acceptance Criteria — the 18 iteration-1 GAPs re-derived

Evidence-or-zero. Every citation was opened and read; assertion expressions are reproduced verbatim.

| Req | Spec-defined outcome | `file:line` + assertion | Result |
| --- | -------------------- | ----------------------- | ------ |
| **EMB-03** | Dimension validated at 4 sites incl. query + hybrid search | Searched `rg "assertDimension\|validateDimension\|dimensionMismatch"` over `packages/retrieval/src`, `packages/vector-store/src` → **zero non-test matches**. Provider-return validation exists (`embedding/src/providers/openai.ts:122` — `if (embedding.length !== this.contract.dimension) throw new EmbeddingResponseError(...)`) but no query/hybrid-time check | ❌ **GAP** (out of batch scope — correctly not credited) |
| **EMB-09** | Contract mismatch **refuses** the search | `search-codebase.test.ts:1928` — `expect(structured(output).status).toBe('refused')` via `makeRealAssert` (`:104`), which calls the production `QdrantVectorStore.initialize()` → `ContractStore.assertSearchable`. Production wiring confirmed at `bin.ts:185` `registerContractGate(...)`. Body asserts collection name, mismatched model, and `ia index --force` | ✅ PASS |
| **CTX-04** | Targeted ranges; whole files not the default | `search-codebase.test.ts:520-555` — reader over a genuine 2000-line file returning exactly the requested slice; `expect(text).toContain('line 100')`, `not.toContain('line 99')`, `not.toContain('line 111')`, `not.toContain('line 2000')`, `expect(readFileFn).toHaveBeenCalledWith('src/payment.ts', 100, 110, undefined)`. The ex-tautology is now genuinely violable | ✅ PASS |
| **CTX-06** (judged against `context.md` decision 3) | Declaration + field block + signatures, **no bodies** | `search-codebase.test.ts:2151` — non-tautology guard `expect(CLASS_SOURCE).toContain('return id;')` then `expect(text).not.toContain('return id;')` and `not.toContain('this.amount = a;')`; `:2141` asserts declaration + both fields + both signatures present. Implementation rewritten to brace-depth tracking (`assembler.ts:207-253`). Killed by MX7 | ✅ PASS |
| **CTX-08** | Expansion evidence defaults to compact form | `search-codebase.test.ts:2385` — `it.each(['dependency','hierarchy','call-chain','adjacent'])` at score 0.95 with a 40 000 budget (so compaction cannot be mistaken for the fix): `expect(text).not.toContain('return EXPANDED_BODY_STATEMENT;')` plus anchor + signature + one-line description present. `assembler.ts:164` selects form by `expansionSource`, not score | ✅ PASS |
| **BUD-01** | ONE budget contract governs **every** route | `search-codebase.test.ts:1623` — `it.each(routes)` enumerating keyword / existence / aggregation / semantic asserts `configured_budget` and a measured `estimated_tokens` on each; `:1673` covers the zero-result fallback route explicitly. All five routes enumerated (L-005 satisfied) | ✅ PASS |
| **BUD-03** | All model-visible context counted | `budget.test.ts:341` — `expect(result.estimatedTokens).toBe(estimateTokens(JSON.stringify(serialize(items))))` and `toBeGreaterThan(itemSum + estimateTokens(OVERHEAD) - 1)`; the fixture's `OVERHEAD` is exactly what an item-level sum cannot see. End-to-end at `search-codebase.ts:1903` measuring the full envelope incl. `finalContent` and diagnostics | ✅ PASS |
| **BUD-05** | Enforcement after the final response is assembled | `budget.ts:177` `enforceSerialized` measures `JSON.stringify(serialize(included))`; `search-codebase.ts:1758` calls it with `serializeForBudget` (the real `buildSearchResponse`). `budget.test.ts:352` asserts pass 1 admits an item the serialized response cannot afford, pass 2 drops it — the precise BUD-05 defect. `void serializedEstimate` is gone | ✅ PASS |
| **BUD-06** | Empty stored payload not costless | `search-codebase.test.ts:1739` — identical fixtures differing only in live-source size yield different governed outcomes; `:1769` "charges live source against a budget too small to hold it". The presence-only assertion is replaced | ✅ PASS |
| **BUD-08** | Overflow **amount** reported | `search-codebase.test.ts:1527` — `expect(s.exact_node_overflow_configured).toBe(1_500)`, `expect(s.exact_node_overflow_amount).toBe(estimated - 1_500)`, `expect(s.estimated_tokens).toBe(estimated)`, plus prose `expect(body(output)).toContain('Exact node exceeded the configured budget.')` and BUD-09 completeness `toContain('UNIQUE_BODY_0_LINE')`. `:1557` asserts the fields are **absent** when no overflow | ✅ PASS |
| **BUD-10** | Lower-priority evidence deterministically compacted | `budget.test.ts:204` — `expect(result.compacted).toBe(1)`, `expect(compacted?.text).toBe('src/lower.ts:10-20 (loadPayment)\nfunction loadPayment(id: string)')`, `expect(estimateItem(compacted!)).toBeLessThan(estimateItem(lower))`; `:216` asserts omit-not-compact when compaction would not help; `:243` bounds the signature head. Killed by MX1 | ✅ PASS |
| **BUD-12** | Token metadata describes the **final serialized response** | `search-codebase.test.ts:1481` — `expect(Math.abs(reported - estimateTokens(JSON.stringify(output)))).toBeLessThanOrEqual(Math.ceil(measured * 0.25))` and `toBeGreaterThanOrEqual(Math.ceil(JSON.stringify(output).length / 4) * 0.5)`. Killed by M2 | ✅ PASS |
| **BUD-16** | Existence/aggregation source-free **and** budget-accounted | `diagnostics.test.ts:138,151` — asserted against a **non-empty** engine: `expect(result().content).toBe('function loadPayment() {}')` then `expect(text).not.toContain('function loadPayment() {}')`, `not.toContain('```')`, plus `estimated_tokens > 0`. Also `search-codebase.test.ts:1706` `it.each` for both routes. The iteration-1 `engine([])` vacuity is closed | ✅ PASS |
| **FAIL-04** | Unretrievable code → state failure + best grounded anchor | `search-codebase.test.ts:2643` — `expect(body(output)).toContain('EACCES: permission denied')`, `toContain('src/unreadable.ts:40-60')`, `expect(results[0]).toMatchObject({ file: 'src/unreadable.ts', read_failed: true })`; `:2658` `status === 'low_confidence'` + `[read-failed]` marker + `selected_count === 1` (not omitted); `:2706` overflow rule **not** invoked for an unreadable top node. Killed by MX5 | ✅ PASS |
| **FAIL-07** | Failure info compact **and** cost accounted | `diagnostics.test.ts:459,470,486` — `refused`, `unavailable` and plan-failure each assert `estimated_tokens > 0` **and** `>= measuredCost(output)` (conservative, BUD-13); `:495` pins the compactness ceiling `toBeLessThanOrEqual(256)` — a pinned ceiling, not "exists" | ✅ PASS |
| **ENR-01** | Enrichment survives to MCP structured output | `search-codebase.test.ts:2512` — `expect(item?.enrichment).toEqual({ description, businessContext, semanticTags, relationships, enrichmentModel, enrichedAt })` on `structuredContent.results`; `:2527` asserts it stays **out** of the prose body for a source-carrying result (`context.md` decision 5) | ✅ PASS |
| **ENR-04** | Expansion results default to compact form | Same as CTX-08 — `search-codebase.test.ts:2385`, form driven by `expansionSource` (`assembler.ts:164`), not score; `:2413` confirms a direct high-confidence result still carries source (ENR-05) | ✅ PASS |
| **ENR-07** | Enrichment never substitutes required exact source | `search-codebase.test.ts:2234` (exact_symbol, guarded by the `:2223` intent assertion) and `:2253` `it.each([0.95, 0.5])` on the conceptual path: `toContain('return ledger.reverse(id);')` + `not.toContain(ENRICHED_DESCRIPTION)`; `:2274` degrades to a **marked** `[signature]` when source is genuinely absent. Killed by M6 | ✅ PASS |

**17 of 18 GAPs closed. EMB-03 remains open and is correctly excluded from the batch's scope.**

### Additional iteration-1 functional gaps — re-derived

| Gap (iteration 1) | Iteration 2 status | Evidence |
| ----------------- | ------------------ | -------- |
| Contract never persisted / never checked (headline WS1 failure, L-006) | ✅ Closed | Production persist: `indexer/src/pipeline.ts:703-709` passes `embeddingProvider.contract` + `indexGeneration` to `initialize()`. Production assert: `mcp-server/src/bin.ts:185` `registerContractGate` → `vectorStore.initialize({ embeddingContract })`. Refusal is a **successful** tool result with `status: 'refused'` (`search-codebase.ts:360-367`), reached at `:1129` before any retrieval. Startup **warns** and stays up (`bin.ts:209 warmContractGates`, "never throws" per D-2). Killed by MX4 |
| `deduplicated_count` hardcoded `0` | ✅ Closed | `search-codebase.ts:317` real accumulator; `diagnostics.test.ts:292` `expect(structured.deduplicated_count).toBe(2)` (exact), `:302` `toBe(0)`, plus cross-collection `:314` and overlapping-range `:328` classes. Killed by MX3 |
| Failure responses carried 0/13 diagnostics fields | ✅ Closed | `diagnostics.test.ts:364,374,394` — `diagnosticKeysOf(output)` deep-equals all 13 `DIAGNOSTIC_KEYS` on `unavailable`, `refused`, and plan-failure |
| `executed_branches = plan.branches` | ✅ Closed | `search-codebase.ts:277` `observedBranches` WeakMap fed by `onBranchExecuted` at the point each call is issued (`search-engine.ts:266,289,298`). `diagnostics.test.ts:194` asserts a **planned-but-skipped** sparse branch is excluded while `:212` asserts an executed-with-zero branch **is** reported — the two states distinguishable on the serialized response. Killed by MX2 |
| Read failure swallowed by bare `catch {}` | ✅ Closed | `search-codebase.ts:1708-1714` records the failure; `:1725` marks the item `read-failed`; `:1767-1774` still returns its grounded anchor. Killed by MX5 |
| `signatureOnly` never reached the response | ✅ Closed | `search-codebase.test.ts:2556` — `expect(body(output)).toContain('[signature-only]')` and `signature_only === true` in `structuredContent.results`; `:2576` asserts absence for a normal chunk |
| Compaction structurally unreachable | ✅ Closed | `budget.ts:286 compactItem` renders `renderCompactText`; keystone asserts the **exact** `compaction_count: 1` (`search-codebase.test.ts:1850`), not `toBeGreaterThan(0)`. Killed by MX1 |
| Sparse-branch filter/limit unasserted (M3) | ✅ Closed | `search-engine.test.ts:1146` pins the **exact** filter object (`must: [{key:'repoId',...}]`, `must_not` test + contract exclusions) and the **computed** limit `21`; `:1159` a two-repo same-path fixture with a filter-honouring fake store proves no cross-repo leakage. Killed by M3/M3a/M3b |
| Zero-vector fakes eliminated | ✅ Still true | Re-confirmed: `rg "new Array\(|\.fill\(0\)|Array\(dimension"` over non-test source returns zero matches |

### Carried-forward spec-precision gaps (18) — none new

`QP-04` (two query-text classifiers survive outside the plan: `mmr.ts:72 classifyQueryLambda` used at
`search-engine.ts:340,964`; `templates/intent-detector.ts:42 detectIntent` used at
`search-codebase.ts:1131`), `CTX-01`, `CTX-03`, `CTX-10`, `CTX-13`, `CTX-14`, `BUD-07`, `BUD-09`,
`ENR-03`, `ENR-06`, `FAIL-03`, `SPR-09`, `SPR-11`, `FLT-02`, `FLT-06`, `A-04`, `DOC` drift residue,
indexer packing over-rejection. All were outside the batch's declared scope
(`fix-tasks.md:70-83`) and none regressed. Independently re-verified as **genuinely still open, not
silently "fixed"**:

- **FLT-02** — `rg "scrollForHierarchy|scrollByName|scrollForImplementations|scrollByDefines"` over
  `packages/vector-store/src/qdrant.ts` returns **zero matches**: still no production implementation.
- **FLT-06 (`getNeighborFiles`)** — `dependency-graph.ts:221` still reads `void filter;`.
- **A-04** — `qdrant.ts:391` still reports `filterOnly: false` while the adapter implements it.
- **Indexer packing over-rejection** — unchanged; accounted for, not a silent drop.

---

## Test Integrity

### D-7 deletions (25 tests) — audited, all legitimate

`git show 3e64645` (24 tests) and `git show f049fac` (1 placeholder). Every deleted test's production
referent was independently confirmed absent from the current tree
(`rg` over all of `packages`, non-`node_modules`):

| Deleted symbol | Production referents found now | Verdict |
| -------------- | ------------------------------ | ------- |
| `mergeOverlaps` | 0 | ✅ genuinely dead |
| `BudgetGovernor.enforceUnlimited` | 0 | ✅ |
| `reserveDiagnostics` | 0 | ✅ |
| `ResolvedBudget.diagnosticsReserve` | 0 | ✅ (duplicated `DIAGNOSTICS_RESERVATION = 256`, still pinned by a kept test) |
| `tools/adaptive-budget.ts` / `classifyBudget` | 0 | ✅ — the 8000/20000/40000 tiers live on in the planner's `adaptiveBudget()`, still asserted at `query-planner.test.ts:289,296` |
| `candidateLimits.{expansion,semanticPrefetch,signaturePrefetch,sparsePrefetch}` | 0 (`retrieval` correctly kept — live caller `search-engine.ts:248`) | ✅ |
| `UnlimitedBudgetResult` | 0 | ✅ |
| `search-engine-threshold.test.ts` placeholder | was `expect(true).toBe(true)`; claimed replacement coverage verified present at `multi-collection-search-engine.test.ts:120-132` | ✅ |

**One requirement-coverage question examined closely and resolved in the batch's favour.**
`plan.lexical.{terms,quotedTerms,pathTerms}` were removed from the emitted `QueryPlan`, and QP-03
requires the plan to "derive normalized lexical terms, exact symbols, quoted identifiers, package and
path terms". The removal is **not** a coverage loss: the planner still derives all of them internally
(`query-planner.ts:135 extractLexicalEvidence`, fields `terms`/`quotedTerms`/`pathTerms` at `:120,273,326`)
and they still reach the sparse channel — `query-planner.ts:142-146` folds
`quotedTerms`/`pathTerms` into the sparse vector, and the replacement assertion at
`query-planner.test.ts:178-186` pins that behaviourally
(`expect(result.representations.sparse).toEqual(buildSparseVector(['com.example.payments','src/payments/PaymentService.ts']))`).
The deletion removed *unread emitted fields*, not derivation. Judged legitimate. Test count did not
drop: retrieval **321 → 326**, mcp-server **352 → 413**, total **1804 → 1878**.

### The 9 iteration-1 shallow assertions — each re-checked

| Original site | Iteration-2 state | Verdict |
| ------------- | ----------------- | ------- |
| `search-codebase.test.ts:419` `not.toContain('line 2000')` tautology | Now runs against a real 2000-line file whose reader returns only the requested slice; boundary lines 99/111 also asserted absent | ✅ Strengthened (violable) |
| `budget.test.ts:216-218` conditional `if (compacted) expect(...)` | Unconditional: `expect(result.compacted).toBe(1)` + exact compacted text + `estimateItem` reduction | ✅ |
| `diagnostics.test.ts:126,132` BUD-16 against `engine([])` | Non-empty engine; fixture content asserted present then asserted absent from the body | ✅ |
| `search-codebase.test.ts:258-263` "trims results" asserting only `matchCount > 0` | Now `estimated_tokens <= 6000` **and** `estimateTokens(all candidate content) > 6000` — the trim provably mattered | ✅ |
| `query-planner.test.ts:115-116` `string` vs `SparseVector` | Like-type comparisons; sparse compared to `buildSparseVector(...)` | ✅ |
| `search-engine.test.ts:1110-1113` `expect.any(Number)`, filter unasserted | Exact filter object + exact computed limit `21` + two-repo isolation test | ✅ |
| `search-engine-threshold.test.ts:315` `expect(true).toBe(true)` | Removed per D-7; replacement coverage verified to exist | ✅ |
| `input-budgeter.test.ts:80-81` `.every()` over an asserted-empty array | Fixture whose first input alone exceeds `maxRequestTokens`; author states mutation-verified | ✅ |
| `index.command.test.ts:195` `exitCode).toBeUndefined()` | `exitCode === 0` | ✅ |

### New shallow assertions introduced by the batch — scanned, none found

- No `expect(true).toBe(true)` / `expect(1).toBe(1)` added.
- No conditional assertions added (the two `if (...)` hits in the diff are fixture-construction
  branches inside mock implementations, not assertion guards).
- Every added `toBeGreaterThan(0)` (15) was inspected: each is a **secondary** liveness check
  alongside a primary exact or bounded assertion (e.g. `estimated_tokens > 0` immediately followed by
  `>= measuredCost(output)` or a `Math.abs(reported - measured) <= …` bound). Where the spec pins an
  exact value, an exact assertion is present — `compaction_count: 1`, `omitted_count: 7`,
  `selected_count: 1`, `deduplicated_count: 2`, `candidate_count: 6`,
  `exact_node_overflow_configured: 1500`, sparse `limit: 21`.
- Absence assertions are all preceded by a non-tautology guard proving the fixture genuinely contains
  the string (`expect(CLASS_SOURCE).toContain('return id;')`, `expect(EXPANDED_BODY).toContain(...)`,
  `expect(WITH_IMPORTS).toContain(...)`, `expect(result().content).toBe(...)`).
- No `.skip` / `.todo` / `.only` added; the single pre-existing indexer skip remains.

### Serialized-Response Rule — the highest-value check

Confirmed honored. Sampled every `mcp-server` requirement re-worked by the batch; all read the
serialized response. Remaining `expect(result.included…)` assertions in `budget.test.ts` are **unit
tests of `BudgetGovernor` itself** (a legitimate layer whose contract *is* the intermediate object),
and each is paired with an end-to-end serialized assertion in `search-codebase.test.ts` for the
requirement it serves. `budget.test.ts:316-432` (`enforceSerialized`) asserts on the serialized
string/body via `bodyOf(result.response)`. No requirement about caller-visible behavior rests on an
intermediate object alone.

---

## Gate Check — measured by the Verifier

Measured with `npx turbo <task> --continue` (never plain `pnpm`, which short-circuits at the first
failing package — the iteration-1 mis-measurement).

| Gate | Command | Result |
| ---- | ------- | ------ |
| build | `npx turbo build` | ✅ **14/14 tasks successful**, exit 0 |
| typecheck | `npx turbo typecheck --continue` | ✅ **0 errors**, 24/24 tasks successful, exit 0 |
| lint | `npx turbo lint --continue` | ❌ exit 1 — **exactly 1 error**, 13/14 tasks successful |
| test | `npx turbo test --continue --force` | ✅ **1878 passed, 0 failed, 1 skipped**, exit 0 |

**The single lint error** is `packages/benchmark/src/benchmark-runner.test.ts:273` —
`'callCount' is assigned a value but never used  @typescript-eslint/no-unused-vars`. Verified:

- It is the **only** finding in the entire monorepo — every other package reports zero.
- `packages/benchmark` is **untouched across the whole feature**: `git diff --name-only fab0016..HEAD | rg 'packages/benchmark'` → **0 files**, satisfying `spec.md:950`.
- **No eslint ignore was added** to hide it: no `.eslintignore`/`ignorePatterns` change for benchmark
  appears in the diff, and `@ia-framework/benchmark#lint` still runs and still reports the error.

This is decision **D-5**, honored exactly as written.

**Per-package test counts**: core 205, observability 43, embedding 64, project-detector 23,
vector-store 88, db-context 17, ast-parser 175, retrieval 326, benchmark 86, indexer 257 (+1 skipped),
dashboard-api 92, cli 89, mcp-server 413. The one skip is the pre-existing indexer streaming timeout
documented at T17 — still skipped, not deleted.

**Suppression audit (F6, ~451 mechanical fixes across 10 packages)**: `git diff b055c1e..HEAD -- packages`
shows **zero added** `eslint-disable` / `@ts-ignore` / `@ts-expect-error`, **zero** `: any` or `as any`
introduced, and **9 pre-existing directives removed** by fixing their underlying cause. The three
self-declared runtime-touching edits were read and are behavior-preserving:

1. `index-database-schema.ts` — `config.targetProjectPath ?? config.repos?.[0]?.path ?? dirname(configPath)`; DB-only indexing sets `excludePatterns: ['**/*']` so the path is a base only. Same edit pattern in `cli/benchmark.command.ts` (CLI code that *invokes* benchmark; not under `packages/benchmark`).
2. `search-engine.ts` unbound-method fixes — `vectorStore.scroll.bind(vectorStore)` (explicitly *fixes* a latent `this` bug rather than introducing one), `typeof x === 'function'` in place of `Boolean(x)`, `async () => []` → `() => Promise.resolve([])`. Also removed `const seenIds = …` at old `:602`, which I confirmed via `git show b055c1e:` was assigned and **never read**.
3. `&&` → `if` for `logClassification` and `typeof observability.logger?.info === 'function'` replacing an `any` cast — identical short-circuit semantics.

---

## `.specs/STATE.md` Integrity

✅ Intact. `git diff b055c1e..HEAD -- .specs/STATE.md` touches **only** the `## Handoff` body: the diff
contains no `+`/`-` line matching `## Decisions`, `## Handoff`, or `AD-00*`. All five decisions
(AD-001..AD-005) are present and unmodified at `STATE.md:12,27,41,56,71`.

## No Self-Certification

✅ Confirmed for the *previous* revision of this file: it retained the iteration-1 ❌ FAIL verdict, an
explicit "the fix batch's author does not certify their own work" note, and marked every reworked
requirement 🔧 **Addressed — pending verification** — never ✅ Verified. No row was self-promoted. The
PASS verdict at the top of this document is issued by the independent Verifier.

---

## Code Quality

| Principle | Status |
| --------- | ------ |
| Minimum code | ✅ Dead abstractions removed (D-7, audited above); `stageHook` retained with a documented reason (only evidence for CTX-02 ordering) |
| Surgical changes | ✅ Diff confined to the named packages; `packages/benchmark` untouched |
| No scope creep | ✅ Out-of-scope items documented, not silently touched |
| Matches patterns | ✅ Error classes, mock-client and co-located test conventions followed |
| Spec-anchored outcome check | ✅ 93/112 match; 1 documented out-of-scope GAP; 18 carried-forward precision gaps |
| Per-layer Coverage Expectation met | ✅ `mcp-server` assertions read the serialized response |
| Every test maps to a requirement | ✅ Added tests cite requirement IDs; removals justified under Check C |
| Documented guidelines followed | ✅ `.specify/memory/constitution.md`, `.planning/codebase/CONVENTIONS.md` |

---

## Edge Cases

- [x] Native dimension == configured while param unsupported → proceeds, validates length
- [x] Fewer embeddings than inputs → error, not positional shift
- [x] Out-of-order response data → re-sorted by `data[].index`
- [x] Empty/whitespace input → never sent as `''`
- [x] Colliding sparse terms → weights summed
- [x] Batch total exceeds request limit, no individual does → repacked
- [x] Cancellation between embed and upsert → no point written
- [x] Filter-only zero matches → empty, no similarity fallback
- [x] Multi-page file chunks → all returned in deterministic order
- [x] Same path in multiple repos → attributed per repository
- [x] Budget `0` = unlimited (`budget.test.ts:424`); negative/non-numeric = configuration error
- [x] Indivisible oversized construct → signature-only fallback with full range preserved
- [x] **Empty sparse vector → reported as skipped, not executed-with-zero** — `diagnostics.test.ts:194` vs `:212` (was ❌)
- [x] **Unreadable selected range → anchor+metadata, marked** — `search-codebase.test.ts:2658` (was ❌)
- [x] **Exact top node unreadable → overflow rule not invoked, failure reported** — `:2706` (was ❌)
- [x] **Unknown-contract collection refuses** — `:1948` from real wiring (was ❌)
- [ ] **Budget smaller than the diagnostics themselves → reduction visible** — the fixed 256-token reservation is asserted (`budget.test.ts`), but no test drives a budget below it to observe a *visible deterministic reduction*. Carried-forward precision gap, not a regression.
- [ ] **1–2 character query** — tokenizer preserves the term; still no end-to-end assertion. Carried forward.

---

## Requirement Traceability Update

| Requirement group | Iteration 1 | Iteration 2 (verified) |
| ----------------- | ----------- | ---------------------- |
| EMB-01,02,04,05,06,07,08,10,11 | ✅ Verified | ✅ **Verified** (EMB-08 now genuinely persisted at index time) |
| EMB-09 | ❌ Needs Fix | ✅ **Verified** — refusal reachable from real wiring, `status:'refused'`, successful tool result |
| EMB-03 | ❌ Needs Fix | ❌ **Needs Fix** — out of batch scope; carry to a follow-up |
| SPR-01..SPR-11 | ✅ (SPR-03 weak — M3 survived) | ✅ **Verified** — SPR-03/SPR-06 now discriminating; M3 killed 3 ways |
| FLT-01,03,04,05,07,08,09,10,11,12,13 | ✅ Verified | ✅ **Verified** (unchanged) |
| FLT-06 | ⚠️ Precision gap | ✅ **Verified** for the sparse path; `getNeighborFiles` filter remains a documented out-of-scope gap |
| FLT-02 | ⚠️ Precision gap | ⚠️ Documented out-of-scope architectural gap (confirmed unimplemented) |
| INP-01..INP-11 | ✅ Verified | ✅ **Verified** (unchanged) |
| QP-01..QP-03, QP-05..QP-13 | ✅ Verified | ✅ **Verified** |
| QP-04 | ⚠️ Precision gap | ⚠️ Unchanged — two classifiers survive outside the plan |
| ENR-01, ENR-04, ENR-07 | ❌ Needs Fix | ✅ **Verified** — M6 killed; enrichment in `structuredContent` only |
| ENR-02, ENR-05, ENR-08, ENR-09 | ✅ / ⚠️ | ✅ **Verified** |
| ENR-03, ENR-06 | ⚠️ Precision gap | ⚠️ Unchanged |
| CTX-04, CTX-06, CTX-08 | ❌ Needs Fix | ✅ **Verified** — CTX-06 judged against `context.md` decision 3 |
| CTX-02,05,07,09,11,12,15,16 | ✅ Verified | ✅ **Verified** |
| CTX-01,03,10,13,14 | ⚠️ Precision gap | ⚠️ Unchanged |
| BUD-01,03,05,06,08,10,12,16 | ❌ Needs Fix | ✅ **Verified** — M1, M2, MX1 killed |
| BUD-02, BUD-04, BUD-11, BUD-13, BUD-14, BUD-15 | ✅ / ⚠️ | ✅ **Verified** — real `deduplicated_count`, honest `executed_branches`, 13 fields on every route |
| BUD-07, BUD-09 | ⚠️ Precision gap | ⚠️ Unchanged |
| FAIL-04, FAIL-07 | ❌ Needs Fix | ✅ **Verified** — MX5 killed |
| FAIL-01, FAIL-02, FAIL-05, FAIL-06, FAIL-08 | ✅ / ⚠️ | ✅ **Verified** |
| FAIL-03 | ⚠️ Precision gap | ⚠️ Unchanged |
| DOC-01..DOC-04 | ✅ (with drift) | ✅ **Verified** — drift removed; documented claims now describe shipped behavior |
| OPS-01, OPS-02 | ⏭️ Deferred (P3) | ⏭️ Deferred |

---

## Summary

**Overall**: ✅ **Ready**

**Spec-anchored check**: 93/112 ACs match the spec-defined outcome · **1 GAP** (EMB-03, out of scope) ·
18 carried-forward precision gaps, none new
**Sensor**: 11 real mutations injected, **11 killed, 0 survived** — M1 ✅, M2 ✅, M3 ✅ (×3 variants), M6 ✅
**Gate**: build ✅ · typecheck ✅ 0 errors · lint ❌ exactly 1 (documented D-5, `packages/benchmark`
untouched, no ignore added) · test ✅ 1878 passed / 0 failed / 1 pre-existing skip
**Test integrity**: 25 D-7 deletions audited — all genuinely dead, zero production referents; test
count **rose** 1804 → 1878; 9 shallow assertions strengthened; **no new shallow assertions**; no
suppressions added, 9 removed

**What is now genuinely verified (and was not in iteration 1)**:

1. **The budget governs the model-visible serialized response, on all five routes.** M1 — removing
   trimming — now breaks 7 tests. `enforceSerialized` measures `JSON.stringify` of the real response,
   re-trims from the BUD-07 ladder, and re-serializes exactly once (D-1, `passes ≤ 2` asserted). The
   feature's central defect is demonstrably fixed.
2. **`estimated_tokens` describes the real string** and never under-reports (BUD-13 margin pinned at 0).
3. **Compaction genuinely reduces cost**, with an exact `compaction_count: 1` asserted.
4. **The embedding contract is wired end-to-end** — persisted by `indexer/pipeline.ts`, asserted by
   `mcp-server/bin.ts`, refused per-request as a successful `status:'refused'` result, cached per
   collection, warned (not `exit(1)`) at startup.
5. **Enrichment reaches the model without displacing exact source**, and `signatureOnly` is visible.
6. **Cross-repo isolation on the sparse branch is discriminating** — exact filter and computed limit
   pinned, plus a two-repo same-path fixture.
7. **Diagnostics are honest** — executed (not planned) branches, real dedup count, all 13 fields on
   every route including failures, with failure cost measured and capped.

**Residual work (not blocking this verdict — follow-up features)**:

1. **EMB-03** — dimension validation at query and hybrid search sites. Explicitly out of this batch's
   scope; the only remaining confirmed GAP.
2. **FLT-02 / FLT-06(`getNeighborFiles`) / A-04 / indexer packing over-rejection** — pre-existing
   architectural gaps, documented at `fix-tasks.md:70-83`, confirmed unchanged.
3. **QP-04** — `classifyQueryLambda` and `detectIntent` still classify query text outside the plan.
4. **Two edge cases** without end-to-end assertions: budget-below-diagnostics reduction visibility,
   and the 1–2 character query.
5. **D-5's single lint error** in `packages/benchmark` — resolvable only by relaxing the spec's
   no-modify constraint on that package.

**Next step**: the iteration-2 pass condition is met — all four previously-surviving mutants are
killed and 17 of 18 confirmed GAPs are closed, with the 18th (EMB-03) correctly out of scope.
Surface `/delivery 019-rag-correctness-exact-context` for the user's authorization. Do not run it
automatically.

---
---

# Historical — Iteration 1 (2026-08-12, FAIL)

*Preserved unchanged for the audit trail. Superseded by the iteration-2 verdict above.*

**Date**: 2026-08-12
**Diff range**: `fab0016..16cb011` (51 commits)
**Verifier**: independent sub-agents (author ≠ verifier), 3 scoped workstream verifiers + orchestrator-run
discrimination sensor.

**Verdict (iteration 1)**: ❌ **FAIL** — do not proceed to delivery.

## Iteration-1 Spec-Anchored Acceptance Criteria

| Scope | Requirements | ✅ PASS | ❌ GAP | ⚠️ Spec-precision gap |
| ----- | ------------ | ------ | ----- | -------------------- |
| WS1–WS3 (EMB, SPR, FLT) | 35 | 22 | 2 | 11 |
| WS4–WS6 (INP, QP, ENR) | 33 | 25 | 3 | 5 |
| WS7–WS9 + P2 (CTX, BUD, FAIL, DOC) | 44 | 18 | 13 | 13 |
| **Total** | **112** | **65** | **18** | **29** |

### Iteration-1 confirmed GAPs (18)

| Req | Spec-defined outcome | Actual | Evidence |
| --- | -------------------- | ------ | -------- |
| EMB-03 | Dimension validated at 4 sites incl. query + hybrid search | Only provider-return + pre-upsert validate | no query/hybrid validation exists in source |
| EMB-09 | Contract mismatch **refuses** the search | Refusal unreachable — `assertSearchable` has one caller, never reached with a contract | `vector-store/src/qdrant.ts:321` |
| CTX-04 | Targeted ranges, whole files not default | Tautological assertion only | `search-codebase.test.ts:419` |
| CTX-06 | Class overview = declaration + fields + signatures, **no bodies** | Body statements emitted | `context/assembler.ts:186` |
| CTX-08 | Expansion evidence defaults to compact form | Full body rendered | `context/assembler.ts:138` |
| BUD-01 | ONE budget contract governs **every** route | Only the semantic route is enforced | keyword `:850`, existence `:895`/`:910`, aggregation `:999` all return before `enforce` at `:1288` |
| BUD-03 | All model-visible context counted | Only `item.text` + 4 anchor fields counted | `context/budget.ts:187-197` |
| BUD-05 | Enforcement after the final response is assembled | Serialized measurement computed then discarded | `search-codebase.ts:1284-1285` `void serializedEstimate;` |
| BUD-06 | Live source not treated as costless | Presence-only assertion | `search-codebase.test.ts:397` |
| BUD-08 | Overflow **amount** reported | Only the boolean reaches the response | `context/diagnostics.ts:66`, `search-codebase.ts:1379` |
| BUD-10 | Lower-priority evidence deterministically compacted | Compaction is a structural no-op | `context/budget.ts:158-167` |
| BUD-12 | Token metadata describes the **final serialized response** | Reports the item-level sum | `search-codebase.ts:1380` |
| BUD-16 | Existence/aggregation source-free **and** budget-accounted | Source-free asserted only on empty responses | `context/diagnostics.test.ts:126,132` |
| FAIL-04 | Unretrievable code → state failure + best grounded anchor | Path unreachable | bare `catch {}` at `search-codebase.ts:1262-1264` |
| FAIL-07 | Failure info compact **and** its cost accounted | Failure responses report no `estimated_tokens` | `search-codebase.ts:234-245` |
| ENR-01 | Enrichment survives to MCP structured output | Never reaches `content[].text` or `structuredContent` | only `assembler.ts:136,139` |
| ENR-04 | Expansion results default to compact form | Form chosen by score only | `context/assembler.ts:138` |
| ENR-07 | Enrichment never substitutes for required exact source | Fallback chain permits substitution | `context/assembler.ts:136` |

## Iteration-1 Discrimination Sensor

| # | File:line | Fault injected | Killed? |
| - | --------- | -------------- | ------- |
| M1 | `search-codebase.ts:1290` | Bypass budget trimming | ❌ **SURVIVED** (352/352 passed) |
| M2 | `search-codebase.ts:1380` | Report `estimated: 0` | ❌ **SURVIVED** |
| M3 | `retrieval/search-engine.ts:284` | Drop sparse repo filter + force `limit: 1` | ❌ **SURVIVED** |
| M4 | `vector-store/filter-only.ts:49` | Force `truncated: false` | ✅ Killed |
| M5 | `retrieval/bm25-reranker.ts:90` | Lowercase-before-split tokenizer | ✅ Killed |
| M6 | `context/assembler.ts:136` | Prefer enrichment over exact source | ❌ **SURVIVED** |
| M7 | `context/budget.ts:163` | `compactEstimate = 0` | ✅ Killed |

**Result**: 3/7 killed, **4 survived** — ❌ FAIL

## Iteration-1 shallow assertions identified

`search-codebase.test.ts:419`, `budget.test.ts:216-218`, `diagnostics.test.ts:126,132`,
`search-codebase.test.ts:258-263`, `query-planner.test.ts:115-116`, `search-engine.test.ts:1110-1113`,
`__tests__/search-engine-threshold.test.ts:315`, `input-budgeter.test.ts:80-81`,
`index.command.test.ts:195`.

## Iteration-1 gate check

build ✅ · test ✅ 1804 passed / 0 failed / 1 skipped · typecheck ❌ (recorded 23 — the true total,
measured later with `turbo --continue`, was 57) · lint ❌ (recorded 3 — true total 394).

## Iteration-1 fix plans (1–9)

Fix 1 enforce the budget on the serialized response on every route (BLOCKER) · Fix 2 make compaction
reduce tokens (BLOCKER) · Fix 3 wire the embedding contract into index and query paths (BLOCKER) ·
Fix 4 assert the sparse branch's filter and limit (MAJOR) · Fix 5 stop enrichment substituting for
exact source; compact expansion evidence (MAJOR) · Fix 6 report executed branches, real dedup count,
diagnostics on failure responses (MAJOR) · Fix 7 class overview must omit bodies; imports must not
leak (MAJOR) · Fix 8 surface read failures; remove dead abstractions (MINOR) · Fix 9 strengthen the 9
shallow assertions (MAJOR).

All nine were routed into the 31-task iteration-2 batch (`fix-tasks.md`) and are verified closed above,
except EMB-03, which was explicitly excluded from that batch's scope.
