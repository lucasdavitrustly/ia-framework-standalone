# Phase 30: Adaptive Chunking for Decorator/Aspect Patterns - Context

**Gathered:** 2026-04-29
**Status:** Ready for planning

<domain>
## Phase Boundary

Extend the chunker in `packages/core` to preserve decorator chains and aspect-oriented patterns as cohesive chunks. Currently, fixed-size (AST) chunking treats each annotated method as an independent node, stripping the decorator metadata from chunk boundaries. For Java Spring Boot codebases with `@Transactional`, `@Cacheable`, `@RolesAllowed`, `@Aspect`, `@Around` etc., a method chunk without its annotations loses critical architectural meaning.

Package in scope: `packages/core` (specifically `AstChunkingStrategy` and/or the LlmChunkingStrategy prompt).

</domain>

<decisions>
## Implementation Decisions

### Problem Statement (from benchmark results)

On AOP-style Spring Boot codebases, the model failed to identify cross-cutting concerns (security, caching, transaction boundaries) because:

1. `@Transactional @CacheEvict public void updateOrder(...)` was chunked as `updateOrder(...)` — annotations stripped.
2. `@Aspect @Component public class AuditAspect { @Around("...") ... }` was split into two chunks: the class declaration and the `@Around` method — losing the pointcut expression that defines what it intercepts.

### AST Strategy Fix

- **D-01:** In `AstChunkingStrategy`, when extracting a method node, walk upward to include all sibling annotation nodes that immediately precede the method in source order. Annotations are top-level decorators in the Java grammar (`marker_annotation`, `annotation`).
- **D-02:** For TypeScript/JavaScript, include `decorator` nodes (e.g., `@Injectable()`, `@Controller('/orders')`) that precede class and method declarations.
- **D-03:** For `@Aspect` classes: treat the entire aspect class as a single chunk rather than splitting into per-method chunks, because the pointcut expressions are only meaningful with the advice methods together. Apply this only when the class has `@Aspect` annotation.
- **D-04:** Update `buildPreamble()` (added in phase 23 for class context) to include aspect class annotations in the preamble for all method chunks within an `@Aspect` class — reinforces the AOP context even if the class is eventually split.

### LLM Strategy Prompt Update

- **D-05:** Add a new rule to the LLM chunking prompt: "Never split a decorator/annotation from the method or class it annotates. If a method has `@Transactional @CacheEvict`, the annotations MUST appear in the same chunk as the method signature and body."
- **D-06:** Add a Spring AOP few-shot example to the chunking prompt examples file: show an `@Aspect` class that should be kept together, and an annotated service method that must include its annotations.

### Chunk Type Extension

- **D-07:** Add `aspect` to the `chunkType` enum in `CodeChunk`. An `@Aspect`-annotated class produces a single chunk with `chunkType: 'aspect'`. This allows dashboard filtering and benchmark analysis to distinguish AOP chunks.

### Agent's Discretion

- Exact tree-sitter query patterns for annotation sibling detection
- Whether to add `annotation` as a separate `chunkType` or inline annotations into the parent method chunk
- Maximum annotation count before forcing a class-level chunk (e.g., >5 annotations on one method may indicate a complex cross-cutting concern)

</decisions>

<canonical_refs>

## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### AST chunking strategy (primary target)

- `packages/core/src/chunker/ast-chunking-strategy.ts` — `AstChunkingStrategy` with tree-sitter queries. Method extraction logic needs the annotation sibling walk. `buildPreamble()` is defined here.

### LLM chunking prompt and examples

- `packages/core/src/chunker/llm-chunking-strategy.ts` — `LlmChunkingStrategy`. The prompt injection and example loader are here.
- Chunking prompt file (path to be confirmed in implementation) — Spring AOP few-shot examples go here.

### CodeChunk type

- `packages/core/src/types.ts` — `CodeChunk` interface and `chunkType` enum. Add `'aspect'` type here.

### Java preamble precedent (phase 23)

- Phase 23 added `buildPreamble()` to inject class signature into method chunks. The same mechanism is used to inject `@Aspect` class annotations.

### Benchmark corpus

- `.ia-framework/benchmark-queries.json` — Queries touching AOP/cross-cutting concerns are the validation targets.

</canonical_refs>

<code_context>

## Existing Code Insights

### Annotation nodes in Java tree-sitter grammar

In the Java tree-sitter grammar, annotations appear as `marker_annotation` or `annotation` nodes at the same level as `method_declaration` within a `class_body`. They are siblings, not children, of the method node. The current extractor only captures `method_declaration` nodes without looking at preceding siblings.

### TypeScript decorators

In the TypeScript grammar, `decorator` nodes are children of `class_declaration` and `method_definition`. They precede the node they decorate. The current TypeScript chunker skips decorators.

### AstChunkingStrategy.extractChunks() structure

The method iterates over nodes matched by a tree-sitter query (e.g., `(method_declaration) @method`). For each match, it extracts `startPosition` and `endPosition`. The fix: after extracting a method node, scan backward in source text to include annotation lines (look for `@` before the method's `startPosition.row`).

### LLM chunking prompt already has few-shot examples

Phase 22 added Java boundary examples (constructor grouping, minimum 5-line enforcement). The AOP few-shot example appends to the same examples array in the prompt config.

</code_context>

<specifics>
## Specific Ideas

- Tree-sitter query for Java annotations preceding methods:
  ```
  (class_body
    (marker_annotation) @annotation
    .
    (method_declaration) @method)
  ```
  Use the `.` (immediate sibling) operator to capture only directly preceding annotations.
- For `@Aspect` class detection: check if the class's annotations include `@Aspect` before deciding to keep the class together.
- Integration test: a Spring Boot `@Aspect` class with one `@Before` and one `@Around` advice must produce exactly 1 chunk with `chunkType: 'aspect'` containing both advice methods and the class declaration.

</specifics>

<deferred>
## Deferred Ideas

- Python `@decorator` support — deferred to v1.5
- Detecting composed annotations (Spring meta-annotations like `@RestController` = `@Controller` + `@ResponseBody`) — too deep for v1.4
- Dashboard tab for `aspect` chunk type distribution — deferred

</deferred>

---

_Phase: 30-adaptive-decorator-chunking_
_Context gathered: 2026-04-29_
_Source: Milestone planning — RAG Retrieval Quality Improvements v1.4_
