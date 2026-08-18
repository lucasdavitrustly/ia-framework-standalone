# RAG Correctness, Deterministic Query Planning, and Exact Token-Efficient Context Delivery

**Feature ID:** 019
**Scope tier:** Complex (multi-package, 9 workstreams, new contracts, migration boundary)
**Status:** Specify — awaiting approval

---

## Problem Statement

The ia-framework RAG pipeline has correct-looking architecture (AST chunking, three named
Qdrant vectors, hybrid RRF, lean payloads, live filesystem reads) but several load-bearing
parts are **declarative only** — they are configured, typed, documented, and never executed.
The configured embedding dimension is never sent to either provider and never validated
against what comes back; the production Qdrant adapter has **no sparse search method at all**,
so every keyword/symbol query silently loses its BM25 branch; filter-only lookups are
performed by issuing dense searches with a **zero vector**; and the token cap is computed from
*stored* payload content that is empty by design, then applied *before* live source is read —
so the budget provably never trims anything while the actual response size is unbounded.

The consequence for the calling agent is the opposite of the framework's purpose: responses
are simultaneously **imprecise** (wrong-repo expansion results, lost exact symbols, no
enrichment metadata reaching the model) and **oversized** (unaccounted live source, whole-file
reads, duplicated overlapping ranges), pushing callers back to `grep`/`find` and burning
context budget the framework exists to conserve.

This feature makes the existing design **actually hold**: enforce the embedding contract,
implement real sparse retrieval, use Qdrant's filter-only primitives for deterministic lookups,
compute one shared deterministic query plan, propagate indexing-time enrichment to the model,
and move the token budget to the **final serialized MCP response** with an explicit
priority-ordered context-assembly policy.

---

## Goals

- [ ] **G1 — Embedding contract is enforced, not declared.** Configured dimension, model
      identity, and query/document prefixes form one contract that is applied on every
      request, validated on every response, persisted with the collection, and checked before
      any search. Zero silent dimension or prefix mismatches.
- [ ] **G2 — Sparse retrieval executes in production.** Keyword and symbol queries perform real
      sparse retrieval against the production adapter; the runtime never reports a branch it
      did not execute.
- [ ] **G3 — Deterministic lookups use deterministic primitives.** Zero remaining zero-vector
      searches; all filter-only retrieval uses Qdrant filter operations with complete
      pagination and deterministic ordering by `(repo, relativePath, startLine)`.
- [ ] **G4 — Repository isolation and user filters hold on every path.** Including every
      fallback and every expansion path. Test-verified, not best-effort.
- [ ] **G5 — No embedding input silently violates a provider limit and no chunk is silently
      lost.** Token-aware sizing, boundary-preserving splitting, deterministic oversized
      handling.
- [ ] **G6 — One deterministic query plan per request.** Computed once, consumed by both MCP
      and SearchEngine; no downstream re-classification; no LLM and no network in planning.
- [ ] **G7 — Indexing-time enrichment reaches the model.** `description`, `businessContext`,
      `semanticTags`, `relationships` survive decode → retrieval → merge → expansion → MCP
      output, with no new LLM calls at query time.
- [ ] **G8 — Responses carry the smallest sufficient exact source.** Targeted AST ranges by
      default, precise anchors always, whole files only via explicit `get_file`, no caller-side
      `grep`/`find` needed for the normal search path.
- [ ] **G9 — The token budget governs the final serialized response.** Measured after live
      reads and assembly, priority-ordered, with exactly one documented overflow exception and
      compact diagnostics that reflect reality.
- [ ] **G10 — Failures are actionable and degradation is safe.** Never unrelated evidence,
      never lost exact symbols or filters, always distinguishable empty vs low-confidence vs
      unavailable.

---

## Out of Scope

Explicitly excluded. Documented to prevent scope creep.

| Item | Reason |
| --- | --- |
| Any change under `packages/benchmark` | Caller-mandated exclusion. Benchmark is an isolated workspace package depended on only by the CLI; nothing in `retrieval`/`indexer`/`mcp-server` imports it. |
| Benchmark corpus, benchmark CLI, Hit@K, MRR, Recall@K, NDCG, faithfulness, answer relevance, evaluation redesign | Caller-mandated. This feature changes retrieval correctness; measuring the change is a separate feature. |
| New vector databases | Qdrant is a fixed architectural constraint. |
| New reranking models | Existing BM25 + MMR + RRF stay; only their inputs are corrected. |
| LLM-generated query rewriting, HyDE, multi-query generation, step-back prompting, any network-based query enrichment | Caller-mandated. Deterministic reproducibility and MCP latency (`<500ms` retrieval budget, `plan.md:49` of spec 008) take priority over recall gains from generative rewriting. |
| Raw source persistence in Qdrant for code chunks | Fixed constraint (`README.md:139`, spec 008 `FR-007`). Context-source chunks retain existing inline-content behavior unchanged. |
| Dashboard redesign | Unrelated surface. Dashboard must keep working; no visual/UX change required. |
| Replacing or adding MCP tools | The three-tool surface (`search_codebase`, `get_file`, `get_dependencies`) is preserved. Only behavior inside them changes. |
| Removing the `expandFromPayloadEdges` 1-hop limitation (`dependency-graph.ts:281`) | Pre-existing documented limitation; `hops=2` semantics on the payload-edge path is a separate feature. |
| Implementing true superclass-chain hierarchy expansion | No hierarchy walker exists in `packages/retrieval`; MCP has its own `expandHierarchy`. Unifying them is out of scope; this feature only makes existing expansion filter-safe and budget-accounted. |
| Migrating to a real tokenizer library | Deliberate: conservative heuristic chosen (see A-08) to protect the latency budget. |
| Auth, multi-tenancy, content filtering, PII handling | Caller-mandated exclusion; unrelated to retrieval correctness. |

---

## RAG Principles Applied (rag-architect skill)

The `rag-architect` skill was loaded and applied throughout. Recorded here so requirements
are traceable to the principle that motivated them, and so **rejected** generic patterns are
explicit.

| RAG principle (skill area) | How it informed requirements | Requirement IDs |
| --- | --- | --- |
| **Embedding model selection** — dimension is a property of the model+request, not a label | Dimension, model identity and task prefixes are treated as **one embedding contract** persisted with the collection, because a vector store silently accepts any float array of the right length. | EMB-01..EMB-08 |
| **Document-aware chunking** — boundary-aware splitting beats fixed-size | Oversized-input splitting must preserve AST/semantic boundaries and chunk identity. Generic fixed-size document chunking is **rejected**: the AST-first strategy is the framework's core value. | INP-04, INP-08 |
| **Sparse retrieval** — exact keyword matching is what dense retrieval cannot do | Sparse must actually execute, and its tokenizer must preserve code-identifier structure (camelCase/PascalCase/dot/path/annotation/quoted). A tokenizer that lowercases before splitting destroys exactly the signal sparse exists to capture. | SPR-01..SPR-08 |
| **Hybrid retrieval + RRF fusion** — server-side fusion over comparable candidate lists | Keep Qdrant-native `fusion: rrf` for hybrid; forbid comparing raw cosine against raw sparse scores on one scale as the routed path currently does. | SPR-05, SPR-09 |
| **Vector DB payload/filter design** — metadata traversal is not vector search | Filter-only and graph traversal must use `scroll`/`retrieve` with payload indexes, never a vector query. Spending ANN budget on a deterministic lookup is a category error. | FLT-01..FLT-09 |
| **Query transformation** — channel-specific representations | Semantic / signature / sparse each get a purpose-built deterministic representation from one plan. LLM-based transformation (HyDE, multi-query, step-back) **rejected** for this feature: non-reproducible, adds network latency, and code retrieval needs exactness more than recall breadth. | QP-01..QP-14 |
| **Context compression** — summarize the periphery, keep the core exact | Enrichment summaries are the compression mechanism for expansion/periphery evidence; exact source is mandatory for the requested node. | ENR-03, ENR-07, CTX-08 |
| **Context window optimization** — relevance-ordered assembly under a hard budget | Explicit priority ladder; smallest-sufficient AST range selection; deterministic overlap merging; deduplication before formatting. | CTX-01..CTX-15 |
| **Cost/latency optimization** — cache correctly-keyed, cap the real payload | Budget measured on the serialized response; cache key must cover everything that changes the response. | BUD-01..BUD-14 |
| **Fallback mechanisms / graceful degradation** | Degrade without returning unrelated evidence; never drop exact symbols or user constraints; distinguish empty from unavailable. | FAIL-01..FAIL-08 |
| **Source attribution** — never present unsourced content | Every model-visible piece carries repo, path, symbol, chunk type, line range; stale content stays visibly marked. | CTX-10, ENR-06, FAIL-05 |
| **Guardrails** (content filtering, PII, auth, rate limits) | **Rejected as out of scope.** The skill lists these as production RAG concerns, but they are unrelated to a local-first, single-user code index and were explicitly excluded by the caller. | — (Out of Scope) |
| **Evaluation frameworks** (RAGAS, faithfulness, Recall@K) | **Rejected as out of scope** per caller. Noted as the natural follow-up feature. | — (Out of Scope) |

