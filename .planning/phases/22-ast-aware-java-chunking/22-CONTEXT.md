# Phase 22: AST-aware Java Semantic Chunking - Context

**Gathered:** 2026-04-24
**Status:** Ready for planning

<domain>
## Phase Boundary

Replace fixed-size Java chunking with web-tree-sitter AST-aware chunking at class and method boundaries. Each chunk maps to a complete, semantically coherent Java unit (class, method, constructor, interface). Existing TypeScript/Python grammars are unaffected.

Package: packages/core

</domain>

<decisions>
## Implementation Decisions

### Problem Statement (from benchmark run 2026-04-24)

MCP responses on architecture and cross-module dependency prompts scored lower than expected despite having code access. The chunking strategy splits Java files at fixed sizes, breaking class and method boundaries and losing structural context. The benchmark judge penalized incomplete/fragmented code references.

### Expected Impact

+3 to +5 quality points on Technical Depth and Code References dimensions across architecture/cross-file queries.

### Design Decisions

- **D-01:** Java grammar loaded via `tree-sitter-java` npm package (WASM grammar, consistent with existing web-tree-sitter setup).
- **D-02:** Chunk granularity: one chunk per top-level class/interface/enum declaration; methods within a class are sub-chunks that include the enclosing class signature as preamble. This preserves context while keeping chunks focused.
- **D-03:** Class-level preamble: every method chunk prepends `package`, `import` statements, and the class declaration header so the chunk is self-contained for retrieval.
- **D-04:** Language dispatch by file extension: `.java` → Java AST chunker; existing `.ts`/`.py` dispatch unchanged.
- **D-05:** Fallback: if tree-sitter fails to parse a Java file (syntax error or grammar mismatch), fall back to existing fixed-size chunking and log a warning.

### Agent's Discretion

- Exact AST node types to target (refer to tree-sitter-java grammar; `class_declaration`, `method_declaration`, `constructor_declaration`, `interface_declaration`)
- Maximum chunk size for very long methods (suggest splitting at logical block boundaries if >150 lines)
- Whether to include Javadoc comments as part of the chunk or as a separate `description` field

</decisions>

<canonical_refs>

## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Existing AST chunking (TypeScript/Python pattern to follow)

- `packages/core/src/chunking/ast-chunker.ts` — Current AST chunker (TypeScript/Python); Java must follow the same `ChunkingStrategy` interface
- `packages/core/src/chunking/strategies/` — Strategy implementations per language
- `packages/core/src/types.ts` — `ChunkMetadata` type (startLine, endLine, content, description, language)

### web-tree-sitter integration

- `packages/core/src/chunking/parser.ts` — Tree-sitter WASM loader; reuse for Java grammar
- Existing grammars: `tree-sitter-typescript`, `tree-sitter-python` — reference for grammar loading pattern

### Benchmark infrastructure (for verifying impact)

- `packages/benchmark/src/benchmark-runner.ts` — Run benchmark pre/post to measure improvement
- `.ia-framework/benchmark-queries.json` — Corpus includes Java/Spring Boot queries from 2026-04-24 run

</canonical_refs>

<code_context>

## Existing Code Insights

### Reusable Assets

- `AstChunkingStrategy`: Already dispatches by language; add Java as a new branch
- `web-tree-sitter` WASM loader: Already handles async grammar loading — Java grammar loads the same way
- `ChunkMetadata`: No schema changes needed; `language: "java"` is a valid string value

### Integration Points

- `IndexingPipeline`: Language detection from file extension → strategy selection
- `FileWalker`: Already includes `.java` in file discovery (or needs to be confirmed/added)
- `BenchmarkRunner`: Re-run on Java corpus after implementation to validate improvement

</code_context>

<specifics>
## Specific Ideas

- Consider adding `class_context` as an optional metadata field on method-level chunks: stores the enclosing class name and package for cross-reference without duplicating full preamble in stored payload.
- tree-sitter-java grammar npm package: `tree-sitter-java` (check WASM availability; may need `web-tree-sitter`-compatible WASM build).

</specifics>

<deferred>
## Deferred Ideas

- Kotlin grammar (same JVM ecosystem, future phase)
- Gradle build file parsing (deferred to Phase 24 Maven work)

</deferred>

---

_Phase: 22-ast-aware-java-chunking_
_Context gathered: 2026-04-24_
_Source: 2026-04-24 benchmark run findings_
