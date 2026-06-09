# Data Model: AST + LLM RAG Optimization

**Date**: 2026-06-04 | **Feature**: 008-ast-llm-rag-optimization

## Entities

### ChunkPayload (Qdrant Point Payload)

The lean metadata payload stored per Qdrant point. Does NOT contain raw code — code is read from filesystem at retrieval time.

```typescript
interface ChunkPayload {
  // === Identity ===
  chunkId: string; // SHA1(filePath + ':' + startLine + ':' + endLine)
  relativePath: string; // path relative to repo root
  repoId?: string; // source repo identifier

  // === Location (for filesystem retrieval) ===
  startLine: number; // 1-indexed
  endLine: number; // 1-indexed
  contentHash: string; // SHA256 of content at index time (drift detection)

  // === Signatures ===
  signature?: string; // method/class signature line
  classSignature?: string; // enclosing class declaration
  contextHeader?: string; // class name + fields (3-5 lines, prepended for disambiguation)

  // === AST-Derived (deterministic) ===
  language: string; // java, typescript, proto, xml, yaml, sql
  chunkType: ChunkType;
  name?: string; // symbol name (method/class/service)
  parentName?: string; // enclosing class/module name
  packageName?: string; // Java package or TS module path
  moduleInfo: ModuleInfo;
  mavenCoordinates?: MavenCoordinates;
  visibility?: 'public' | 'protected' | 'package' | 'private';
  annotations?: string[]; // @RestController, @Service, etc.
  imports: string[];
  exports: string[];
  defines?: string[]; // symbols defined in this chunk
  calls?: string[]; // symbols called/referenced
  superclass?: string;
  interfaces?: string[];

  // === Classification (heuristic, no LLM) ===
  stereotype?: Stereotype;
  archLayer?: ArchLayer;
  complexity?: 'low' | 'medium' | 'high';

  // === LLM-Enriched (Ollama) ===
  description?: string; // "Schedules payment retry with exponential backoff"
  businessContext?: string; // "Part of payment resilience flow"
  serviceBoundary?: string; // "payment-processing"
  semanticTags?: string[]; // ["retry", "resilience", "payment"]
  relationships?: RelationshipTag[];

  // === Dependency Graph ===
  dependencyEdges?: DependencyEdge[];

  // === Index Metadata ===
  indexedAt: string; // ISO timestamp
  enrichedAt?: string; // when LLM enrichment completed
  enrichmentModel?: string; // "qwen3:8b"
  qualityScore?: number;
}
```

### Supporting Types

```typescript
type ChunkType =
  | 'method'
  | 'class-signature'
  | 'class'
  | 'interface'
  | 'type'
  | 'enum'
  | 'module'
  | 'config-block'
  | 'service-def'
  | 'message-def'
  | 'migration'
  | 'aspect'
  | 'other';

type Stereotype =
  | 'controller'
  | 'service'
  | 'repository'
  | 'entity'
  | 'dto'
  | 'mapper'
  | 'config'
  | 'aspect'
  | 'filter'
  | 'interceptor'
  | 'exception-handler'
  | 'validator'
  | 'event-listener'
  | 'scheduler'
  | 'client'
  | 'gateway'
  | 'test'
  | 'proto-service'
  | 'proto-message'
  | 'unknown';

type ArchLayer =
  | 'presentation'
  | 'service'
  | 'domain'
  | 'persistence'
  | 'infrastructure'
  | 'crosscutting';

interface ModuleInfo {
  group: string; // top-level directory (e.g., "payments")
  module: string; // second-level (e.g., "merchant-gateway")
  submodule?: string; // third-level (e.g., "merchant-gateway-core")
}

interface MavenCoordinates {
  groupId: string; // "com.company.payments"
  artifactId: string; // "merchant-gateway-core"
  version: string; // "1.2.3"
}

interface RelationshipTag {
  target: string; // stored as-is from LLM (e.g., "PaymentRepository.java")
  type: 'uses' | 'implements' | 'extends' | 'configures' | 'produces' | 'consumes' | 'tests';
  label?: string; // "calls FI gateway for retry"
}

interface DependencyEdge {
  targetPath: string; // relative path of target file
  relation: 'imports' | 'exports' | 'implements' | 'configures' | 'references' | 'generates';
  symbols?: string[]; // specific symbols involved
}
```

### VectorPoint (Qdrant Upsert)

```typescript
interface VectorPoint {
  id: string; // chunkId
  vectors: {
    semantic: number[]; // embedded from: description + businessContext + semanticTags
    signature: number[]; // embedded from: signature + contextHeader
    sparse: SparseVector; // tokenized: name + defines + imports + annotations
  };
  payload: ChunkPayload;
}

interface SparseVector {
  indices: number[]; // token hash positions
  values: number[]; // term frequency counts
}
```

## Relationships

```
ChunkPayload 1──* DependencyEdge      (chunk has many outgoing dependency edges)
ChunkPayload 1──* RelationshipTag     (chunk has many LLM-identified relationships)
ChunkPayload *──1 ModuleInfo           (chunk belongs to one module)
ChunkPayload *──1 MavenCoordinates     (chunk optionally has Maven coords)
VectorPoint  1──1 ChunkPayload         (each Qdrant point has exactly one payload)
```

## State Transitions

### Chunk Lifecycle

```
File discovered → AST parsed → Classified → [LLM enriched] → Embedded → Stored in Qdrant
                                                ↓ (Ollama unavailable)
                                         Stored without enrichment fields
```

### Incremental Update

```
File changed (git-diff) → Re-parse → Re-classify → Check contentHash cache
  → Cache hit: skip LLM call, reuse enrichment
  → Cache miss: Re-enrich → Re-embed → Upsert (replaces old point)
```

## Validation Rules

- `chunkId` MUST be deterministic: SHA1 of `relativePath + ':' + startLine + ':' + endLine`
- `contentHash` MUST be SHA256 of the chunk's source code content
- `startLine` and `endLine` MUST be 1-indexed
- `imports` and `exports` arrays MUST NOT contain duplicates
- `stereotype` MUST only be set when positive evidence exists (annotations, inheritance, naming)
- `semanticTags` SHOULD contain 3-7 labels when LLM enrichment is available
- `contextHeader` MUST NOT exceed 5 lines
- `dependencyEdges[].targetPath` MUST be relative to repo root

## Indexes (Qdrant Payload Indexes)

| Field               | Index Type | Purpose                                                  |
| ------------------- | ---------- | -------------------------------------------------------- |
| `stereotype`        | keyword    | Filter by architectural role                             |
| `archLayer`         | keyword    | Filter by architectural layer                            |
| `moduleInfo.module` | keyword    | Filter by module name                                    |
| `language`          | keyword    | Filter by language                                       |
| `repoId`            | keyword    | Filter by repository                                     |
| `relativePath`      | keyword    | Lookup by file path (for get_file, dependency expansion) |

## Collection Configuration

```typescript
// New Qdrant collection schema
{
  vectors: {
    semantic: { size: 768, distance: 'Cosine' },
    signature: { size: 768, distance: 'Cosine' },
  },
  sparse_vectors: {
    sparse: { modifier: 'idf' }
  },
  // Payload indexes created on initialization
}
```