### Current implementation vs. skill recommendations

| Skill recommendation | Current implementation | Gap severity |
| --- | --- | --- |
| Embedding dimension is a request parameter and a verified contract | `dimensions` never sent to OpenAI (`openai.ts:42-49`) or Ollama (`ollama.ts:38-42`); never validated on return; used only to size the collection and zero-vectors | **Critical** — undetectable corruption |
| Query/document task prefixes applied consistently | Both providers implement `applyPrefix` correctly, but `prefixes` is stripped by `EmbeddingProviderConfigSchema` (`schema.ts:3-9`), so it is never applied | **Critical** — silent asymmetry |
| Sparse retrieval available for exact keyword matching | No `searchKeyword`/`searchSparse` on the only `VectorStore` implementation; both consumer call sites are permanently short-circuited (`search-engine.ts:311`, `:659`) | **Critical** — declared capability absent |
| Sparse tokenizer preserves the lexical signal | Lowercases before splitting (`search-engine.ts:963-965`); `getUserById` → `getuserbyid` | **Critical** — defeats the purpose of the branch |
| Metadata/graph traversal uses filter primitives | Six zero-vector dense searches used as filter-only fetches (`search-engine.ts:485, 511, 549, 594, 808, 933`) with `fileCount * 50` / `1000` / `10` heuristics; `retrieve` never used | **High** — non-deterministic, incomplete |
| Boundary-aware splitting respecting provider limits | No token/char budgeting before embedding; batches are fixed count 50 (`pipeline.ts:657-661`); estimator is `length/4` and never used for batching; whole batch of 50 dropped on failure (`pipeline.ts:694-701`) | **High** — silent data loss |
| One query representation per retrieval channel | One raw string embedded once and reused for both `semantic` and `signature` (`search-engine.ts:290-291`) | **High** — signature branch is not structural |
| Enrichment used as compressed context | Enrichment fields decoded by Qdrant adapter but absent from `RetrievalResult` and from all of `packages/mcp-server`; unreachable by the model | **High** — indexing cost paid, benefit discarded |
| Budget applied to the final context | Cap applied to candidate list using stored (empty) content *before* live reads (`search-codebase.ts:990-1009` then `:1024`); `estimateTokens('')===0` so the cap never trims | **Critical** — budget is inoperative |
| Deduplicate overlapping evidence | Dedup is `chunkId`-only at all five sites; no overlapping-range, repeated-file, or AST-vs-LLM semantic collapse | **Medium** — wasted budget |
| Repo isolation on all retrieval paths | Enforced only at the MCP boundary; five of eight expansion paths forward no `repoId`, no user filter, no test exclusion | **Critical** — wrong-repo results |
| Cache key covers everything affecting the response | `search_codebase` key = sha256 of full input (good), but no TTL and no index-generation component; a re-index does not invalidate it | **Medium** |

---

## Library Contracts Verified (Context7, current docs)

Recorded because several requirements depend on precise provider/store capabilities.

**OpenAI Embeddings** (`/websites/developers_openai_api`, `POST /embeddings`):
- `dimensions` is **optional and supported only on `text-embedding-3` and later models**; minimum 1. `text-embedding-ada-002` does **not** support it.
- Per-input limit: **8192 tokens** for all embedding models. Empty string rejected.
- Array (batch) limit: **2048 items** maximum.
- Request-wide limit: **300,000 tokens summed across all inputs** in a single request.
- Response `data[]` carries an `index`; ordering must be re-established from it.

**Ollama Embeddings** (`/ollama/ollama`, `POST /api/embed`):
- Accepts `model`, `input` (string or list), `truncate` (**boolean, defaults to `true` — silently truncates the end of each input to fit context length**), `options`, `keep_alive`, and `dimensions`.
- `/api/embed` returns **L2-normalized** vectors.
- Ollama applies **no prompt prefix or query transformation** — prefixing is entirely the client's responsibility.
- `POST /api/show` exposes `model_info["<arch>.embedding_length"]` (native dimension) and `"<arch>.context_length"`.
- OpenAI-compatible `POST /v1/embeddings` also accepts `dimensions`.

**Qdrant JS client** (`/qdrant/qdrant-js`):
- `search()` accepts `NamedVectorStruct`, which includes `NamedSparseVector { name: string; vector: { indices: number[]; values: number[] } }` — a named **sparse** vector query is a first-class operation.
- `scroll(collection, { filter, limit, offset, with_payload, with_vector, order_by })` returns `{ points, next_page_offset }` — cursor pagination is supported and `order_by` exists.
- Fusion enum is `"rrf" | "dbsf"`; `RrfQuery` supports `{ k, weights }`; `Prefetch` supports `using`, `filter`, `limit`, `score_threshold`.
- Sparse vector constraint: **indices must be unique**, and `values.length === indices.length`.

---

## Assumptions & Open Questions

Every ambiguity is resolved here or recorded as a decision. Nothing is left silently unclear.

