# Roadmap — v1.4: RAG Quality Improvements (Benchmark-Driven)

## Phases

- [x] **Phase 1: Relevance Threshold** - Signal "no relevant context" instead of returning low-confidence chunks
- [ ] **Phase 2: Hierarchy-Aware Chunking** - Preserve class inheritance relationships in AST chunking
- [ ] **Phase 3: Documentation Indexing** - Index architecture docs with boosted retrieval weight
- [ ] **Phase 4: Query Intent Classification** - Classify queries to route retrieval strategy
- [ ] **Phase 5: Adaptive Retrieval Depth** - Dynamically adjust chunk count based on query complexity

## Phase Details

### Phase 1: Relevance Threshold

**Goal**: Users never receive irrelevant context that wastes tokens and confuses the LLM
**Depends on**: Nothing
**Requirements**: REL-01, REL-02, REL-03
**Success Criteria** (what must be TRUE):

1. A query about a topic not in the codebase returns "no relevant context found" instead of low-score chunks
2. The threshold is configurable and respects different score scales (cosine vs RRF)
3. The empty-result signal suggests what the user can try instead
   **Plans**: [Plan 01 — Complete](phases/01-relevance-threshold/plans/01/SUMMARY.md)

### Phase 2: Hierarchy-Aware Chunking

**Goal**: Class hierarchies are retrievable as connected structures, not isolated fragments
**Depends on**: Phase 1
**Requirements**: HIER-01, HIER-02, HIER-03, HIER-04
**Success Criteria** (what must be TRUE):

1. Retrieving a method from a subclass includes its inheritance chain (extends/implements) as context
2. Inner/nested classes are grouped with their outer class in chunks
3. Exception hierarchies (e.g., BaseException → DomainException → PaymentException) are retrievable as a connected tree
4. A query about error handling returns the full exception hierarchy, not just one isolated class
   **Plans**: 2 plans

Plans:

- [x] 02-01-PLAN.md — Extract hierarchy metadata (extends/implements) from Java and TypeScript AST
- [x] 02-02-PLAN.md — Wire hierarchy to Qdrant payload and add hierarchy-aware retrieval expansion

### Phase 3: Documentation Indexing

**Goal**: Architecture and module documentation amplifies semantic/architecture query quality
**Depends on**: Phase 1
**Requirements**: DOC-01, DOC-02, DOC-03
**Success Criteria** (what must be TRUE):

1. README and architecture docs appear in Qdrant as searchable chunks
2. An architecture query (e.g., "how is the payment flow structured?") ranks doc chunks higher than code chunks
3. Doc chunks are distinguishable from code chunks in retrieval results
   **Plans**: TBD

### Phase 4: Query Intent Classification

**Goal**: Different query types get optimal retrieval strategies automatically
**Depends on**: Phase 1, Phase 3
**Requirements**: QCLS-01, QCLS-02, QCLS-03, QCLS-04, QCLS-05
**Success Criteria** (what must be TRUE):

1. A negative query ("does the system use WebSocket?") returns early without retrieving irrelevant chunks
2. A keyword query (exact class name) uses hybrid/BM25 search and finds the exact match
3. An architecture query boosts documentation chunks in results
4. Classification adds negligible latency (no LLM call, rule-based)
   **Plans**: TBD

### Phase 5: Adaptive Retrieval Depth

**Goal**: Token-quality tradeoff is optimized per query — simple queries are lean, complex queries are thorough
**Depends on**: Phase 4
**Requirements**: ADAPT-01, ADAPT-02, ADAPT-03, ADAPT-04, ADAPT-05
**Success Criteria** (what must be TRUE):

1. A simple "find class X" query retrieves 3-5 chunks, not 10+
2. A cross-file query ("how do modules A and B interact?") retrieves 8-15 chunks with expanded depth
3. Retrieval depth decisions are logged and visible in benchmark results
4. Default chunk counts per intent category are configurable without code changes
   **Plans**: TBD

## Progress

| Phase                          | Plans Complete | Status      | Completed  |
| ------------------------------ | -------------- | ----------- | ---------- |
| 1. Relevance Threshold         | 1/1            | Complete    | 2026-04-29 |
| 2. Hierarchy-Aware Chunking    | 0/?            | Not started | -          |
| 3. Documentation Indexing      | 0/?            | Not started | -          |
| 4. Query Intent Classification | 0/?            | Not started | -          |
| 5. Adaptive Retrieval Depth    | 0/?            | Not started | -          |
