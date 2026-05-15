# Discussion Log — Phase 38: Line-Number-Aware Chunking

## Session: 2026-05-15

### Codebase Scout Findings

Scouted the entire pipeline for line number support. Key finding: **line numbers already exist at every layer** — CodeChunk, ChunkPayload, pipeline, RetrievalResult. The only gap is the MCP `formatResult()` function which has the data but doesn't render it.

This dramatically reduces Phase 38 scope from "add line numbers to the pipeline" to "surface existing line numbers in MCP output + add validation."

### Gray Area 1: Scope Confirmation (LNC-01/02/03)

**Verified pre-met.** Evidence:

- `CodeChunk.startLine/endLine` at `ast-parser/src/types.ts:29-32`
- `ChunkPayload.startLine/endLine` at `vector-store/src/interface.ts:14-15`
- Pipeline copy at `indexer/src/pipeline.ts:142-143`
- `RetrievalResult` at `retrieval/src/search-engine.ts:24-25,50-51`

No discussion needed — code speaks for itself.

### Gray Area 2: Line Number Display Format

**Options presented:**

1. Header suffix (`:10-25` appended to file path) — **SELECTED**
2. Separate metadata line
3. Header + numbered code lines

**Decision:** Header suffix. Compact, matches IDE conventions, no extra token overhead.

### Gray Area 3: Line Number Validation (LNC-05)

**Options presented:**

1. Warn and index — **SELECTED**
2. Clamp and index
3. Skip the chunk

**Decision:** Warn and index. Tree-sitter is reliable; blocking risks data loss.

### Gray Area 4: Re-Index Migration

**Options presented:**

1. No re-index needed — **SELECTED**
2. Full re-index

**Decision:** No re-index. Existing data already has line numbers stored. Format change is immediate.