| ID | Assumption / decision | Chosen default | Rationale | Confirmed? |
| --- | --- | --- | --- | --- |
| A-01 | **Provider dimension support** is model-dependent, not provider-dependent | Maintain an explicit capability rule: OpenAI `text-embedding-3*` supports `dimensions`; OpenAI `ada-002` does not; Ollama `/api/embed` and `/v1/embeddings` accept `dimensions`. When the configured dimension differs from the model's native dimension **and** the model does not support reduction, fail with an actionable configuration error rather than sending a request whose response length cannot match. | Verified against current Context7 docs. Sending an unsupported parameter yields either an API error or a silently different vector length — both worse than refusing at config time. | y |
| A-02 | **Ollama `truncate` default is dangerous** | Explicitly send `truncate: false` for indexing and query embedding so an oversized input is a loud error rather than a silently truncated vector. | `truncate` defaults to `true` (Context7). Silent truncation produces a valid-length vector for the *wrong* text — the exact class of undetectable corruption this feature exists to remove. | y |
| A-03 | **Embedding input limits** | Enforce per-model limits from an explicit capability table with a conservative default when the model is unknown; enforce OpenAI's documented 8192-token per-input, 2048-item array, and 300,000-token request-wide caps; for Ollama derive the per-input ceiling from `/api/show` `context_length` when available, else use a conservative default. | Hard OpenAI numbers are documented; Ollama's is model-dependent. A conservative default is safe (it only reduces batch packing). | y |
| A-04 | **Sparse-vector availability** must be a runtime capability, not an assumption | The vector store exposes an explicit capability declaration. The query plan may only select a `sparse` branch when the configured adapter declares sparse support; the response diagnostics report only branches actually executed. | Today the runtime believes it routed to sparse when it did not. A capability flag makes "reported" and "executed" provably identical. | y |
| A-05 | **Filter-only pagination** | Filter-only retrieval pages with Qdrant's `next_page_offset` cursor until exhausted or until an explicit, documented safety ceiling is reached; reaching the ceiling is reported in diagnostics as truncation, never silently. | `scroll` supports cursor pagination (Context7). Unbounded loops are a liveness risk, so a ceiling is required — but an *invisible* ceiling is the current bug. | y |
| A-06 | **Query-channel representations** | Three deterministic derivations from one plan: **semantic** = original query text plus the configured query prefix (meaning-preserving); **signature** = structural rendering emphasizing exact symbols, class/method names, package names, paths, annotations, construct types; **sparse** = exact identifiers, quoted terms, package/path tokens, and bounded deterministic synonyms from the existing local synonym map. | Matches the three indexed vectors' semantics (spec 008 `spec.md:155-161`). Purely local and reproducible. | y |
| A-07 | **Deterministic synonyms are bounded and non-inventive** | Only the existing curated local synonym map (`search-synonyms.ts`) is used, applied only to the sparse channel, and only additively. Synonyms may never introduce a symbol, file, package, or domain entity not already present in the map. | Prevents the synonym path from becoming an unbounded, hallucination-prone rewriter — the reason LLM rewriting was rejected. | y |
| A-08 | **Final token counting** | A dependency-free conservative estimator applied to the **final serialized model-visible response** (text plus `structuredContent`). It must be documented as over-estimating and must never under-report the true count by more than a stated, test-asserted margin. No tokenizer dependency is introduced. | Protects the `<500ms` retrieval budget and the local-first constraint. Over-estimating is safe (it under-fills the budget); under-estimating is the current failure mode. | y |
| A-09 | **The one-node overflow rule** | If the single highest-priority exact AST node alone exceeds the remaining budget, include it **complete**, omit all lower-priority context, set `exact_node_overflow=true`, and report estimated tokens, configured budget, and overflow amount. This is the **only** permitted budget exception, and it applies to exactly one node. | A truncated method body is worse than an over-budget one: it silently misleads. Confining the exception to one node with an explicit signal keeps it auditable. | y |
| A-10 | **Full-file vs targeted retrieval** | `search_codebase` never returns whole files as a normal strategy. `get_file` remains explicit file inspection: path-only **may** return the full file; `name` or line-range requests return only the requested portions. | Preserves the existing documented `get_file` contract (spec 017) while removing full-file responses from the search path. | y |
| A-11 | **Enrichment summary usage** | Enrichment is compact context for periphery and expansion evidence and for cases where full source is unnecessary. It **never substitutes** for exact source when exact source is required to answer. Missing enrichment degrades to deterministic AST metadata without failure. | Enrichment is model-generated at index time; it is a summary, not ground truth. | y |
| A-12 | **Fixed top-5 source cutoff is removed** | Inclusion of live source is decided by the context assembler from priority plus remaining budget after live reads. No hardcoded rank cutoff. `AGENTS.md` retrieval guidance is updated in this feature so documentation matches behavior. | The current `topN=5` is arbitrary and is applied *after* an inoperative cap. Budget-driven selection is the actual requirement. | y |
| A-13 | **Embedding-contract migration boundary** | The embedding contract (provider, model, configured dimension, prefix pair) is persisted as collection metadata. On mismatch at query time the system **refuses with an actionable error** naming both sides and the remediation command. No silent degradation and no automatic destructive re-create. | Applying prefixes to queries against a prefix-less index silently degrades recall. Refusing is loud, cheap to fix, and consistent with the existing `[OLD_SCHEMA]` posture. | y |
| A-14 | **Destructive collection recreation requires explicit consent** | Dimension mismatch in `initialize()` must **not** delete the collection unconditionally. It behaves like the `[OLD_SCHEMA]` guard: fail with an actionable, machine-readable error unless `force` is set. Missing/unreadable declared sizes are treated as a mismatch (fail closed), not as agreement. | Current code deletes all points with no `force`, no prompt, and no log (`qdrant.ts:209-223`) — the opposite of its sibling guard, and unrecoverable. | y |
| A-15 | **Repo isolation and user filters are mandatory on every path** | Every direct retrieval, fallback, and expansion path accepts and forwards the effective filter (repo + user metadata filters + test exclusion). This is asserted by tests, not left to boundary post-filtering. | Five of eight expansion paths currently forward nothing, and cross-repo `relativePath` collisions are explicitly expected (`search-engine.ts:788-791`). | y |
| A-16 | **One shared lexical tokenizer** | A single deterministic tokenizer — splitting identifier case boundaries **before** lowercasing, preserving quoted phrases, and handling dot/path/package/annotation forms — is used by the sparse channel, the BM25 reranker, and lexical similarity. | Three divergent tokenizers currently disagree about what a token is, so sparse and BM25 cannot reinforce each other. | y |
| A-17 | **One plan, two orthogonal dimensions** | The shared plan carries **intent** (the answer shape the caller needs) and **branches** (which vectors to query) as separate fields, computed once. Neither existing enum (`semantic\|symbol\|keyword\|mixed`, `keyword\|semantic\|existence\|aggregation`) survives as the single axis. Re-classifying the same query downstream is forbidden. The concrete taxonomy is a Design decision. | The two enums answer different questions and are conflated today; forcing one to win would lose information the other carries. | y |
| A-18 | **Existence and aggregation stay source-free but budget-accounted** | Both continue to return anchors, metadata and summaries without code blocks — that cheapness is their value — but their serialized responses are counted against the final budget and report the same diagnostics as every other route. | Their current exemption from accounting is the reason "cheap" routes are unmeasured. | y |
| A-19 | **Oversized-input fallback ordering** | An oversized input is first split along AST/semantic boundaries; if it cannot be split safely, it is preserved through an explicit, diagnosable fallback path; only if neither is possible does it produce an actionable error. Under no circumstance is it silently dropped. | Currently a single oversized input kills its whole 50-chunk batch (`pipeline.ts:694-701`). | y |
| A-20 | **Partial-batch failure granularity** | A provider failure must not discard chunks that were embedded successfully. Failure accounting is per input, not per batch, and unrecoverable inputs are reported individually with enough identity to re-index them. | Batch-granular loss silently removes 50 chunks per failure today. | y |
| A-21 | **Payload decode completeness** | Fields written to Qdrant must be decodable. `annotationMeta`, `chunkIndex`, `totalChunks`, `calledBy` are currently written but never decoded, silently disabling adjacent-chunk ordering and the `calledBy` half of call-chain expansion. Decode must round-trip everything the payload contract declares. | A write-only field is indistinguishable from a missing feature and cannot be tested from the read side. | y |
| A-22 | **Branch parity between routed and hybrid search** | Test exclusion, result-diversity handling, and truncation behavior apply consistently to both the routed and hybrid search paths. Behavior must not depend on which internal path served the query. | `searchHybrid` currently skips test exclusion and elbow truncation, and its diversity step degrades to score sort under lean payloads. | y |
| A-23 | **Session cache invalidation** | The cache key covers the original query, the derived plan, effective filters, expansion settings, the effective budget, and tool options, and additionally an index-generation marker so re-indexing invalidates prior entries. | The current key hashes the input only; a re-index leaves stale answers cached indefinitely (no TTL, no generation). | y |
| A-24 | **Diagnostics are compact and structured** | Diagnostics are returned as structured fields, must not duplicate large textual content, and their own cost is reserved in the budget. | Diagnostics that blow the budget defeat the feature. | y |
| A-25 | **Context-source (non-code) chunks are unchanged** | Chunks from DB-schema/doc context sources keep their existing inline-content behavior. This feature does not add or remove raw source storage for them. | Out-of-scope surface; changing it would break DB context retrieval. | y |
| A-26 | **Repository isolation for context-source chunks is a known pre-existing gap** | Context-source chunks are written without `repoId`. This feature does not change how they are written; requirements about repo isolation apply to code chunks, and the gap is recorded rather than silently assumed fixed. | Honest boundary: fixing indexing-side `repoId` for context sources is a separate change with its own migration. | y |
| A-27 | **Unknown-contract collections refuse; payload indexes auto-add** | A collection with no persisted embedding contract is an explicit unknown-contract state and a search against it is **refused**, naming the collection and the `ia index --force` remediation. A mandatory one-time full re-index is accepted, so no pre-contract compatibility branch is required. Missing **payload indexes** are treated differently: they are auto-added on startup without prompting, silently on success — while a creation **failure** is still reported per FLT-08. | Inferring the contract from declared vector dimensions would silently assume the prefix pair matched — the exact silent-asymmetry defect this feature removes. Payload-index creation is additive and non-destructive (FLT-09), so consent adds noise without adding safety. | y (Discuss) |
| A-28 | **Smallest sufficient exact-symbol range includes doc comment and annotations** | For an exact-symbol match the selected range is `[min(docCommentStart, annotationStart, methodStart) .. methodEnd]`. Overlap detection and deterministic merging (CTX-14) operate on these **expanded** ranges, not on bare method bodies. No enclosing-class breadcrumb is emitted, since CTX-10's mandatory anchor already carries repo, path, symbol and line range. | Annotations and doc comments carry the behavioral contract (`@Transactional`, `@Nullable`, documented throws) that changes how the method behaves; a body without them is technically complete and still misleading. | y (Discuss) |
| A-29 | **Signature-only degraded-chunk state is explicit and visible** | When a construct exceeds the provider per-input limit even after AST-boundary splitting, the fallback embeds only its signature and doc comment, persists the **full true line range**, and marks the point **signature-only** in its payload. That state is reported in the indexing run summary (count + identity) and marked on retrieval results. A non-retryable provider failure for one input skips that input, continues the run, reports it individually, and exits non-zero. | Keeps the chunk findable by name with live reads still returning the complete body — only embedded semantics are reduced. Text truncation is rejected: it stores a vector for text that is not the chunk (the A-02 corruption class). Mechanical line-count splitting is rejected as semantically incoherent. | y (Discuss) |

**Open questions:** none — all resolved or recorded above. A-27..A-29 were resolved in the
Discuss step; see `context.md` for the full decision set and the options rejected.

---

## User Stories

Nine P1 stories map 1:1 to the nine workstreams and are ordered so foundational contracts and
correctness fixes precede context optimization. P2 stories cover documentation alignment.

---

### P1: WS1 — Embedding and Vector Correctness ⭐ MVP

**User Story**: As a framework operator, I want the configured embedding contract to be
actually applied and verified end to end, so that an index can never be built or queried with
vectors that do not match the collection they live in.

