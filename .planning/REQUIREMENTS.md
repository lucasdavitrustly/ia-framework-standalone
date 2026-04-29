# Requirements — v1.4: RAG Quality Improvements (Benchmark-Driven)

## Context

Benchmark A/B analysis (MCP vs without-MCP) showed +5% quality gain with +21% token overhead, winning 4/6 prompts. These improvements target specific regressions and amplification opportunities identified in the benchmark results.

## v1 Requirements

### Relevance Threshold (REL)

- **REL-01**: When no retrieved chunks exceed a configurable confidence threshold, return a "no relevant context found" signal instead of low-relevance chunks
- **REL-02**: The empty-result signal includes the query terms and suggests alternative search strategies (e.g., "try broader terms" or "this topic may not be in the indexed codebase")
- **REL-03**: Confidence threshold is configurable per collection with sensible defaults (cosine: 0.35, RRF: 0.01)

### Hierarchy-Aware Chunking (HIER)

- **HIER-01**: Class chunks preserve inheritance relationships (extends/implements) as metadata
- **HIER-02**: When a class method chunk is retrieved, the class hierarchy context (parent class, interfaces) is available as expandable context
- **HIER-03**: AST chunking respects parent-child class relationships — nested/inner classes stay grouped with their outer class
- **HIER-04**: Exception hierarchies are chunked as connected trees, not isolated classes

### Documentation Indexing (DOC)

- **DOC-01**: README.md, ARCHITECTURE.md, and module-level documentation files are indexed into Qdrant
- **DOC-02**: Documentation chunks receive a configurable relevance boost weight during retrieval (default: 1.3x)
- **DOC-03**: Documentation chunks are stored in a dedicated payload field type to distinguish from code chunks

### Query Classification (QCLS)

- **QCLS-01**: Incoming queries are classified into intent categories: semantic, keyword, negative, architecture
- **QCLS-02**: Negative queries (asking about something NOT in the codebase) skip retrieval and return early with "not found" signal
- **QCLS-03**: Keyword queries use hybrid/BM25 search preferentially over pure semantic
- **QCLS-04**: Architecture queries boost documentation chunks in results
- **QCLS-05**: Classification is lightweight (rule-based + embeddings similarity, no LLM call)

### Adaptive Retrieval (ADAPT)

- **ADAPT-01**: Query complexity is estimated based on classification, token count, and cross-file indicators
- **ADAPT-02**: Simple queries retrieve fewer chunks (3-5), complex queries retrieve more (8-15)
- **ADAPT-03**: Cross-file queries (mentioning multiple classes/modules) automatically expand retrieval depth
- **ADAPT-04**: Retrieval depth decisions are logged for benchmark analysis and tuning
- **ADAPT-05**: Default chunk counts are configurable per query intent category

## Traceability

| Requirement | Phase   | Status  |
| ----------- | ------- | ------- |
| REL-01      | Phase 1 | Pending |
| REL-02      | Phase 1 | Pending |
| REL-03      | Phase 1 | Pending |
| HIER-01     | Phase 2 | Complete |
| HIER-02     | Phase 2 | Pending |
| HIER-03     | Phase 2 | Complete |
| HIER-04     | Phase 2 | Pending |
| DOC-01      | Phase 3 | Pending |
| DOC-02      | Phase 3 | Pending |
| DOC-03      | Phase 3 | Pending |
| QCLS-01     | Phase 4 | Pending |
| QCLS-02     | Phase 4 | Pending |
| QCLS-03     | Phase 4 | Pending |
| QCLS-04     | Phase 4 | Pending |
| QCLS-05     | Phase 4 | Pending |
| ADAPT-01    | Phase 5 | Pending |
| ADAPT-02    | Phase 5 | Pending |
| ADAPT-03    | Phase 5 | Pending |
| ADAPT-04    | Phase 5 | Pending |
| ADAPT-05    | Phase 5 | Pending |
