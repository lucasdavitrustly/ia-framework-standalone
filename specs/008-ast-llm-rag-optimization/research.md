# Research: AST + LLM RAG Optimization

**Date**: 2026-06-04 | **Feature**: 008-ast-llm-rag-optimization

## Research Tasks & Findings

### 1. tree-sitter-yaml and tree-sitter-xml Availability

**Decision**: Use `tree-sitter-yaml` and `tree-sitter-xml` from `@tree-sitter-grammars` org (npm packages).

**Rationale**:

- Both are official tree-sitter grammars with high maturity
- The project already uses native tree-sitter bindings (not WASM) — `tree-sitter` ^0.22.4 with `tree-sitter-java` ^0.23.5
- `tree-sitter-yaml` handles YAML 1.2 spec, production-ready
- `tree-sitter-xml` handles XML + DTD, production-ready
- Both follow the same native binding pattern as tree-sitter-java

**Alternatives considered**:

- js-yaml + manual chunking: rejected — loses structural awareness, can't identify nested boundaries
- WASM tree-sitter: rejected — project uses native bindings, mixing would add complexity

**Installation**: `pnpm add tree-sitter-yaml tree-sitter-xml --filter @ia-framework/ast-parser`

---

### 2. Proto File Parsing Strategy

**Decision**: Custom regex/line-based chunker (no tree-sitter).

**Rationale**:

- Protocol Buffer grammar is simple and highly regular
- Three key constructs: `message`, `service`, `enum` — each starts with a keyword and ends with `}`
- A regex chunker splitting on these boundaries is simple, fast, and sufficient
- No tree-sitter-proto WASM or native binding exists in the npm ecosystem with production-level maturity
- The spec explicitly calls for "custom regex/line chunker" for .proto

**Alternatives considered**:

- tree-sitter-proto (community WASM): rejected — immature, WASM incompatible with native binding approach
- protobuf-parser npm: rejected — adds dependency for what regex handles trivially

---

### 3. Qdrant Named Vectors & Sparse Vector Configuration

**Decision**: Use Qdrant's native named vectors with 3 dense + 1 sparse configuration.

**Rationale**:

- The existing codebase already uses named vectors (`text`, `code`) — confirmed in `vector-store/src/interface.ts`
- Qdrant JS client supports named vectors natively via collection creation config
- Sparse vectors are supported via `sparse_vectors` collection config with `modifier: "idf"` for BM25-like scoring
- The migration from 2 vectors (`text`, `code`) to 3 (`semantic`, `signature`, `sparse`) requires collection recreation
- Current `VectorPoint` interface already has `sparseVector` field — the infrastructure is partially there

**Migration approach**: Detect old schema (has `text`/`code` vector names), prompt user, require `--force` to recreate.

**Alternatives considered**:

- Keep `text`/`code` naming: rejected — names don't reflect new purpose, confusing
- Separate collections per vector: rejected — loses ability to do multi-vector queries in single request

---

### 4. LLM Enrichment with Ollama — Batching Strategy

**Decision**: Send full file (or class group for large files) with chunk boundaries marked; receive structured JSON back for all chunks in one call.

**Rationale**:

- Ollama runs locally — no cost per token, latency is the concern
- One call per file (or per class group) is far more efficient than one call per chunk
- Max 10 methods per call (batched) for response quality
- Context window: qwen3:8b supports 32K tokens (configurable via numCtx)
- Large file strategy: group by AST class, send class context + methods per group

**Alternatives considered**:

- One LLM call per chunk: rejected — too many round trips, loses file-level context
- One LLM call per repo: rejected — exceeds context window, responses degrade at scale

---

### 5. Sparse Vector Implementation

**Decision**: Tokenize `name + imports + annotations + defines` fields, store as Qdrant native sparse vector per point.

**Rationale**:

- Qdrant native sparse vectors with IDF modifier provide BM25-like retrieval without external infrastructure
- The current system already has a `SparseVector` interface and sparse vector support in the Qdrant client
- Tokenization: split on camelCase boundaries, dots, underscores, and whitespace
- This enables exact identifier matching (e.g., "FiGatewayClient") without relying on dense embeddings

