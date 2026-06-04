# MCP Tool Contracts

**Date**: 2026-06-04 | **Feature**: 008-ast-llm-rag-optimization

## Tool: `search_codebase`

Unified semantic search — auto-routes through all vectors, applies full reranking pipeline.

### Parameters

| Name              | Type        | Required | Default | Description                                 |
| ----------------- | ----------- | -------- | ------- | ------------------------------------------- |
| `query`           | string      | yes      | —       | Natural language or identifier search query |
| `limit`           | number      | no       | 10      | Max results returned                        |
| `score_threshold` | number      | no       | 0.5     | Minimum similarity score (0-1)              |
| `expand_hops`     | 0 \| 1 \| 2 | no       | 2       | Dependency graph expansion depth            |
| `repo`            | string      | no       | —       | Filter to specific repo                     |
| `stereotype`      | string      | no       | —       | Filter by stereotype                        |
| `archLayer`       | string      | no       | —       | Filter by architectural layer               |
| `module`          | string      | no       | —       | Filter by module name                       |
| `language`        | string      | no       | —       | Filter by language                          |

### Response Shape

```typescript
interface SearchCodebaseResponse {
  results: Array<{
    relativePath: string;
    startLine: number;
    endLine: number;
    name?: string;
    parentName?: string;
    chunkType: string;
    stereotype?: string;
    archLayer?: string;
    description?: string;
    businessContext?: string;
    signature?: string;
    score: number;
    content?: string; // filesystem-read code (top-5 only)
    truncated?: boolean; // true if content exceeds 2000 token cap
  }>;
  queryType: 'semantic' | 'symbol' | 'keyword' | 'mixed';
  totalFound: number;
}
```

### Behavior

1. Classify query type (heuristic, no LLM)
2. Route to appropriate vectors (semantic/signature/sparse)
3. Multi-vector search with RRF fusion
4. Graph expansion (expand_hops)
5. BM25 rerank against query tokens
6. MMR diversity filter
7. Read code from filesystem for top-5 results
8. Return metadata-only for results 6-10

### Token Budget

- Total cap: ~8000 tokens across all results
- Top-5: full code content (max 2000 tokens each, truncated with note)
- Results 6-10: metadata only (description, signature, path)

---

## Tool: `get_file`

Retrieve full file content by relative path, with semantic search fallback.

### Parameters

| Name   | Type   | Required | Default | Description             |
| ------ | ------ | -------- | ------- | ----------------------- |
| `path` | string | yes      | —       | Relative file path      |
| `repo` | string | no       | —       | Filter to specific repo |

### Response Shape

```typescript
interface GetFileResponse {
  relativePath: string;
  content: string; // full file content from filesystem
  language: string;
  chunks?: Array<{
    // indexed chunk metadata if available
    startLine: number;
    endLine: number;
    name?: string;
    chunkType: string;
    stereotype?: string;
    description?: string;
  }>;
  fallbackUsed?: boolean; // true if path not found, semantic search used
}
```

### Behavior

1. Attempt filesystem read by relative path
2. If not found: semantic search for similar/matching files
3. Return full content + any indexed metadata

---

## Tool: `get_dependencies`

File-level or module-level dependency graph traversal.

### Parameters

| Name     | Type   | Required | Default | Description                        |
| -------- | ------ | -------- | ------- | ---------------------------------- |
| `path`   | string | no       | —       | Relative file path (file-level)    |
| `module` | string | no       | —       | Module name (module-level)         |
| `depth`  | number | no       | 1       | Traversal depth for module queries |
| `repo`   | string | no       | —       | Filter to specific repo            |

_One of `path` or `module` must be provided (not both)._

### Response Shape

```typescript
interface GetDependenciesResponse {
  target: string; // the queried path or module
  imports: Array<{
    path: string;
    symbols: string[];
    relation: string;
  }>;
  exports: Array<{
    symbol: string;
    type: string;
  }>;
  dependents: Array<{
    // files that depend on this target
    path: string;
    relation: string;
  }>;
  dependencyEdges: DependencyEdge[]; // raw edges from index
}
```

### Behavior

- If `path`: return file's indexed dependency edges (imports, exports, dependents)
- If `module`: BFS traversal up to `depth` hops, return module-level graph
- Error if both `path` and `module` provided
