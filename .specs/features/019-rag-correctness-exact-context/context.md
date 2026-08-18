# RAG Correctness, Deterministic Query Planning, and Exact Token-Efficient Context Delivery — Context

**Gathered:** 2026-08-07
**Spec:** `.specs/features/019-rag-correctness-exact-context/spec.md`
**Status:** Ready for design

---

## Feature Boundary

Make the existing RAG design **actually hold** across nine workstreams: enforce the embedding
contract (WS1), implement real sparse retrieval (WS2), replace zero-vector fakes with Qdrant
filter primitives (WS3), make embedding input safe (WS4), compute one deterministic query plan
(WS5), propagate index-time enrichment to the model (WS6), return smallest-sufficient exact
source (WS7), move the token budget to the final serialized response (WS8), and make failures
actionable (WS9).

Unchanged: the three-tool MCP surface, Qdrant as the store, the lean-payload constraint,
`get_file` path-only semantics, and everything in the spec's Out of Scope table (notably
`packages/benchmark`, evaluation metrics, and LLM query rewriting).

**What this discussion did NOT do:** no requirement was added, removed, or widened. Every
decision below picks *how* an already-required behavior manifests. Where a decision implies a
new observable property, it is recorded as a spec assumption (A-27..A-29) rather than smuggled
in as scope.

---

## Implementation Decisions

### 1. Existing-index migration posture (closes the "unknown embedding contract" edge case)

- A collection with **no persisted embedding contract** (indexed before this feature) puts the
  system in an explicit *unknown-contract* state, and a search against it is **refused**. The
  refusal names the collection and the remediation command (`ia index --force`).
- Rationale: consistent with EMB-09/A-13's refuse-don't-degrade posture. Inferring the contract
  from declared vector dimensions was explicitly rejected — it would silently assume the prefix
  pair matched, which is the exact silent-asymmetry defect this feature exists to remove.
- **A mandatory one-time full re-index is acceptable** for every existing collection. Design does
  not need a backward-compatibility branch for pre-contract indexes; it needs a clear error that
  names the command.
- **Missing payload indexes are treated differently** from the embedding contract: they are
  **auto-added on startup without prompting**, because index creation is additive and safe
  (FLT-09 already requires it be non-destructive). Successful creation is silent.
- Boundary that must not be blurred: "silent" applies to **success only**. FLT-08 still requires
  a payload-index creation *failure* to be reported, never swallowed.
- `ia index -f, --force` already exists (`packages/cli/src/commands/index.command.ts`), so the
  remediation message references a real flag rather than a new one.

### 2. Refusal and degradation at the MCP boundary

- A refused search or unavailable retrieval infrastructure is returned as a **normal successful
  tool result whose body states the failure, its cause, and the remediation**, plus a
  machine-readable status field. It is **not** raised as an MCP protocol error.
- Rationale: a protocol error frequently reaches a consuming agent as an opaque "tool failed"
  wrapper, which is precisely what pushes it back to `grep` — the behavior this feature exists to
  eliminate. A readable body with a status field is actionable.