**Alternatives considered**:

- External BM25 index (e.g., Elasticsearch): rejected — violates local-first, adds infrastructure
- Dense-only with keyword expansion: rejected — dense embeddings poor at exact identifier matching

---

### 6. Query Classification for Unified Search

**Decision**: Heuristic classifier using regex patterns to detect query type, routes to appropriate vectors.

**Rationale**:

- No LLM call needed at query time (must stay <500ms)
- Classification rules:
  - CamelCase/dots/colons → symbol/structural → `signature` + `sparse`
  - Natural language (spaces, common words) → business/semantic → `semantic`
  - Mixed → all 3 vectors
  - Single token with uppercase → keyword → `sparse` + `semantic`
- Simple, fast, deterministic — aligns with Simplicity principle

**Alternatives considered**:

- LLM-based query classification: rejected — adds latency, violates local-first at query time
- Always search all vectors: rejected — noisy results, wastes compute on irrelevant vectors

---

### 7. Removing Raw Code from Qdrant

**Decision**: Store only metadata in Qdrant payload; read code from filesystem at retrieval time using `relativePath + startLine:endLine`.

**Rationale**:

- Reduces Qdrant storage by ~60% (raw code is the bulk of current payload)
- Code is always fresh (no stale content in index when file changes between re-indexes)
- `contentHash` enables drift detection (flag stale but still return)
- MCP server always runs on same machine as code (local-first assumption)
- Filesystem read of 10 files is <50ms on local SSD

**Alternatives considered**:

- Keep storing code: rejected — wastes storage, code goes stale
- Store compressed code: rejected — still stale, marginal storage savings

---

### 8. Dependency Graph Storage & Expansion

**Decision**: Store `dependencyEdges` on each chunk's metadata payload; traverse at query time using Qdrant filter queries.

**Rationale**:

- No separate graph database needed — edges stored inline in Qdrant payload
- Expansion: for each top-K result, look up its `dependencyEdges[].targetPath`, query Qdrant by `relativePath` filter
- Max 2 hops (configurable via `expand_hops`) to prevent explosion
- Current `dependency-graph.ts` in retrieval package already does graph traversal — enhance rather than replace

**Alternatives considered**:

- Neo4j/separate graph DB: rejected — violates local-first/simplicity, adds infrastructure
- SQLite graph: rejected — adds query complexity, Qdrant filter is sufficient
- In-memory graph (existing approach): partially kept — enhanced with indexed edge data

---

### 9. Existing Java Parser Capabilities

**Decision**: Enhance existing `packages/ast-parser/src/parsers/java.ts` (already uses tree-sitter-java native).

**Current capabilities** (confirmed via code review):

- Uses `tree-sitter` ^0.22.4 + `tree-sitter-java` ^0.23.5 (native bindings)
- Chunks by: class, interface, enum, record, method, constructor, field
- Extracts: name, imports, exports, superclass, interfaces, isInnerClass
- Handles inner classes, splits large methods by logical blocks
- Includes leading comments/annotations in chunks

**Enhancements needed**:

- Extract annotations array (for stereotype classification)
- Generate `class-signature` chunks (declaration + fields + method signatures, no bodies)
- Generate `contextHeader` (class name + fields, 3-5 lines)
- Extract `defines` (method/field names defined in chunk)
- Extract `calls` (method names invoked) — existing `call-extractor.ts` partially does this
- Extract visibility (public/protected/package/private)
- Pass annotations to classifier for stereotype detection

---

### 10. Migration from Existing Indexed Data

**Decision**: Clean break — detect old schema, prompt user, require `--force` re-index.

**Rationale**:

- Old schema stores raw code, uses `text`/`code` vector names — incompatible
- Gradual migration would require maintaining two code paths indefinitely
- Re-indexing a large codebase takes minutes (acceptable one-time cost)
- Detection: check collection vector names; if `text`/`code` exist → old schema

**Implementation**:

- On `ia-framework index`: check Qdrant collection config
- If old schema detected: print warning + instructions to run `--force`
- On `--force`: delete collection, recreate with new schema, full re-index