**Why P1**: Every other retrieval requirement is meaningless if vectors are wrong. Dimension
and prefix mismatches are currently undetectable and corrupt results silently.

**Acceptance Criteria**:

1. WHEN an embedding request is issued to a provider whose selected model supports a
   configurable output dimension AND a dimension is configured THEN the system SHALL include
   that dimension in the provider request.
2. WHEN a dimension is configured that the selected provider/model does not support THEN the
   system SHALL fail with a configuration error naming the provider, the model, the configured
   dimension, and the model's supported dimension behavior, AND SHALL NOT issue the request.
3. WHEN a provider returns an embedding THEN the system SHALL validate its length against the
   configured dimension before indexing, before Qdrant upsert, before query search, and before
   hybrid search.
4. WHEN a returned embedding is malformed, empty, or of mismatched dimension THEN the system
   SHALL NOT store or search with it, AND SHALL raise an error naming provider, model,
   configured dimension, and actual dimension.
5. WHEN a provider request would allow silent server-side input truncation THEN the system
   SHALL disable that truncation so that an oversized input is an explicit failure rather than
   a vector for altered text.
6. WHEN a batch embedding request partially fails THEN the system SHALL retain every
   successfully embedded input, AND SHALL report each unrecoverable input individually with
   enough identity to re-index it, AND SHALL NOT discard successfully embedded siblings.
7. WHEN query/document embedding prefixes are configured THEN configuration loading SHALL
   preserve them, AND they SHALL be applied to the corresponding request type.
8. WHEN a collection is created THEN the system SHALL persist the embedding contract (provider,
   model, configured dimension, prefix pair) as collection metadata.
9. WHEN a search is issued against a collection whose persisted embedding contract differs from
   the active configuration THEN the system SHALL refuse the search with an error naming both
   contracts and the remediation command, AND SHALL NOT return degraded results.
10. WHEN `initialize()` detects a declared-dimension mismatch on an existing collection AND
    forced recreation was not requested THEN the system SHALL fail with a machine-readable,
    actionable error, AND SHALL NOT delete the collection.
11. WHEN an existing collection's declared vector sizes cannot be read THEN the system SHALL
    treat this as a mismatch (fail closed), AND SHALL NOT proceed as if the schema agreed.

**Independent Test**: Configure a dimension unsupported by the selected model — the run fails
before any network request with a message naming provider, model and dimension. Stub a provider
returning a wrong-length vector — no upsert occurs and the error names both dimensions. Point a
configured prefix pair at a collection indexed without prefixes — the search refuses with a
remediation message.

---

### P1: WS2 — Production Sparse Retrieval ⭐ MVP

**User Story**: As an agent searching for an exact symbol, I want keyword and symbol queries to
actually execute sparse retrieval, so that exact identifiers are found instead of being
approximated by dense similarity.

**Why P1**: The sparse branch is written at index time, declared in the retrieval contract, and
reported in routing — but never executed. Exact-symbol recall is the framework's core promise.

**Acceptance Criteria**:

1. WHEN the vector store is asked to perform a sparse search with a named sparse vector THEN
   the production adapter SHALL execute it against the collection's sparse vector.
2. WHEN a query's plan selects a sparse branch AND the configured adapter declares sparse
   support THEN the system SHALL execute direct sparse retrieval.
3. WHEN sparse retrieval executes THEN it SHALL apply the repository filter, all effective
   metadata filters, and the requested result limit.
4. WHEN sparse retrieval returns results THEN their ordering SHALL be deterministic for
   identical inputs, AND each result SHALL carry provenance identifying the sparse branch.
5. WHEN sparse retrieval matches nothing THEN it SHALL return an empty result set
   distinguishable from a failure.
6. WHEN the configured adapter does not declare sparse support THEN the plan SHALL NOT select a
   sparse branch, AND the response diagnostics SHALL NOT report a sparse branch as executed.
7. WHEN a hybrid search runs THEN it SHALL combine the semantic, signature and sparse branches
   using Qdrant-supported fusion, AND each contributing branch SHALL be reported.
8. WHEN a query contains camelCase, PascalCase, dot-notation, package names, path fragments,
   annotations, or quoted terms THEN lexical tokenization SHALL preserve those identifier
   boundaries so the exact identifier is matchable.
9. WHEN sparse and lexical reranking both process the same query THEN they SHALL agree on
   tokenization, having derived it from one shared tokenizer.
10. WHEN sparse vectors are produced THEN their indices SHALL be unique and aligned with their
    values, AND term weighting SHALL remain compatible with the collection's configured sparse
    modifier.
11. WHEN a search executes via the hybrid path THEN test exclusion, diversity handling and
    truncation behavior SHALL be consistent with the routed path, so behavior does not depend
    on which internal path served the query.

**Independent Test**: Query `getUserById` and confirm the sparse branch executed (diagnostics)
and that the exact method is returned. Configure an adapter without sparse support and confirm
no sparse branch is reported. Assert `getUserById` tokenizes to the same terms in both the
sparse and reranking paths.

---

### P1: WS3 — Filter-Only and Expansion Retrieval ⭐ MVP

**User Story**: As an agent following a dependency or asking for a file's chunks, I want
deterministic lookups to be executed as deterministic lookups, so that results are complete,
correctly ordered, and never from the wrong repository.

**Why P1**: Six code paths currently fake a filter query with a zero vector, producing
arbitrary ordering, arbitrary limits, and no repository isolation.

**Acceptance Criteria**:

1. WHEN a retrieval needs points selected only by payload criteria THEN the system SHALL use a
   Qdrant filter-only operation, AND SHALL NOT issue a vector similarity query for that purpose.
2. WHEN file-chunk retrieval, adjacent-chunk retrieval, dependency expansion, call-chain
   expansion, interface-implementation expansion, hierarchy expansion, or multi-hop symbol
   lookup executes THEN each SHALL use filter-only retrieval.
3. WHEN filter-only retrieval has more matches than one page THEN it SHALL page until exhausted
   or until an explicit documented safety ceiling is reached.
4. WHEN a safety ceiling truncates a filter-only retrieval THEN the response SHALL report the
   truncation, AND SHALL NOT present the partial set as complete.
5. WHEN filter-only results are returned THEN they SHALL be ordered deterministically by
   repository, then relative path, then start line.
6. WHEN any direct retrieval, fallback, or expansion path executes THEN it SHALL apply the
   effective repository filter, so no result from a different repository can be returned.
7. WHEN any fallback or expansion path executes THEN it SHALL apply the effective user metadata
   filters and the effective test-exclusion behavior.
8. WHEN payload fields are used by exact lookup or expansion filtering THEN the collection SHALL
   have payload indexes for those fields, AND a failure to create an index SHALL be reported
   rather than silently swallowed.
9. WHEN an existing collection lacks a required payload index THEN the system SHALL be able to
   add it without requiring a destructive re-index.
10. WHEN filter-only retrieval fails THEN the system SHALL surface an actionable error, AND
    SHALL NOT substitute unrelated vector-similarity matches.
11. WHEN a field is written to the Qdrant payload THEN it SHALL be decodable on read, so no
    declared payload field is write-only.
12. WHEN adjacent-chunk retrieval orders its results THEN the ordering SHALL be based on
    decoded chunk position rather than on a field that decodes to a constant.
13. WHEN raw code content is stored for code chunks THEN this SHALL NOT occur — the lean payload
    constraint is preserved.

**Independent Test**: In a two-repo collection with the same relative path in both, request that
file's chunks scoped to one repo and confirm only that repo's chunks return, in `startLine`
order. Seed more chunks than one page and confirm all are returned. Force a filter failure and
confirm an actionable error rather than unrelated matches.

---

### P1: WS4 — Embedding Input Safety ⭐ MVP

**User Story**: As a framework operator indexing a large codebase, I want oversized inputs
handled deterministically, so that no chunk is silently dropped and no batch violates a provider
limit.

**Why P1**: There is currently no size budgeting before embedding, and one bad input discards
its entire batch.

**Acceptance Criteria**:

1. WHEN an embedding input is prepared THEN its estimated size SHALL be checked against the
   selected provider/model per-input limit before the request is issued.
2. WHEN a batch is assembled THEN it SHALL respect the provider's maximum item count and the
   provider's maximum total input size for a single request.
3. WHEN input size is estimated THEN the estimate SHALL be token-aware or conservatively
   over-estimating, AND SHALL NOT rely on source line count alone.
4. WHEN an oversized input must be split THEN the split SHALL occur at AST or semantic
   boundaries.
5. WHEN an oversized method, class, unsupported whole-file chunk, or generated chunk is
   encountered THEN its handling SHALL be deterministic and identical across runs for identical
   input.
6. WHEN an oversized chunk cannot be embedded THEN it SHALL NOT be silently dropped — it is
   either split, preserved through an explicit fallback path, or reported as an actionable error
   identifying the chunk.