- FAIL-06's states are carried by a **closed enum**: `ok | empty | low_confidence | unavailable |
  refused`. Small, closed, and machine-branchable; a boolean `degraded` + free text was rejected
  because it cannot distinguish "nothing matched" from "the index is down".
- Failure responses **state the failure and its remediation and do not endorse a shell fallback**,
  so CTX-09's promise holds on the failure path too.
- **Recorded tension (deliberate, not an oversight):** when Qdrant is genuinely unreachable the
  framework cannot answer at all. The rule is therefore *"state the failure and the remediation;
  do not endorse shell fallback — and do not claim the framework can still answer."* The response
  must not imply an answer is available. It simply declines to recommend `grep`. Design must not
  resolve this by silently returning unrelated evidence (FAIL-02).

### 3. Shape of "smallest sufficient" context (WS7 — what the model literally sees)

**Exact-symbol query** (e.g. `getUserById`):
- Return the **method/function node plus its doc comment and annotations**, and the anchor.
- Rationale: annotations and doc comments frequently carry the behavioral contract
  (`@Transactional`, `@Nullable`, documented nullability/throws) that changes how the method
  behaves. Omitting them produces a technically-complete body that still misleads.
- No enclosing-class breadcrumb is emitted: CTX-10's mandatory anchor already carries repo,
  path, symbol and line range, so location is never ambiguous.
- **Range definition (feeds CTX-03 and CTX-14):** the smallest sufficient range for such a match
  is `[min(docCommentStart, annotationStart, methodStart) .. methodEnd]`. Overlap detection and
  deterministic merging operate on these **expanded** ranges, not on bare method bodies.

**Class-level query** (e.g. "what is an Entry?"):
- Class declaration line including `extends`/`implements`, then the field block, then the
  **signatures** of methods with **no bodies**. Bodies appear only for members the query
  specifically implicates.
- Rationale: this mirrors the token-efficient pattern the project already prescribes in
  `AGENTS.md`, and directly answers the worked example that motivated it.

**Conceptual query** (e.g. "how are payments retried?"):
- Ranked chunks with **bodies for the highest-priority matches and signature-or-summary for the
  remainder**, ordered by score, until the budget is spent. Depth at the top of the ranking,
  breadth below it.
- Rationale: consistent with the BUD-07 priority ladder — this is that ladder applied to a
  single route rather than a separate policy.

**Imports / file header:**
- The import block is included **only for dependency-oriented queries**; never on the ordinary
  search path.
- Rationale: high-token, low-signal for most queries, and `get_dependencies` already exposes the
  edge graph. When the query *is* about wiring, imports are the answer, so blanket exclusion
  would be wrong.

### 4. Diagnostics visibility and placement

- All 13 BUD-15 fields live in **`structuredContent` only**. The prose body stays pure evidence.
- The **full set appears on every response, on every route** — including existence and
  aggregation (already required by BUD-16). Uniform shape is testable and consumable; a
  varying-shape "core plus anomalies" response was rejected.
- Rationale for always-on: the framework's central defect — "the budget provably never trimmed
  anything" — was invisible precisely because normal operation was unmeasured. Confirming healthy
  operation is a feature, and the fields are compact scalars, so the cost is bounded.
- The **only** prose additions to an otherwise clean response are anomaly lines:
  - a short **degradation line** when `status != ok` or a capability is degraded (FAIL-08), and
  - an **exact-node-overflow line** when A-09's one-node exception fires (BUD-08).
- Rationale: both are anomalous states that must survive a text-only reader. Everything routine
  stays structured.

### 5. Enrichment presentation (WS6)

- **Expansion results** (dependency / hierarchy / call-chain / adjacent) render as
  **anchor + signature + a one-line enrichment description** in prose. Semantic tags,
  business context and relationships go to `structuredContent` only.
- **Direct high-confidence results that carry live source** render **source only** in prose;
  their enrichment stays in `structuredContent`. Rationale: when the code is present, a
  model-generated summary of it is paying twice for the same information.
- **Missing enrichment**: the description line is **omitted entirely** — no empty field, no
  placeholder. Deterministic AST metadata (signature, chunk type, anchor) always renders, so a
  degraded result never looks broken (ENR-08).
- A-11 still governs: enrichment is periphery compression and **never** substitutes for exact
  source when exact source is required to answer.

### 6. Budget default and precedence (WS8)

- **Precedence: an explicit per-call budget always wins**, even when larger than the adaptive
  tier. The adaptive tier is the default used only when the caller specifies nothing.
- Rationale: caller intent is authoritative and the rule is trivially testable. `min(explicit,
  adaptive)` was rejected because it would silently deny a deliberately large budget on a complex
  trace — a *new* class of silent behavior, which is what this feature is removing.
- **Adaptive tiers are unchanged**: simple 8000 / moderate 20000 / complex 40000, as already
  defined in `packages/mcp-server/src/tools/adaptive-budget.ts`. Design must not invent new
  numbers.
- **Zero / unlimited semantics:** `0` means **unlimited** — include everything, and still report
  the true estimated token count in diagnostics. A **negative or non-numeric** budget is a
  **configuration error**.
- **Diagnostics reservation:** a **fixed conservative allowance is reserved up front**, and
  evidence is assembled within the remainder. Deterministic and single-pass; it slightly
  under-fills the budget, which A-08 already establishes as the safe direction.
- **Overflow reporting:** A-09's one-node overflow is reported **both** as the structured
  `exact_node_overflow` field with its amounts **and** as a prose line (see decision 4).

### 7. Oversized-input indexing fallback (WS4 — closes A-19's undefined middle step)

- When a single construct exceeds the provider per-input limit **even after AST-boundary
  splitting**, the fallback is: **embed the construct's signature and doc comment only** (which
  fits), **persist the full true line range**, and **mark the point as signature-only** in its
  payload.
- Rationale: the chunk stays findable by name and live reads still return the complete body, so
  nothing is lost from the caller's perspective — only the *embedded semantics* are reduced.
  Text truncation was rejected outright: it stores a vector for text that is not the chunk, the
  exact silent-corruption class A-02 exists to eliminate. Mechanical line-count splitting was
  rejected as producing semantically incoherent vectors.
- **Visibility:** signature-only chunks are reported **at index time** (count + identity in the
  run summary) **and marked at retrieval**, so an agent knows its match was semantically reduced.
  Consistent with FAIL-08 — degradation is reported, never inferred.
- **Non-retryable provider failure for one input mid-run:** skip that input, **continue the
  run**, list the input individually in the run summary with enough identity to re-index it
  (repo, path, symbol, lines), and **exit non-zero** if any chunk was skipped. Satisfies
  INP-09/INP-11 without discarding a long index over one bad chunk, while keeping CI honest.

---

### Agent's Discretion

No area was delegated with "you decide" — all seven were answered explicitly. The following
remain **Design decisions** by the spec's own construction and were deliberately not pre-empted
here:

- The concrete plan taxonomy for intent and branches (A-17 explicitly defers this to Design).
- Whether filter-only retrieval uses `scroll` vs `retrieve` per call site (the spec constrains
  the capability, not the primitive — see checklist anti-patterns).
- The internal module and type layout for the shared plan, the context assembler, and the
  capability declaration.
- The exact numeric value of the fixed diagnostics reservation and of the conservative
  estimator's documented non-under-reporting margin (BUD-13) — the *shape* is fixed here, the
  calibration is a Design/Tasks concern.
- Whether the "members the query implicates" selection for class-level queries uses score,
  lexical overlap, or both.

### Declined / Undiscussed Gray Areas → Assumptions

None. All seven presented gray areas were discussed and resolved. Nothing was declined, so
nothing needed to be written back as an unresolved assumption.

Three decisions above introduce observable properties not previously stated in the spec and are
therefore added to the spec's Assumptions & Open Questions table as **A-27, A-28, A-29** (see
spec.md), keeping the closure gate honest:

- **A-27** — unknown-contract collections refuse; missing payload indexes auto-add silently on
  success while creation failures are still reported.
- **A-28** — the smallest sufficient exact-symbol range includes the doc comment and
  annotations, and merging operates on those expanded ranges.
- **A-29** — the signature-only degraded-chunk state is persisted in the payload, surfaced in the
  indexing summary, and marked on retrieval results.

---

## Specific References

- **`AGENTS.md` token-efficient retrieval rules** were cited as the model for decision 3: the
  class-level shape (declaration + fields + method signatures, bodies only where implicated) is
  the documented pattern the project already tells agents to follow, and the worked "what is an
  Entry?" example is the canonical case it must satisfy.
- **`packages/mcp-server/src/tools/adaptive-budget.ts`** — existing 8000 / 20000 / 40000 tiers
  are retained verbatim as the adaptive defaults.
- **`packages/cli/src/commands/index.command.ts`** — the existing `-f, --force` flag is the
  remediation referenced by unknown-contract and dimension-mismatch errors.
- Repeated theme across every answer: **prefer a loud, actionable refusal over a plausible
  wrong answer**, and **never store or embed a vector for text that is not the chunk**. Design
  should treat these as the tie-breakers when a new sub-decision arises.

---

## Deferred Ideas

- **Operator inspection surface for contract and payload-index state** — already captured in the
  spec as P3 (OPS-01, OPS-02). Decision 1's refusal message carries the needed information at the
  point of failure, so the P3 story remains genuinely optional and is not promoted by this
  discussion.
- **Incremental / non-destructive migration of pre-contract collections** — explicitly not needed,
  since a full re-index was accepted. If re-index cost later becomes a problem, that is a separate
  feature.
- **Emitting an enclosing-class breadcrumb on exact-symbol matches** — considered and rejected as
  redundant with the mandatory anchor. If real usage shows agents still making a follow-up call to
  locate a symbol, revisit as a separate change.
- **A real tokenizer library for exact token counting** — remains out of scope per A-08; the
  conservative estimator's margin is the agreed substitute.
