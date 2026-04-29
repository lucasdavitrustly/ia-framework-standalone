# Phase 2: Hierarchy-Aware Chunking — Research

**Researched:** 2026-04-29
**Status:** Complete

## Problem Statement

Currently, AST chunking extracts classes and methods as individual chunks with `parentName` tracking (methods know which class they belong to). However, **inheritance relationships** (extends/implements) are not captured or stored. When retrieving a subclass method, there's no connection to its superclass chain. Exception hierarchies (BaseException → DomainException → PaymentException) are stored as isolated chunks with no retrieval path between them.

## Current State

### What exists:

- `CodeChunk.parentName` — tracks enclosing class for method chunks (inner class grouping partially works)
- Java parser: `buildPreamble()` includes class signature line in method chunks
- TypeScript parser: class members get `parentName` set to class name
- `ChunkPayload` in Qdrant: has `parentName`, `imports`, `exports` fields
- `expand_hops` in MCP search: expands along import/dependency graph (file-level, not class-level)
- Maven module dependency graph: BFS traversal for cross-module dependencies

### What's missing:

- No `superclass`/`interfaces` metadata on class chunks
- No way to retrieve "the class hierarchy for X" — must manually search each level
- Inner classes get `parentName` set but no explicit nesting metadata
- Exception hierarchies are just regular classes with no tree linkage
- `expand_hops` works at file level (imports), not class inheritance level

## Architecture Decision

### Approach: Metadata-enriched chunks + Qdrant filter-based expansion

**Why not a separate graph DB?** The existing pattern (import-based expansion, maven graph) uses metadata filters on Qdrant itself. Adding a new graph store adds operational complexity for a feature that's queryable via payload filters.

**Design:**

1. **Extend `CodeChunk` type** with hierarchy metadata:

   ```typescript
   // New optional fields on CodeChunk
   superclass?: string | undefined;      // "BaseService" or "com.example.BaseService"
   interfaces?: string[] | undefined;    // ["Serializable", "Comparable<T>"]
   hierarchyPath?: string | undefined;   // "BaseException>DomainException>PaymentException"
   isInnerClass?: boolean | undefined;   // true if nested inside another class
   ```

2. **Extend `ChunkPayload`** (Qdrant stored metadata) with same fields.

3. **Modify Java parser** to extract `extends`/`implements` from AST:
   - tree-sitter Java: `superclass` field on `class_declaration` → `type_identifier`
   - tree-sitter Java: `interfaces` field on `class_declaration` → `type_list`
   - For inner classes: already have `enclosingName` flow, add `isInnerClass: true`

4. **Modify TypeScript parser** similarly:
   - tree-sitter TS: `class_heritage` → `extends_clause`, `implements_clause`
   - `interface_declaration` can also extend other interfaces

5. **Build hierarchy path at index time:**
   - After all chunks are parsed for a file, resolve parent-child class relationships within the same file
   - For cross-file hierarchies: store just the superclass name (resolved at query time via Qdrant filter)

6. **Add retrieval expansion for hierarchy:**
   - When a class chunk is retrieved, optionally fetch related chunks where `name == chunk.superclass` or `superclass == chunk.name`
   - Reuse existing `expand_hops` mechanism concept but for class hierarchy dimension

### Why this is minimal and correct:

- Extends existing types (no new packages)
- Uses existing Qdrant filter infrastructure
- Tree-sitter already exposes these AST nodes
- `hierarchyPath` enables exception tree queries without graph traversal

## Validation Architecture

### Testable behaviors:

1. **Java class with `extends`** → chunk has `superclass` field set
2. **Java class with `implements`** → chunk has `interfaces` array populated
3. **TypeScript class `extends` + `implements`** → same fields populated
4. **Inner class** → chunk has `isInnerClass: true` and `parentName` set
5. **Exception hierarchy** → each class in chain has `superclass` pointing up
6. **Retrieval expansion** → querying a subclass returns superclass chunks as expanded context

### Test fixtures needed:

- Java file with class hierarchy (3 levels)
- Java file with inner classes
- TypeScript file with class extending another + implementing interface
- Exception hierarchy spanning single file

## Implementation Scope

| Component                                          | Changes                                   | Complexity |
| -------------------------------------------------- | ----------------------------------------- | ---------- |
| `packages/ast-parser/src/types.ts`                 | Add 4 optional fields to CodeChunk        | Trivial    |
| `packages/ast-parser/src/parsers/java.ts`          | Extract extends/implements from AST nodes | Medium     |
| `packages/ast-parser/src/parsers/typescript.ts`    | Extract class_heritage nodes              | Medium     |
| `packages/vector-store/src/interface.ts`           | Add fields to ChunkPayload                | Trivial    |
| `packages/indexer/src/strategies/ast-strategy.ts`  | Pass new fields through to payload        | Low        |
| `packages/mcp-server/src/tools/search-codebase.ts` | Add hierarchy expansion option            | Medium     |

## Risks

1. **Cross-file hierarchy resolution at index time** — Would require two-pass indexing. Decision: Don't resolve cross-file at index time; store superclass name as string, resolve at query time via Qdrant payload filter.
2. **Generic types in extends** (e.g., `class Foo extends Bar<Baz>`) — tree-sitter provides the full generic text; store the base type name only for matching.
3. **Re-indexing required** — Existing indexed projects need re-index to populate new fields. This is acceptable (users run `ia-framework index` explicitly).

## Sources

- tree-sitter Java grammar: `class_declaration` has fields `superclass` (type_identifier) and `interfaces` (type_list)
- tree-sitter TypeScript grammar: `class_declaration` has `class_heritage` child with `extends_clause` and `implements_clause`
- Existing `expand_hops` pattern in `packages/mcp-server/src/tools/search-codebase.ts`