7. WHEN an input is split THEN chunk identity, source line ranges, signature, parent name, and
   repository metadata SHALL be preserved for every resulting part.
8. WHEN a provider call fails THEN retry behavior SHALL distinguish retryable from
   non-retryable failures, AND a non-retryable failure SHALL NOT consume retry attempts
   pointlessly.
9. WHEN retries are exhausted for one input THEN other inputs in the same batch SHALL still be
   indexed.
10. WHEN indexing is cancelled mid-run THEN the system SHALL stop deterministically without
    leaving partially-written points that misreport their contract.
11. WHEN any chunk is skipped for any reason THEN the run summary SHALL account for it with
    enough identity to re-index it.

**Independent Test**: Index a file containing one method larger than the provider per-input
limit — the run completes, the oversized method is represented (split at boundaries or reported),
no sibling chunk is lost, and the summary names the affected chunk. Force a non-retryable
provider error on one input and confirm siblings still index.

---

### P1: WS5 — Shared Deterministic MCP Query Planning ⭐ MVP

**User Story**: As an agent issuing a search, I want one deterministic plan to drive routing,
branches, filters, expansion and budget, so that the same query always behaves the same way and
no layer silently disagrees with another.

**Why P1**: Two independent classifiers with disjoint taxonomies currently run on the same query;
one result is discarded, and the signature branch is queried with a semantic representation.

**Acceptance Criteria**:

1. WHEN a search request is received THEN the system SHALL compute exactly one query plan for it.
2. WHEN the plan is computed THEN it SHALL preserve the original user query verbatim, separately
   from every derived representation.
3. WHEN the plan is computed THEN it SHALL derive normalized lexical terms, exact symbols,
   quoted identifiers, package and path terms, query intent, route, selected vector branches,
   effective metadata filters, expansion settings, and the effective context budget.
4. WHEN retrieval executes THEN both the MCP layer and the search engine SHALL consume that same
   plan, AND neither SHALL re-classify the query.
5. WHEN the same query, filters and settings are submitted twice THEN planning SHALL produce an
   identical plan.
6. WHEN planning executes THEN it SHALL NOT call an LLM and SHALL NOT perform any network
   request.
7. WHEN the semantic branch is queried THEN it SHALL use a representation that preserves the
   original user meaning and applies the configured query-side embedding prefix.
8. WHEN the signature branch is queried THEN it SHALL use a structural representation
   emphasizing exact symbols, class and method names, package names, paths, annotations and
   construct types.
9. WHEN the sparse branch is queried THEN it SHALL use exact identifiers, quoted terms,
   package/path tokens, and bounded deterministic synonyms.
10. WHEN deterministic synonyms are applied THEN they SHALL come only from the curated local map,
    SHALL be additive, and SHALL NOT introduce any symbol, file, package or domain entity absent
    from that map.
11. WHEN a response template is selected THEN it SHALL be used only as output scaffolding, AND
    SHALL NOT appear in any embedding input.
12. WHEN a user supplies repository, stereotype, architecture-layer, module, language, or
    explicit expansion settings THEN those SHALL be represented in the plan and SHALL be
    preserved through every retrieval and fallback path.
13. WHEN planning cannot produce a usable plan THEN the system SHALL report an actionable
    diagnostic, AND SHALL NOT proceed with an implicitly-defaulted plan that discards user
    constraints.

**Independent Test**: Submit `PaymentService.refund` with `repo` and `language` filters; assert
one plan is produced, that the semantic/signature/sparse representations differ from each other
in the documented ways, that the original query is preserved verbatim, that both layers report
the same route and branches, and that both filters survive into a forced fallback.

---

### P1: WS6 — Indexing-Time Enrichment in MCP Responses ⭐ MVP

**User Story**: As an agent needing to understand code quickly, I want the enrichment already
generated at index time to reach me, so that I can get compact meaning without paying for full
source.

**Why P1**: Enrichment costs real indexing time and is decoded by the vector store, yet it is
absent from the retrieval result type and from the entire MCP layer — the model can never see it.

**Acceptance Criteria**:

1. WHEN a chunk with enrichment metadata is retrieved THEN its description, business context,
   semantic tags, relationships, and enrichment provenance SHALL survive payload decoding,
   retrieval mapping, multi-collection merging, expansion, and MCP structured output.
2. WHEN an MCP query is handled THEN the system SHALL NOT make any LLM call.
3. WHEN full source is not necessary to answer THEN enrichment metadata SHALL be usable as
   compact context in its place.
4. WHEN dependency, hierarchy, call-chain or adjacent results are returned THEN they SHALL
   default to compact metadata, signatures, anchors or enriched summaries rather than complete
   source.
5. WHEN a direct high-confidence result is returned THEN it MAY include live source for the
   selected AST range.
6. WHEN any result is returned THEN it SHALL carry repository identity, relative path, symbol
   name, chunk type, line range, source anchor, and stale-content status.
7. WHEN exact source is required to answer the query THEN enrichment metadata SHALL NOT be
   substituted for it.
8. WHEN a chunk has no enrichment metadata THEN the result SHALL degrade to deterministic AST
   metadata without failing and without an empty or misleading field.
9. WHEN a fallback path produces results THEN those results SHALL carry the same metadata
   completeness as results from the primary path.

**Independent Test**: Retrieve an enriched chunk and confirm its description and tags appear in
the model-visible output and in structured content. Retrieve an unenriched chunk in the same
response and confirm it degrades to AST metadata with no error. Confirm an expansion result
returns a summary rather than full source.

---

### P1: WS7 — Exact-Context MCP Retrieval ⭐ MVP

**User Story**: As an agent, I want search responses to contain the smallest sufficient exact
code, so that I never need `grep`, `find`, or manual navigation to get the code I asked about.

**Why P1**: This is the feature's user-visible payoff. It depends on WS1–WS6 being correct.

**Acceptance Criteria**:

1. WHEN retrieval executes THEN internal candidate limits SHALL be separate from the final
   model-visible context budget.
2. WHEN a response is produced THEN a final context-assembly stage SHALL run after retrieval,
   expansion, live filesystem reads, enrichment propagation, deduplication and formatting.
3. WHEN the assembler selects evidence THEN it SHALL select the smallest sufficient AST or source
   range for each included item.
4. WHEN a normal search response is produced THEN it SHALL contain targeted code ranges, AND
   SHALL NOT return whole files as its default strategy.
5. WHEN a query names an exact symbol THEN the assembler SHALL prefer the exact method,
   function, class, interface or construct node for that symbol.
6. WHEN a query is class-level THEN the response MAY include a compact class signature plus only
   the relevant member nodes.
7. WHEN a query is conceptual THEN the assembler SHALL select the smallest sufficient AST chunks
   that support the concept.
8. WHEN dependency, hierarchy, call-chain or adjacent evidence is included THEN it SHALL default
   to compact evidence unless the context policy explicitly selects its source.
9. WHEN a normal search response is returned THEN it SHALL be sufficient without the caller
   issuing shell, `grep`, `find`, or manual file-navigation operations to obtain the code the
   query asked about.
10. WHEN any evidence is returned THEN it SHALL carry a precise source anchor identifying
    repository, file, symbol and line range.
11. WHEN `get_file` is called with a path only THEN it MAY return the full requested file.
12. WHEN `get_file` is called with a name or a line range THEN it SHALL return only the
    requested portions.
13. WHEN results are assembled THEN duplicates SHALL be removed before formatting, covering
    identical chunk identifiers, duplicate results for the same source region arriving from
    different collections, repeated files, overlapping line ranges, repeated expansion results,
    repeated summaries and repeated anchors.
14. WHEN overlapping ranges from the same file are selected THEN they SHALL be merged
    deterministically where merging is safe.
15. WHEN deduplication and merging complete THEN the original ranking order and the provenance
    of each surviving item SHALL be preserved.
16. WHEN inclusion of live source is decided THEN it SHALL follow priority and remaining budget,
    AND SHALL NOT depend on a fixed rank cutoff.

**Independent Test**: Query an exact method name in a 2000-line file; confirm the response
contains that method's line range and not the file. Query a class; confirm a compact signature
plus relevant members. Force two collections to return the same region and confirm one surviving
entry with preserved provenance. Confirm a `get_file` path-only call still returns the whole file.

---

### P1: WS8 — Final MCP Token-Budget Contract ⭐ MVP

**User Story**: As an operator paying for context, I want the token budget to govern what the
model actually receives, so that the configured budget is a real limit and the reported numbers
are true.

**Why P1**: The current cap is provably inoperative — it measures empty stored content before
live source is read.

**Acceptance Criteria**:

1. WHEN any search route produces a response — keyword, semantic, hybrid, existence,
   aggregation, fallback, or any expansion or live-source path — THEN one explicit final-response
   budget contract SHALL govern it.
2. WHEN both an explicitly configured per-call budget and an adaptive query budget are available
   THEN precedence between them SHALL be explicit and deterministic.
3. WHEN the budget is computed THEN all model-visible context SHALL be counted or conservatively
   reserved, including the original query, plan information exposed to the model, result headers,
   source anchors, line ranges, live source, enriched summaries, templates, fallback notes and
   diagnostics.
4. WHEN diagnostics are returned THEN they SHALL be compact and SHALL NOT duplicate large
   textual content already present in the response.
5. WHEN the budget is enforced THEN enforcement SHALL occur after live content has been read and
   after the final response has been assembled.
6. WHEN indexed payload content is empty because live source will be loaded later THEN the
   budget SHALL NOT treat that item as costless.
7. WHEN context is assembled THEN it SHALL be ordered by priority: the exact requested symbol or
   AST node; direct high-confidence evidence; exact identifier matches; compact enriched
   summaries; dependency and hierarchy evidence; adjacent or call-chain evidence; diagnostics.
8. WHEN the exact highest-priority AST node alone exceeds the remaining budget THEN the system
   SHALL include that node complete, omit lower-priority context, set an explicit
   exact-node-overflow indicator, and report the estimated token count, the configured budget and
   the overflow amount.
9. WHEN the exact required AST node is included THEN it SHALL NOT be arbitrarily truncated.
10. WHEN lower-priority evidence does not fit THEN it SHALL be compacted to a deterministic
    summary, signature or anchor, or omitted, according to the context policy.
11. WHEN lower-priority evidence is included THEN the budget SHALL NOT be exceeded for it, and
    never silently.
12. WHEN token-cap metadata is reported THEN it SHALL describe the final serialized response,
    not the pre-read candidate list.
13. WHEN the estimated token count is reported THEN it SHALL be a conservative estimate of the
    serialized response that does not under-report the true count beyond a documented margin.
14. WHEN a response is cached for a session THEN the cache key SHALL account for the original
    query, the query plan, effective filters, expansion settings, the effective budget, tool
    options, and the index generation, so that re-indexing invalidates prior entries.
15. WHEN a response is returned THEN compact diagnostics SHALL report route, executed vector
    branches, fallback mode, candidate count, selected count, deduplicated count, omitted count,
    expansion count, stale-result count, estimated tokens, configured budget, compaction count,
    and exact-node overflow status.
16. WHEN an existence or aggregation response is returned THEN it SHALL remain source-free AND
    SHALL be fully counted against the budget and report the same diagnostics as other routes.

**Independent Test**: Set a small budget and query something whose live source vastly exceeds it;
confirm the serialized response respects the budget, that reported tokens match a conservative
measurement of the actual serialized response, and that omitted/compacted counts are non-zero.
Query a single method larger than the whole budget; confirm the complete method is returned, the
overflow indicator is set, and the reported overflow amount is correct.

---

### P1: WS9 — MCP Failure and Degradation Behavior ⭐ MVP

**User Story**: As an agent, I want failures to tell me exactly what broke and to never hand me
unrelated code, so that I can trust a response or know precisely why I cannot.

**Why P1**: Silent degradation is what makes the other defects invisible; failures currently
either vanish into `catch {}` or surface as untranslated upstream strings.

**Acceptance Criteria**:

1. WHEN a provider failure, unsupported dimension, malformed provider response, sparse-unavailable
   state, filter failure, pagination failure, query-plan failure, filesystem-read failure, or
   enrichment-metadata failure occurs THEN the system SHALL produce an actionable diagnostic
   naming what failed and what to do about it.
2. WHEN retrieval degrades THEN it SHALL NOT return evidence unrelated to the query.
3. WHEN a fallback executes THEN it SHALL preserve exact symbols, quoted terms, repository
   filters, metadata filters and every explicit user constraint.
4. WHEN the exact requested code cannot be retrieved THEN the response SHALL state what failed
   AND SHALL return the best grounded anchor or metadata evidence available.
5. WHEN live source differs from the indexed content THEN the returned content SHALL remain
   visibly marked as stale.
6. WHEN a search yields nothing THEN the response SHALL distinguish an empty result set from a
   low-confidence result set and from unavailable retrieval infrastructure.
7. WHEN failure or degradation information is returned THEN it SHALL be compact enough not to
   consume the context budget unnecessarily, AND its cost SHALL be accounted for.
8. WHEN a degraded capability affects a response THEN that degradation SHALL be reported in the
   response rather than inferred by the caller.

**Independent Test**: Take Qdrant down and confirm an actionable diagnostic naming the store and
remediation rather than a generic protocol error. Break the filesystem path and confirm the
response says the read failed and still returns anchors. Force zero results with a repo filter
and confirm fallback suggestions never come from another repo.

---

### P2: Documentation and Guidance Alignment

**User Story**: As a user of the framework's injected agent guidance, I want the documented
retrieval contract to match actual behavior, so that agents are not instructed to expect
behavior that no longer exists.

**Why P2**: Not required for correctness, but leaving the documented "top-5 live code, 6-10
metadata-only" contract in place after WS7/WS8 replace it would actively mislead every consuming
agent.

**Acceptance Criteria**:

1. WHEN the fixed rank-based source cutoff is replaced by budget-driven selection THEN the
   injected agent guidance SHALL be updated to describe the actual contract.
2. WHEN new diagnostics fields are returned THEN the injected agent guidance SHALL describe how
   to interpret them.
3. WHEN the embedding contract can cause a search to be refused THEN user-facing documentation
   SHALL describe the error and its remediation.
4. WHEN sparse retrieval becomes conditional on adapter capability THEN documentation SHALL
   state when a sparse branch will and will not run.

**Independent Test**: Read the updated guidance and confirm no statement contradicts observed
tool behavior for the scenarios above.

---

### P3: Operator Visibility of Contract State

**User Story**: As an operator, I want to inspect the persisted embedding contract and payload
index state of a collection, so that I can diagnose a refused search without reading code.

**Why P3**: Nice to have; the actionable error messages required by WS1 already carry the needed
information at the point of failure.

**Acceptance Criteria**:

1. WHEN an operator inspects a collection THEN the persisted embedding contract SHALL be
   reportable.
2. WHEN an operator inspects a collection THEN the presence or absence of required payload
   indexes SHALL be reportable.

---

## Edge Cases

**Embedding contract**
- WHEN a model's native dimension equals the configured dimension AND the model does not support
  the dimension parameter THEN the request SHALL proceed without the parameter and validation
  SHALL still verify the returned length.
- WHEN a provider returns fewer embeddings than inputs THEN the mismatch SHALL be an error, not a
  positional shift.
- WHEN a provider returns embeddings out of order THEN ordering SHALL be re-established from the
  provider's index field before use.
- WHEN an embedding input is empty or whitespace-only THEN it SHALL be handled deterministically
  and SHALL NOT be sent as an empty string to a provider that rejects it.
- WHEN a collection has no persisted embedding contract (indexed before this feature) THEN the
  system SHALL treat it as an explicit unknown-contract state with a documented, actionable
  outcome, AND SHALL NOT silently assume the current configuration matches.

**Sparse retrieval**
- WHEN a query produces an empty sparse vector (no tokens survive) THEN the sparse branch SHALL
  be skipped and reported as skipped, not reported as executed with zero results.
- WHEN two distinct terms hash to the same sparse index THEN weights SHALL be combined
  deterministically.
- WHEN a query is entirely a quoted phrase THEN the phrase SHALL be preserved as an exact term.
- WHEN a query is a single character or two characters THEN behavior SHALL be deterministic and
  SHALL NOT silently drop the only signal the query has.

**Filter-only retrieval and expansion**
- WHEN a filter-only retrieval matches zero points THEN it SHALL return empty without falling
  back to similarity search.
- WHEN a requested file has more chunks than one page THEN all chunks SHALL be returned in
  deterministic order.
- WHEN the same relative path exists in multiple repositories AND no repository is specified THEN
  results SHALL be attributed per repository and disambiguation SHALL be possible.
- WHEN an expansion target lies in a different repository than the query scope THEN it SHALL be
  excluded when a repository filter is in force.
- WHEN an expansion produces zero additional results THEN the response SHALL be identical to the
  unexpanded response plus a zero expansion count.

**Embedding input safety**
- WHEN a single indivisible construct exceeds the provider limit even after boundary-aware
  splitting THEN the outcome SHALL be an explicit fallback or an actionable error identifying the
  construct, never a silent drop.
- WHEN a batch's total size exceeds the provider request limit but no individual input does THEN
  the batch SHALL be repacked, not rejected.
- WHEN indexing is cancelled between embedding and upsert THEN no point SHALL be written whose
  recorded contract does not match its vector.

**Context assembly and budget**
- WHEN the configured budget is zero or unlimited THEN behavior SHALL be explicit and documented,
  and diagnostics SHALL still report the true estimated size.
- WHEN the configured budget is smaller than the diagnostics themselves THEN diagnostics SHALL be
  reduced deterministically and the reduction SHALL be visible.
- WHEN two selected ranges from one file are adjacent but not overlapping THEN merging behavior
  SHALL be deterministic and documented.
- WHEN a selected range's file cannot be read THEN the item SHALL degrade to anchor plus
  metadata and SHALL be marked, not silently omitted.
- WHEN every candidate is compacted away by the budget THEN the response SHALL report a non-zero
  candidate count with a zero selected count, distinguishable from no results at all.
- WHEN the exact highest-priority node itself cannot be read from disk THEN the overflow rule
  SHALL NOT be invoked and the failure SHALL be reported.

**Caching**
- WHEN the index is regenerated THEN previously cached responses SHALL NOT be served.
- WHEN two requests differ only in expansion setting or budget THEN they SHALL NOT share a cache
  entry.

---

## Requirement Traceability

| Requirement ID | Story | Phase | Status |
| --- | --- | --- | --- |
| EMB-01 | P1: WS1 — apply configured dimension when supported | Design | Pending |
| EMB-02 | P1: WS1 — refuse unsupported dimension with actionable error | Design | Pending |
| EMB-03 | P1: WS1 — validate returned dimension at index, upsert, query, hybrid | Design | Pending |
| EMB-04 | P1: WS1 — reject malformed/empty/mismatched vectors before store or search | Design | Pending |
| EMB-05 | P1: WS1 — disable silent provider-side input truncation | Design | Pending |
| EMB-06 | P1: WS1 — preserve successful embeddings on partial batch failure | Design | Pending |
| EMB-07 | P1: WS1 — preserve and apply configured query/document prefixes | Design | Pending |
| EMB-08 | P1: WS1 — persist embedding contract as collection metadata | Design | Pending |
| EMB-09 | P1: WS1 — refuse search on embedding-contract mismatch | Design | Pending |
| EMB-10 | P1: WS1 — non-destructive, actionable dimension-mismatch handling | Design | Pending |
| EMB-11 | P1: WS1 — fail closed on unreadable collection schema | Design | Pending |
| SPR-01 | P1: WS2 — sparse search implemented in production adapter | Design | Pending |
| SPR-02 | P1: WS2 — keyword/symbol queries execute direct sparse retrieval | Design | Pending |
| SPR-03 | P1: WS2 — sparse retrieval preserves filters and limits | Design | Pending |
| SPR-04 | P1: WS2 — deterministic ordering and branch provenance | Design | Pending |
| SPR-05 | P1: WS2 — empty sparse result distinguishable from failure | Design | Pending |
| SPR-06 | P1: WS2 — no sparse branch selected or reported without adapter capability | Design | Pending |
| SPR-07 | P1: WS2 — hybrid fusion over semantic, signature, sparse with branch reporting | Design | Pending |
| SPR-08 | P1: WS2 — identifier-boundary preservation in lexical tokenization | Design | Pending |
| SPR-09 | P1: WS2 — one shared tokenizer across sparse and reranking | Design | Pending |
| SPR-10 | P1: WS2 — valid sparse vectors compatible with collection sparse modifier | Design | Pending |
| SPR-11 | P1: WS2 — routed and hybrid path behavioral parity | Design | Pending |
| FLT-01 | P1: WS3 — filter-only operations replace zero-vector searches | Design | Pending |
| FLT-02 | P1: WS3 — applied to all seven named lookup/expansion paths | Design | Pending |
| FLT-03 | P1: WS3 — complete pagination with documented safety ceiling | Design | Pending |
| FLT-04 | P1: WS3 — ceiling truncation reported, never presented as complete | Design | Pending |
| FLT-05 | P1: WS3 — deterministic ordering by repo, path, start line | Design | Pending |
| FLT-06 | P1: WS3 — repository isolation on every direct, fallback, expansion path | Design | Pending |
| FLT-07 | P1: WS3 — user metadata filters and test exclusion preserved on fallback/expansion | Design | Pending |
| FLT-08 | P1: WS3 — payload indexes for exact-lookup and expansion fields, failures reported | Design | Pending |
| FLT-09 | P1: WS3 — payload index addition without destructive re-index | Design | Pending |
| FLT-10 | P1: WS3 — filter-only failure is actionable, never substituted by similarity | Design | Pending |
| FLT-11 | P1: WS3 — every written payload field is decodable | Design | Pending |
| FLT-12 | P1: WS3 — adjacent-chunk ordering uses decoded position | Design | Pending |
| FLT-13 | P1: WS3 — lean payload preserved for code chunks | Design | Pending |
| INP-01 | P1: WS4 — per-input provider limit enforced pre-request | Design | Pending |
| INP-02 | P1: WS4 — batch item-count and total-size limits enforced | Design | Pending |
| INP-03 | P1: WS4 — token-aware or conservative size estimation | Design | Pending |
| INP-04 | P1: WS4 — boundary-preserving splitting | Design | Pending |
| INP-05 | P1: WS4 — deterministic oversized-chunk handling | Design | Pending |
| INP-06 | P1: WS4 — no silent drop of oversized chunks | Design | Pending |
| INP-07 | P1: WS4 — identity/lines/signature/parent/repo preserved after split | Design | Pending |
| INP-08 | P1: WS4 — retryable vs non-retryable failure distinction | Design | Pending |
| INP-09 | P1: WS4 — per-input failure isolation within a batch | Design | Pending |
| INP-10 | P1: WS4 — deterministic cancellation without contract-inconsistent writes | Design | Pending |
| INP-11 | P1: WS4 — every skipped chunk accounted for with re-index identity | Design | Pending |
| QP-01 | P1: WS5 — exactly one query plan per request | Design | Pending |
| QP-02 | P1: WS5 — original query preserved verbatim and separately | Design | Pending |
| QP-03 | P1: WS5 — plan derives all listed fields | Design | Pending |
| QP-04 | P1: WS5 — MCP and search engine consume the same plan; no re-classification | Design | Pending |
| QP-05 | P1: WS5 — planning is deterministic and reproducible | Design | Pending |
| QP-06 | P1: WS5 — planning performs no LLM call and no network request | Design | Pending |
| QP-07 | P1: WS5 — semantic representation preserves meaning and query prefix | Design | Pending |
| QP-08 | P1: WS5 — signature representation is structural | Design | Pending |
| QP-09 | P1: WS5 — sparse representation is exact-identifier oriented | Design | Pending |
| QP-10 | P1: WS5 — synonyms bounded, additive, non-inventive | Design | Pending |
| QP-11 | P1: WS5 — templates are output-only, never embedded | Design | Pending |
| QP-12 | P1: WS5 — explicit user filters and expansion settings never lost | Design | Pending |
| QP-13 | P1: WS5 — planning failure is actionable, no implicit constraint-dropping default | Design | Pending |
| ENR-01 | P1: WS6 — enrichment survives decode, retrieval, merge, expansion, output | Design | Pending |
| ENR-02 | P1: WS6 — no LLM call during MCP query handling | Design | Pending |
| ENR-03 | P1: WS6 — enrichment usable as compact context | Design | Pending |
| ENR-04 | P1: WS6 — expanded results default to compact evidence | Design | Pending |
| ENR-05 | P1: WS6 — direct high-confidence results may carry live source | Design | Pending |
| ENR-06 | P1: WS6 — identity, path, symbol, type, lines, anchor, staleness preserved | Design | Pending |
| ENR-07 | P1: WS6 — enrichment never substitutes required exact source | Design | Pending |
| ENR-08 | P1: WS6 — missing enrichment degrades to AST metadata without failure | Design | Pending |
| ENR-09 | P1: WS6 — fallback results carry equal metadata completeness | Design | Pending |
| CTX-01 | P1: WS7 — candidate limits separate from final context budget | Design | Pending |
| CTX-02 | P1: WS7 — final context-assembly stage after all prior stages | Design | Pending |
| CTX-03 | P1: WS7 — smallest sufficient range selection | Design | Pending |
| CTX-04 | P1: WS7 — targeted ranges, not whole files, by default | Design | Pending |
| CTX-05 | P1: WS7 — exact-symbol queries prefer the exact construct node | Design | Pending |
| CTX-06 | P1: WS7 — class-level queries may use signature plus relevant members | Design | Pending |
| CTX-07 | P1: WS7 — conceptual queries select smallest sufficient chunks | Design | Pending |
| CTX-08 | P1: WS7 — expansion evidence defaults to compact form | Design | Pending |
| CTX-09 | P1: WS7 — no caller-side grep/find/shell needed on the normal path | Design | Pending |
| CTX-10 | P1: WS7 — precise source anchors on all evidence | Design | Pending |
| CTX-11 | P1: WS7 — get_file path-only may return the full file | Design | Pending |
| CTX-12 | P1: WS7 — get_file name/range returns only requested portions | Design | Pending |
| CTX-13 | P1: WS7 — deduplication before formatting across all listed duplicate classes | Design | Pending |
| CTX-14 | P1: WS7 — deterministic safe merging of overlapping ranges | Design | Pending |
| CTX-15 | P1: WS7 — ranking and provenance preserved after dedup/merge | Design | Pending |
| CTX-16 | P1: WS7 — source inclusion by priority and budget, not fixed rank cutoff | Design | Pending |
| BUD-01 | P1: WS8 — one budget contract across all routes and paths | Design | Pending |
| BUD-02 | P1: WS8 — explicit precedence between configured and adaptive budgets | Design | Pending |
| BUD-03 | P1: WS8 — all model-visible context counted or reserved | Design | Pending |
| BUD-04 | P1: WS8 — diagnostics compact, non-duplicating | Design | Pending |
| BUD-05 | P1: WS8 — budget enforced after live reads and assembly | Design | Pending |
| BUD-06 | P1: WS8 — empty stored payload not treated as costless | Design | Pending |
| BUD-07 | P1: WS8 — priority-ordered assembly ladder | Design | Pending |
| BUD-08 | P1: WS8 — one-node overflow exception with full reporting | Design | Pending |
| BUD-09 | P1: WS8 — exact required node never arbitrarily truncated | Design | Pending |
| BUD-10 | P1: WS8 — deterministic compaction or omission for lower priority | Design | Pending |
| BUD-11 | P1: WS8 — budget never silently exceeded for lower-priority evidence | Design | Pending |
| BUD-12 | P1: WS8 — token-cap metadata reflects the serialized response | Design | Pending |
| BUD-13 | P1: WS8 — conservative estimate with documented non-under-reporting margin | Design | Pending |
| BUD-14 | P1: WS8 — cache key covers query, plan, filters, expansion, budget, options, index generation | Design | Pending |
| BUD-15 | P1: WS8 — full compact diagnostics set returned | Design | Pending |
| BUD-16 | P1: WS8 — existence/aggregation source-free but fully accounted | Design | Pending |
| FAIL-01 | P1: WS9 — actionable diagnostics for all named failure classes | Design | Pending |
| FAIL-02 | P1: WS9 — degradation never returns unrelated evidence | Design | Pending |
| FAIL-03 | P1: WS9 — fallback preserves symbols, quoted terms and all filters | Design | Pending |
| FAIL-04 | P1: WS9 — unretrievable exact code reports failure plus best grounded anchor | Design | Pending |
| FAIL-05 | P1: WS9 — stale live source visibly marked | Design | Pending |
| FAIL-06 | P1: WS9 — empty vs low-confidence vs unavailable distinguishable | Design | Pending |
| FAIL-07 | P1: WS9 — failure information compact and budget-accounted | Design | Pending |
| FAIL-08 | P1: WS9 — degraded capabilities reported in the response | Design | Pending |
| DOC-01 | P2: Documentation — guidance describes budget-driven source selection | Tasks | Pending |
| DOC-02 | P2: Documentation — guidance explains new diagnostics | Tasks | Pending |
| DOC-03 | P2: Documentation — embedding-contract refusal and remediation documented | Tasks | Pending |
| DOC-04 | P2: Documentation — sparse-branch conditionality documented | Tasks | Pending |
| OPS-01 | P3: Operator visibility — persisted embedding contract reportable | — | Pending |
| OPS-02 | P3: Operator visibility — payload index state reportable | — | Pending |

**ID format:** `[CATEGORY]-[NUMBER]` — `EMB` (embedding contract), `SPR` (sparse retrieval),
`FLT` (filter-only/expansion), `INP` (embedding input safety), `QP` (query planning), `ENR`
(enrichment propagation), `CTX` (exact context), `BUD` (final budget), `FAIL` (failure and
degradation), `DOC` (documentation), `OPS` (operator visibility).

**Status values:** Pending → In Design → In Tasks → Implementing → Verified

**Coverage:** 105 total (11 EMB, 11 SPR, 13 FLT, 11 INP, 13 QP, 9 ENR, 16 CTX, 16 BUD, 8 FAIL,
4 DOC, 2 OPS); 0 mapped to tasks (Tasks phase not started) ⚠️

---

## Testing Requirements

Vitest, derived from the acceptance criteria above rather than from implementation structure.
No `packages/benchmark` file, schema, query, dashboard or metric may be modified.

**Provider contract tests** (WS1, WS4)
- Configured dimension is present in the request for models that support it and absent for those
  that do not.
- Unsupported configured dimension fails before any request, with provider, model and dimension
  in the message.
- Malformed provider responses, empty vectors, and wrong-length vectors are rejected before
  store or search, with configured and actual dimension in the message.
- Provider-side input truncation is disabled.
- Batch ordering is re-established from the provider response index.
- Per-input, per-batch item-count and per-request total-size limits are enforced.
- Retryable and non-retryable failures behave differently; partial batch failure preserves
  successes; retry exhaustion isolates to the failing input; cancellation is deterministic.

**Vector store / Qdrant adapter tests** (WS1, WS2, WS3)
- Named sparse search executes and returns results.
- Named dense vectors, filters, cursor pagination to exhaustion, and filter-only retrieval.
- Payload index creation, failure reporting, and index addition without destructive re-index.
- Repository isolation under filter-only retrieval and expansion.
- Non-destructive dimension-mismatch handling; fail-closed on unreadable schema.
- Every declared payload field round-trips through decode.

**Retrieval tests** (WS2, WS3, WS5)
- One plan drives routing; both layers report the same route and branches.
- The three channel representations differ in the documented ways and the original query is
  preserved verbatim.
- Exact symbols survive planning, retrieval and fallback.
- Expansion and fallback preserve repository filters, user metadata filters and test exclusion.
- Deterministic ordering by repository, path and start line.
- Deduplication across identical ids, cross-collection duplicates, repeated files and
  overlapping ranges.
- Routed and hybrid paths behave consistently for test exclusion, diversity and truncation.

**MCP contract tests** (WS6, WS7, WS8, WS9) — asserted against the **final serialized tool
response, after live source loading**
- `search_codebase` returns exact AST/source ranges, not unnecessary whole files.
- Expanded results default to compact metadata or enriched summaries.
- The one-node overflow rule: complete node, lower priority omitted, indicator set, reported
  amounts correct.
- Final token accounting, omitted counts, compaction counts and the full diagnostics set reflect
  the serialized response.
- `get_file` path-only remains full-file inspection; name and range remain targeted.
- Fallback preserves repository and metadata filters.
- A normal search response is sufficient without caller-side `grep`, `find` or shell navigation
  for the code the query named.
- Missing enrichment metadata degrades safely.
- Empty, low-confidence and infrastructure-unavailable outcomes are distinguishable.
- Stale content is visibly marked.
- Cache entries are not shared across differing plans, filters, expansion settings or budgets,
  and are invalidated by a new index generation.

---

## Success Criteria

- [ ] Zero remaining code paths issue a vector similarity query solely to select points by
      payload criteria.
- [ ] Zero embeddings are stored or searched without a dimension check against the configured
      contract.
- [ ] A keyword or symbol query verifiably executes a sparse branch, and the diagnostics report
      only branches that executed.
- [ ] `getUserById` and equivalent camelCase/PascalCase/dot/path/annotation/quoted forms are
      tokenized identically by the sparse and reranking paths, and the exact symbol is retrieved.
- [ ] In a multi-repo collection with colliding relative paths, no repository-scoped query —
      including through every expansion and fallback path — returns a result from another
      repository.
- [ ] Indexing a corpus containing inputs above the provider per-input limit completes with zero
      silently dropped chunks and a summary accounting for every skipped chunk.
- [ ] One query plan per request, with no downstream re-classification and no network call during
      planning; identical inputs yield identical plans.
- [ ] Enrichment description and tags for an enriched chunk are observable in the model-visible
      MCP response, and an unenriched chunk in the same response degrades to AST metadata without
      error.
- [ ] For a query naming an exact method in a large file, the response contains that method's
      line range and does not contain the whole file.
- [ ] The estimated token count reported in diagnostics is a conservative measurement of the
      final serialized response and never under-reports the true count beyond the documented
      margin.
- [ ] With a deliberately small budget, the serialized response respects it, except for the
      single documented exact-node overflow case, which reports its overflow amount.
- [ ] Every failure class named in WS9 produces a diagnostic naming what failed and the
      remediation, and never returns unrelated evidence.
- [ ] No file under `packages/benchmark` is modified.
- [ ] Injected agent guidance contains no statement contradicting observed tool behavior.
