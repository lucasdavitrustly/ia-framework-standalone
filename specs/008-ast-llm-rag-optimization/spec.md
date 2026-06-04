# Feature Specification: AST + LLM RAG Optimization

**Feature Branch**: `feat/008-ast-llm-rag-optimization`

**Created**: 2026-06-04

**Status**: Draft

**Input**: User description: "Improve chunking and indexing of the codebase. Optimize RAG ratio, create better chunkings enriched with Ollama provider LLM, use AST to create metadata and dependency graph."

## User Scenarios & Testing _(mandatory)_

### User Story 1 - Enriched Chunk Indexing with LLM Metadata (Priority: P1)

A developer triggers codebase indexing. The system parses source files using AST, creates semantically meaningful chunks, classifies them by stereotype and architectural layer, then enriches each chunk with LLM-generated metadata (business context, boundary descriptions, service relationships, semantic tags) via the Ollama provider. The enriched chunks are stored in the vector store as lean metadata payloads (no raw code), improving retrieval accuracy.

**Why this priority**: This is the core value proposition — enriching chunks with contextual metadata directly improves both precision and recall of the RAG system. Without this, all other improvements have limited impact.

**Independent Test**: Can be tested by indexing a sample repository and verifying that chunks contain LLM-generated metadata fields (description, business context, relationships, semantic tags) and that raw code is NOT stored in Qdrant.

**Acceptance Scenarios**:

1. **Given** a Java source file with a @Service annotated class, **When** the indexer processes it, **Then** each chunk includes AST-derived metadata (signature, annotations, imports) AND LLM-generated metadata (description, businessContext, semanticTags, relationships), with stereotype "service" and archLayer "service".
2. **Given** a .proto file defining service contracts, **When** the indexer processes it, **Then** chunks capture service definitions, message types, and LLM-generated descriptions of what each service does and which components consume it.
3. **Given** the Ollama provider is unavailable, **When** indexing is triggered, **Then** the system falls back to AST-only metadata (no LLM enrichment) and logs a warning, without failing the indexing process.
4. **Given** an indexed chunk is retrieved, **When** the system returns results, **Then** the raw code is read from the filesystem using `relativePath + startLine:endLine` (not from Qdrant payload).

---

### User Story 2 - Improved Dependency Graph at Index Time (Priority: P2)

During indexing, the system builds a comprehensive dependency graph by analyzing imports, exports, service references, and configuration bindings across all supported file types. This graph is stored as dependency edges on each chunk's metadata and used during retrieval to expand results along dependency edges.

**Why this priority**: The dependency graph enables multi-hop retrieval and context expansion, which directly addresses the "missing relevant code" (low recall) problem.

**Independent Test**: Can be tested by indexing a multi-file project and querying the dependency graph to verify that cross-file relationships (imports, service bindings, proto references) are correctly captured.

**Acceptance Scenarios**:

1. **Given** a Java file that imports from three other modules, **When** indexed, **Then** the dependency graph contains edges from this file to all three imported modules with relationship type "imports".
2. **Given** a YAML configuration file that references service classes or proto definitions, **When** indexed, **Then** the dependency graph links the config file to the referenced services/protos.
3. **Given** a .proto file defining a service used by multiple Java files, **When** the graph is queried for that proto, **Then** all consuming files are returned as dependents.

---

### User Story 3 - Better Chunk Boundaries via AST Analysis (Priority: P2)

The chunker uses AST parsing to create chunks that align with code semantics — never splitting mid-function, mid-class, or mid-block. Chunks respect logical boundaries (complete functions, class definitions, configuration blocks) and include sufficient context (leading comments, decorators, type annotations). Each method chunk includes a contextHeader (class signature + fields, 3-5 lines) for disambiguation.

**Why this priority**: Poor chunk boundaries cause both precision issues (irrelevant content in chunk) and recall issues (relevant content split across chunks). This directly addresses the "chunks too large/small/poorly bounded" pain point.

**Independent Test**: Can be tested by indexing files with complex nesting and verifying that no chunk splits a function/class/block mid-definition.

**Acceptance Scenarios**:

1. **Given** a Java file with a 200-line class containing 8 methods, **When** chunked, **Then** each method is its own chunk (with class contextHeader preserved), a class-signature chunk is created, and no chunk splits a method body.
2. **Given** a YAML configuration file with multiple top-level service definitions, **When** chunked, **Then** each service definition is a separate chunk with its full nested configuration preserved.
3. **Given** a .proto file with message and service definitions, **When** chunked, **Then** each message/service is a distinct chunk including associated comments.

---

### User Story 4 - Extended Language Support (Priority: P3)

The AST chunker and indexer support .xml, .proto, and .yaml/.yml files in addition to the existing TypeScript/JavaScript/Java support. Each language has appropriate AST parsing and chunk boundary logic.

**Why this priority**: Extends coverage to configuration and contract files that are critical for understanding service architecture, but builds on the core chunking infrastructure from P1/P2.

**Independent Test**: Can be tested by indexing a project containing .xml, .proto, and .yaml files and verifying chunks are created with correct boundaries and metadata.

**Acceptance Scenarios**:

1. **Given** a .proto file with service and message definitions, **When** processed by the AST chunker, **Then** it produces semantically meaningful chunks respecting protobuf grammar (services, messages, enums as boundaries).
2. **Given** a .yaml configuration file with nested structures, **When** processed, **Then** top-level keys or logical groupings become chunk boundaries.
3. **Given** an .xml file (e.g., Spring config, Maven POM), **When** processed, **Then** major elements (beans, dependencies, plugins) are chunked as logical units.

---

### User Story 5 - Improved Retrieval Precision and Recall (Priority: P3)

After re-indexing with the improved pipeline, search queries return more relevant results (higher precision) and fewer missed results (higher recall). The enriched metadata enables semantic matching on business context, not just code tokens. The three-vector strategy (semantic, signature, sparse) serves distinct retrieval needs.

**Why this priority**: This is the end-to-end validation that all improvements deliver measurable RAG quality gains.

**Independent Test**: Can be tested by running the existing benchmark suite before and after re-indexing and comparing precision/recall metrics.

**Acceptance Scenarios**:

1. **Given** a query about a business concept (e.g., "payment retry logic"), **When** searched via the semantic vector, **Then** results include all relevant files even if they don't contain the exact query terms, because LLM metadata captures the business context.
2. **Given** a query for a specific method (e.g., "PaymentService.processPayment"), **When** searched via the signature vector, **Then** results include the exact method chunk with its class context.
3. **Given** a query with identifiers (e.g., "FiGatewayClient"), **When** searched via sparse vector, **Then** all chunks that import/call/define that symbol are returned.
4. **Given** the benchmark suite, **When** run against the re-indexed codebase, **Then** precision@5 and recall@10 metrics improve compared to the baseline.

---

### Edge Cases

- What happens when a file is too large for the LLM context window during enrichment? (Group by class using AST metadata — send class signature + imports + method bodies per group)
- How does the system handle files with syntax errors that prevent AST parsing? (Fall back to line-based chunking with a warning)
- What happens when .proto files reference types defined in other .proto files? (Cross-file references stored as-is in relationships, resolved at query time)
- How are generated files (from .proto) handled to avoid duplicate indexing? (Configurable exclusion patterns for generated output directories)
- What happens when a file changes after indexing? (contentHash mismatch detected at retrieval time, result flagged as "possibly stale", still returned)

## Clarifications

### Session 2026-06-04

- Q: Incremental check mechanism — contentHash or git-diff? → A: git-diff primary for detecting changed files, contentHash stored for drift detection at retrieval time (FR-009).
- Q: How should Ollama concurrency be determined on non-NVIDIA systems (macOS/Metal)? → A: Fixed default of 2 concurrent requests with manual override in project.json (`enrichment.concurrency`). No GPU auto-detection.
- Q: When does the internal health check (former benchmark_preflight) run? → A: Lazy — on first search request. Failures are logged (visible in dashboard Logs page) and the system degrades gracefully.
- Q: Maximum methods per LLM enrichment call? → A: Max 10 methods per call (batched). Every file/class is fully chunked. No token limit concern since Ollama runs locally — batching is for response quality, not cost.
- Q: Sparse vector implementation approach? → A: Qdrant native sparse vectors (tokenize name+imports+annotations, store as sparse vector per point) enabling proper RRF fusion in multi-vector queries.

## Chunk Data Model _(mandatory)_

### Storage Architecture

```
Qdrant (lean metadata + 3 named vectors, NO raw code)
  ├── vectors: { semantic, signature, sparse }
  ├── payload: ChunkPayload (see below)
  └── payload indexes: stereotype (keyword), archLayer (keyword), module.module (keyword)

Filesystem (source of truth for code content)
  └── read at retrieval time using relativePath + startLine:endLine
  └── contentHash for drift detection (flag stale, still return)
```

### Retrieval Flow

```
Query → search Qdrant (semantic/signature/sparse + metadata filters)
      → get top-K points (metadata only)
      → for each result: read file[startLine:endLine] from filesystem
      → return metadata + live code to LLM
```

### Vector Strategy

| Vector      | Purpose          | Embedded from                                                                   | Search use case                           |
| ----------- | ---------------- | ------------------------------------------------------------------------------- | ----------------------------------------- |
| `semantic`  | Business meaning | description + businessContext + semanticTags                                    | "What handles payment retries?"           |
| `signature` | Code structure   | signature + contextHeader (class + fields)                                      | "Where is PaymentService.processPayment?" |
| `sparse`    | Keyword matching | name + defines + imports + annotations (Qdrant native sparse vector, tokenized) | "Find code using FiGatewayClient"         |

### ChunkPayload (stored in Qdrant)

```typescript
interface ChunkPayload {
  // === Identity ===
  chunkId: string;
  relativePath: string;
  repoId?: string;

  // === Location (for content retrieval from filesystem) ===
  startLine: number;
  endLine: number;
  contentHash: string; // SHA256 of content at index time — detect drift

  // === Signatures ===
  signature?: string; // method/class signature
  classSignature?: string; // enclosing class declaration
  contextHeader?: string; // class name + fields (3-5 lines, prepended for disambiguation)

  // === AST-Derived (deterministic, fast) ===
  language: string; // java, typescript, proto, xml, yaml
  chunkType: ChunkType;
  name?: string; // symbol name (method/class/service name)
  parentName?: string; // enclosing class/module
  packageName?: string; // Java package or TS module path
  moduleInfo: {
    // structured module context (derived from path + pom.xml)
    group: string; // "payments"
    module: string; // "merchant-gateway"
    submodule?: string; // "core"
  };
  mavenCoordinates?: {
    // parsed from nearest pom.xml
    groupId: string; // "com.company.payments"
    artifactId: string; // "merchant-gateway-core"
    version: string; // "1.2.3"
  };
  visibility?: 'public' | 'protected' | 'package' | 'private';
  annotations?: string[]; // @RestController, @Service, @Entity, etc.
  imports: string[];
  exports: string[];
  defines?: string[]; // symbols defined in this chunk
  calls?: string[]; // symbols called/referenced
  superclass?: string;
  interfaces?: string[];

  // === Classification (AST + heuristics, no LLM) ===
  stereotype?: Stereotype;
  archLayer?: ArchLayer;
  complexity?: 'low' | 'medium' | 'high';

  // === LLM-Enriched (Ollama, inline during indexing) ===
  description?: string; // "Schedules payment retry with exponential backoff when FI gateway fails"
  businessContext?: string; // "Part of payment resilience flow, triggered on transient FI errors"
  serviceBoundary?: string; // "payment-processing"
  semanticTags?: string[]; // ["retry", "resilience", "payment", "fi-gateway"]
  relationships?: RelationshipTag[]; // stored as-is, resolved at query time

  // === Dependency Graph ===
  dependencyEdges?: DependencyEdge[];

  // === Index Metadata ===
  indexedAt: string;
  enrichedAt?: string; // when LLM enrichment was done
  enrichmentModel?: string; // "qwen3:8b"
  qualityScore?: number;
}

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

interface RelationshipTag {
  target: string; // stored as-is from LLM (e.g., "PaymentRepository.java"), resolved at query time
  type: 'uses' | 'implements' | 'extends' | 'configures' | 'produces' | 'consumes' | 'tests';
  label?: string; // "calls FI gateway for retry"
}

interface DependencyEdge {
  targetPath: string;
  relation: 'imports' | 'exports' | 'implements' | 'configures' | 'references' | 'generates';
  symbols?: string[];
}
```

### Stereotype Detection (heuristic, no LLM)

Detection uses **positive evidence only** (annotations, inheritance, naming conventions). If no pattern matches, the chunk gets `stereotype: unknown`.

```
Spring Framework:
- @Controller, @RestController          → stereotype: controller,  archLayer: presentation
- @Service, @Component (in *.service.*) → stereotype: service,     archLayer: service
- @Repository, extends JpaRepository    → stereotype: repository,  archLayer: persistence
- @Entity, @Embeddable, @MappedSuperclass → stereotype: entity,   archLayer: persistence
- @Configuration, @Bean                 → stereotype: config,      archLayer: infrastructure
- @Aspect, @ControllerAdvice            → stereotype: aspect,      archLayer: crosscutting
- @Scheduled                            → stereotype: scheduler,   archLayer: infrastructure

Google Guice / JavaLite:
- extends AbstractModule, install(), bind() → stereotype: config,  archLayer: infrastructure
- @Provides                             → stereotype: config,      archLayer: infrastructure
- @ImplementedBy, @ProvidedBy           → (captured as relationship, not a stereotype)
- @Inject (Guice or Spring)             → (inherits from class context)
- @Singleton (Guice)                    → (modifier, not a stereotype)

JavaLite ActiveJDBC:
- extends Model                         → stereotype: entity,      archLayer: persistence
- @Table, @IdName, @DbName             → stereotype: entity,      archLayer: persistence

Raw JDBC / PreparedStatement:
- Class using JdbcTemplate / NamedParameterJdbcTemplate → stereotype: repository, archLayer: persistence
- Class using PreparedStatement / Connection.prepareStatement() → stereotype: repository, archLayer: persistence
- Classes used in RowMapper<T>, BeanPropertyRowMapper → stereotype: dto, archLayer: domain

Flyway Migrations:
- extends BaseJavaMigration             → stereotype: config,      archLayer: infrastructure
- SQL files matching V*__*.sql in db/migration/ → stereotype: config, archLayer: infrastructure

Naming Conventions (fallback):
- *Client, *Gateway                     → stereotype: client/gateway, archLayer: infrastructure
- *Dto, *Request, *Response             → stereotype: dto,         archLayer: domain
- *Mapper, *Converter                   → stereotype: mapper,      archLayer: infrastructure
- *Test, *Spec                          → stereotype: test,        archLayer: crosscutting
```

### Module Detection (from path + pom.xml)

```
Path: payments/merchant-gateway/merchant-gateway-core/src/main/java/com/company/fi/service/PaymentService.java

Resolution:
1. Walk up directory tree from file until finding pom.xml
2. Extract module structure from path segments above src/:
   group:     "payments"              (top-level directory)
   module:    "merchant-gateway"      (second-level)
   submodule: "merchant-gateway-core" (third-level, contains pom.xml)
3. Parse pom.xml for Maven coordinates:
   groupId:    "com.company.payments"
   artifactId: "merchant-gateway-core"
   version:    "1.2.3"
```

### Database & Migration Handling

#### Entity Detection (positive evidence only)

The system classifies database entities ONLY when there is explicit evidence. Not all classes are entities — classification requires annotation or inheritance proof:

| ORM / Pattern                  | Detection                                                         | Stereotype | Layer       |
| ------------------------------ | ----------------------------------------------------------------- | ---------- | ----------- |
| **Spring JPA**                 | `@Entity`, `@Table`, `@MappedSuperclass`, `@Embeddable`           | entity     | persistence |
| **JavaLite ActiveJDBC**        | `extends Model`, `@Table`, `@IdName`, `@DbName`                   | entity     | persistence |
| **JDBC Template**              | Class using `JdbcTemplate` / `NamedParameterJdbcTemplate`         | repository | persistence |
| **PreparedStatement**          | Class using `PreparedStatement` / `Connection.prepareStatement()` | repository | persistence |
| **RowMapper / result classes** | Classes used as `RowMapper<T>` targets                            | dto        | domain      |

Classes without any of the above patterns are classified by other heuristics (service, dto, unknown, etc.). The system never guesses "entity" without proof.

#### Flyway Migration Chunking

- Each Flyway SQL migration file (`V*__*.sql`) = **one chunk** (chunkType: `migration`)
- Java migrations (`extends BaseJavaMigration`) = chunked like normal Java classes (stereotype: `config`)
- No auto-linking between migrations and entity classes — both surface independently via semantic search
- LLM enrichment for migrations produces: description of what the DDL/DML does, semantic tags like ["migration", "payments", "schema"]

#### Multiple ORM Support

The codebase uses different ORMs per module:

- Some modules use Spring JPA
- Some modules use JDBC Template / PreparedStatement
- Some modules use JavaLite ActiveJDBC

The classifier handles all three. The `moduleInfo` field helps disambiguate which ORM a given module uses (via convention or parent pom dependencies).

## Indexing & CLI _(mandatory)_

### Strategy Consolidation

The current system offers two chunking strategies via `--strategy ast|llm`. This feature **eliminates the strategy choice** — there is only one unified pipeline:

- **AST** always determines chunk boundaries (never split mid-semantic-unit)
- **LLM enrichment** adds metadata on top of AST chunks (skippable, not an alternative)

The `--strategy` flag, `ChunkingStrategy` interface, `LlmChunkingStrategy`, and `LlmChunker` are **removed**. The AST strategy is absorbed into the single pipeline as the always-on boundary engine.

### CLI Command

```
ia-framework index [--force] [--repo <name>] [--skip-enrichment]
```

| Flag                | Behavior                                                                                     |
| ------------------- | -------------------------------------------------------------------------------------------- |
| (no flags)          | Incremental index with AST chunking + LLM enrichment                                         |
| `--force`           | Full re-index (ignore contentHash cache, recreate Qdrant collection)                         |
| `--repo <name>`     | Index only specific repo                                                                     |
| `--skip-enrichment` | AST-only mode — skip all Ollama enrichment calls. Useful for CI, no-GPU, or quick re-indexes |

**Removed flags:**

- `--strategy ast|llm` — gone. No strategy choice.
- `--model` for embedding — moved to config-only (`project.json`)

**Graceful degradation:** If Ollama is unavailable and `--skip-enrichment` is NOT set, the pipeline logs a warning and continues with AST-only metadata (same as FR-006). The flag is for intentional skipping; degradation is for unexpected unavailability.

### Pipeline (single pass per file)

```
1. File Discovery (walk + gitignore + exclusion patterns)
       │
       ▼
2. Incremental Check (git-diff against last indexed commit — skip unchanged files)
       │
       ▼
3. AST Parse (tree-sitter / regex) → chunk boundaries, structural metadata
       │
       ▼
4. Classify (heuristic, no LLM) → stereotype, archLayer, moduleInfo
       │
       ▼
5. LLM Enrich (Ollama, if available and not --skip-enrichment)
       │  → description, businessContext, semanticTags, relationships
       │
       ▼
6. Embed (3 named vectors: semantic, signature, sparse)
       │
       ▼
7. Upsert to Qdrant (lean metadata payload, NO raw code)
```

### Configuration (`.ia-framework/project.json`)

```json
{
  "embedding": {
    "provider": "ollama",
    "model": "nomic-embed-text",
    "baseUrl": "http://localhost:11434",
    "dimensions": 768
  },
  "enrichment": {
    "provider": "ollama",
    "model": "qwen3:8b",
    "baseUrl": "http://localhost:11434",
    "numCtx": 32768,
    "enabled": true,
    "concurrency": 2,
    "retryAttempts": 3,
    "skipOnFailure": true
  },
  "indexing": {
    "excludePatterns": ["**/generated/**", "**/target/**"],
    "supportedExtensions": [
      ".java",
      ".ts",
      ".tsx",
      ".js",
      ".jsx",
      ".proto",
      ".yaml",
      ".yml",
      ".xml",
      ".sql"
    ],
    "respectGitignore": true,
    "maxFileSize": 524288
  },
  "vectorStore": {
    "host": "localhost",
    "port": 6333,
    "collectionName": "codebase"
  }
}
```

The old `indexing.llm` config is replaced by the `enrichment` block. The `strategy` field is removed from config.

### Install.sh Changes

During installation, the script prompts the user for:

1. **Embedding model** — for vector generation (default: `nomic-embed-text`)
2. **Enrichment model** — for metadata generation (default: `qwen3:8b`) — NEW

Both models are auto-pulled from Ollama during install.

### Migration from Previous Versions

On upgrade, existing Qdrant collections are **incompatible** (they store raw code and use 2 vectors: `text`, `code`). Users must run:

```
ia-framework index --force
```

This recreates the collection with the new 3-vector schema (`semantic`, `signature`, `sparse`) and lean metadata payloads. The CLI detects the old schema and prompts the user to confirm re-creation.

### What Gets Deleted

| Current Code                 | Fate                                                                |
| ---------------------------- | ------------------------------------------------------------------- |
| `strategies/llm-strategy.ts` | Deleted — LLM no longer decides boundaries                          |
| `strategies/llm-chunker.ts`  | Replaced by enrichment pipeline (LLM adds metadata, not boundaries) |
| `strategies/ast-strategy.ts` | Absorbed into the single pipeline (AST is always-on)                |
| `strategies/types.ts`        | Simplified — no `ChunkingStrategy` interface                        |
| `--strategy` CLI flag        | Removed                                                             |

### Agent Documentation Injection

The `ia-framework agents inject` command injects RAG tool guidance into the target project's `AGENTS.md` (or `CLAUDE.md`). The injected content is updated to reflect the simplified 3-tool surface:

```markdown
## Codebase RAG Tools (ia-framework)

This project is indexed by ia-framework. The following MCP tools provide
codebase context during AI-assisted development:

- `search_codebase` — Unified semantic search across the indexed codebase.
  Automatically classifies your query and routes through the optimal search
  path (semantic, signature, or keyword vectors) with RRF fusion and reranking.
  Parameters: `query` (required), `limit` (default 10), `score_threshold` (default 0.5),
  `expand_hops` (0=no expansion, 1=direct imports, 2=transitive, default 2),
  `repo`, `stereotype`, `archLayer`, `module`, `language` (all optional filters)
- `get_file` — Retrieve full file content by relative path. Falls back to
  semantic search if path not found. Use when you need full context of a file.
- `get_dependencies` — Get imports, exports, and dependency edges for a file,
  or transitive module-level dependencies.
  Parameters: `path` (file-level) OR `module` (module-level), `depth` (default 1)
- `query_database` — Execute SQL against the connected database (if configured).

### When to use

- **Before modifying code:** search for related files and understand dependencies
- **Before planning features:** search for existing patterns and interfaces
- **Before refactoring:** get_dependencies to understand the impact surface
- **Narrow searches:** use filters like `stereotype: "service"` or `archLayer: "persistence"`
  to focus results on specific architectural concerns

### Token-conscious usage

- Use `limit: 3-5` for quick lookups, `limit: 10` for deep exploration
- Raise `score_threshold` to 0.7 for precise matches
- Use metadata filters to narrow results instead of increasing limit
- Skip RAG for tasks that don't need codebase context (doc updates, config changes)
```

**Changes from current:**

- `search_codebase_hybrid` removed (merged into unified `search_codebase`)
- `search_codebase` updated with auto-classification and metadata filter params
- `get_dependencies` updated with module-level usage
- "Mixed queries" guidance removed (one tool handles all query types)
- Filter guidance added ("Narrow searches" section)

---

## LLM Enrichment Pipeline _(mandatory)_

### Parser Strategy

| Language                           | Parser                                                      | Notes                                                                                               |
| ---------------------------------- | ----------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| **Java** (Spring, Guice, JavaLite) | tree-sitter-java                                            | Standard grammar handles all annotations, bind() calls, extends Model, PreparedStatement.           |
| **TypeScript/JavaScript**          | tree-sitter (existing)                                      | Already working in the codebase.                                                                    |
| **Protocol Buffers (.proto)**      | Custom regex/line chunker                                   | Proto grammar is simple and regular — split on `message`, `service`, `enum`, `rpc`. No WASM needed. |
| **YAML (.yaml/.yml)**              | tree-sitter-yaml (`@tree-sitter-grammars/tree-sitter-yaml`) | High maturity, production-ready, YAML 1.2 spec. Configuration files need structural parsing.        |
| **XML (.xml)**                     | tree-sitter-xml (`@tree-sitter-grammars/tree-sitter-xml`)   | High maturity, official grammar. Handles Spring configs, Maven POMs, Guice XML bindings.            |
| **Flyway SQL (.sql)**              | Statement-based chunker                                     | Each migration file = one chunk (files are typically small, self-contained DDL/DML).                |

### Indexing Pipeline (inline, single pass)

```
Source File
  │
  ▼
┌─────────────────────────────────────┐
│ 1. AST Parse (tree-sitter)          │  deterministic, fast
│    → CodeChunk[] with boundaries    │
└─────────────────┬───────────────────┘
                  ▼
┌─────────────────────────────────────┐
│ 2. Classify (heuristic, no LLM)    │  annotations + package conventions
│    → stereotype, archLayer, module  │
└─────────────────┬───────────────────┘
                  ▼
┌─────────────────────────────────────┐
│ 3. LLM Enrich (Ollama, inline)     │  file-level or grouped-by-class
│    → description, businessContext,  │
│      semanticTags, relationships    │
└─────────────────┬───────────────────┘
                  ▼
┌─────────────────────────────────────┐
│ 4. Embed (3 named vectors)          │
│    → semantic, signature, sparse    │
└─────────────────┬───────────────────┘
                  ▼
┌─────────────────────────────────────┐
│ 5. Upsert to Qdrant                │  payload + vectors (no raw code)
└─────────────────────────────────────┘
```

### Large File Strategy

```
estimatedTokens = file.length / 4

if estimatedTokens < modelContextWindow * 0.7:
  → Single LLM call (full file with chunk boundaries marked)

else:
  → Group by AST structure:
    1. Parse all chunks from file
    2. Group chunks by parent class/interface
    3. For each group:
       - Build context: class signature + field declarations + imports
       - Send context + group's method bodies to Ollama
       - Get enrichment for that group
    4. Stitch results back together
```

### LLM Prompt Structure (file-level call)

The system sends the full file (or class group) to Ollama with chunk boundaries marked, along with pre-computed classification metadata. The LLM returns structured JSON with enrichment for each chunk:

- `description`: One sentence — what does this code DO (not what it IS)
- `businessContext`: What business process triggers this? What happens if it fails?
- `serviceBoundary`: Which domain/bounded-context owns this logic?
- `semanticTags`: 3-7 labels a developer would search for
- `relationships`: Direct dependencies visible in imports/calls (stored as-is, not resolved)

### Concurrency & Performance

- Fixed default concurrency of 2 parallel Ollama requests, configurable in project.json (`enrichment.concurrency`)
- Cache enrichment results keyed by `contentHash` — skip LLM call for unchanged files on re-index
- Graceful degradation: if Ollama unavailable, continue with AST-only metadata
- Max 10 methods per enrichment call (batched through all methods in a file/class for quality)

### Configuration (`.ia-framework/project.json`)

```json
{
  "enrichment": {
    "provider": "ollama",
    "model": "qwen3:8b",
    "baseUrl": "http://localhost:11434",
    "numCtx": 32768,
    "enabled": true,
    "concurrency": 2,
    "retryAttempts": 3,
    "skipOnFailure": true
  }
}
```

The `install.sh` prompts the user to select an enrichment model (separate from the embedding model). Default suggestion: `qwen3:8b`. The model can be changed later in `project.json`.

## Requirements _(mandatory)_

### Functional Requirements

- **FR-001**: System MUST parse source files using language-specific AST parsers to identify semantic boundaries (functions, classes, blocks, definitions).
- **FR-002**: System MUST generate LLM-enriched metadata for each chunk via the Ollama provider, including: natural language description, business context, service boundaries, semantic tags, and relationship annotations.
- **FR-003**: System MUST build a dependency graph during indexing that captures import/export relationships, service references, and configuration bindings across all supported file types.
- **FR-004**: System MUST support chunking for TypeScript, JavaScript, Java, XML, Protocol Buffers (.proto), and YAML/YML files.
- **FR-005**: System MUST never split a chunk mid-semantic-unit (function, class, message definition, configuration block).
- **FR-006**: System MUST gracefully degrade when the Ollama provider is unavailable — indexing continues with AST-only metadata.
- **FR-007**: System MUST store chunk metadata (AST-derived + LLM-enriched) alongside embeddings in the vector store WITHOUT storing raw code content.
- **FR-008**: System MUST read raw code from the filesystem at retrieval time using relativePath + startLine:endLine.
- **FR-009**: System MUST detect content drift via contentHash comparison and flag stale results (still returning them).
- **FR-010**: System MUST support configurable exclusion patterns to prevent indexing generated source files.
- **FR-011**: System MUST provide incremental re-indexing using git-diff (against last indexed commit) to identify changed files, skipping LLM enrichment for unchanged chunks (cached by contentHash).
- **FR-012**: System MUST expose dependency graph data through the existing MCP tools (get_dependencies, search_codebase) with graph expansion.
- **FR-013**: System MUST use a fixed default concurrency of 2 for parallel Ollama enrichment requests, configurable via `enrichment.concurrency` in project.json.
- **FR-014**: System MUST classify chunks by stereotype and architectural layer using annotation/package heuristics (no LLM required).
- **FR-015**: System MUST store module information (group, module, submodule) derived from directory structure and Maven coordinates from pom.xml.
- **FR-016**: System MUST create class-signature chunks (declaration + fields + method signatures without bodies) as lightweight "index card" entries for architectural queries.
- **FR-017**: System MUST support three named vectors per point (semantic, signature, sparse) enabling distinct search paths for business concepts, code structure, and keyword matching.
- **FR-018**: System MUST prompt the user during installation to select an enrichment LLM model (default: qwen3:8b), configurable later in project.json.
- **FR-019**: System MUST detect database entity classes using positive evidence only (annotations, inheritance) across JPA, JavaLite ActiveJDBC, JDBC Template, and PreparedStatement patterns.
- **FR-020**: System MUST chunk Flyway SQL migration files as single chunks (chunkType: migration) with no auto-linking to entity classes.
- **FR-021**: System MUST support both Spring and Guice dependency injection frameworks in stereotype classification.
- **FR-022**: System MUST use tree-sitter-yaml and tree-sitter-xml for configuration file parsing, and a custom regex chunker for .proto files.

### Key Entities

- **ChunkPayload**: The lean metadata payload stored per Qdrant point — includes identity, location, signatures, AST metadata, classification, LLM enrichment, and dependency edges. Does NOT contain raw code.
- **ChunkType**: Categorizes the syntactic nature of a chunk: method, class-signature, class, interface, type, enum, module, config-block, service-def, message-def, aspect, other.
- **Stereotype**: Classifies the architectural role: controller, service, repository, entity, dto, mapper, config, aspect, filter, interceptor, exception-handler, validator, event-listener, scheduler, client, gateway, test, proto-service, proto-message, unknown.
- **ArchLayer**: Identifies the architectural tier: presentation, service, domain, persistence, infrastructure, crosscutting.
- **ModuleInfo**: Structured module context derived from path: `{ group, module, submodule }`.
- **RelationshipTag**: A typed link to another file/symbol stored as-is from LLM output, resolved at query time.
- **DependencyEdge**: A directed relationship between two files with a relation type and optional symbol list.
- **LanguageParser**: A pluggable AST parser for a specific file type that identifies semantic boundaries and extracts structural metadata.

## MCP Tool Surface _(mandatory)_

### Tool Simplification

The current MCP server exposes 5+ retrieval tools (`search_codebase`, `search_codebase_hybrid`, `get_file`, `get_dependencies`, `get_module_dependencies`, `benchmark_preflight`). This feature consolidates them into **3 tools**:

| Tool               | Purpose                                                                           |
| ------------------ | --------------------------------------------------------------------------------- |
| `search_codebase`  | Unified search — auto-routes through all vectors, applies full reranking pipeline |
| `get_file`         | Filesystem read by path, with semantic search fallback                            |
| `get_dependencies` | File-level or module-level dependency graph traversal                             |

**Removed tools:**

- `search_codebase_hybrid` — merged into unified `search_codebase`
- `get_module_dependencies` — merged into `get_dependencies`
- `benchmark_preflight` — becomes an internal health check (lazy, on first search request; failures logged to dashboard Logs page), not an exposed tool

---

### `search_codebase` (unified)

**Parameters:**

| Param             | Type        | Default  | Description                                                                                              |
| ----------------- | ----------- | -------- | -------------------------------------------------------------------------------------------------------- |
| `query`           | string      | required | Natural language or identifier search query                                                              |
| `expand_hops`     | 0 \| 1 \| 2 | 2        | Dependency graph expansion depth                                                                         |
| `limit`           | number      | 10       | Max results returned                                                                                     |
| `score_threshold` | number      | 0.5      | Minimum similarity score                                                                                 |
| `repo`            | string      | —        | Filter to specific repo                                                                                  |
| `stereotype`      | string      | —        | Filter by stereotype (service, controller, repository, etc.)                                             |
| `archLayer`       | string      | —        | Filter by architectural layer (presentation, service, domain, persistence, infrastructure, crosscutting) |
| `module`          | string      | —        | Filter by module name                                                                                    |
| `language`        | string      | —        | Filter by language (java, typescript, proto, yaml, xml)                                                  |

**No `use_template` parameter** — removed. Enriched metadata (description, businessContext, semanticTags) replaces template injection. The tool returns structured metadata alongside code; the calling LLM interprets context from the metadata itself.

**Query Classification (internal, automatic):**

| Query Type         | Detection                           | Vectors Searched       | Example                                   |
| ------------------ | ----------------------------------- | ---------------------- | ----------------------------------------- |
| Business/semantic  | Natural language, no identifiers    | `semantic` only        | "payment retry logic"                     |
| Symbol/structural  | CamelCase, dots, exact method names | `signature` + `sparse` | "PaymentService.processPayment"           |
| Keyword/identifier | Single token, abbreviated names     | `sparse` + `semantic`  | "FiGatewayClient"                         |
| Mixed              | Natural language + identifiers      | All 3                  | "how does FiGatewayClient handle retries" |

**Retrieval Pipeline (internal):**

```
Query
  │
  ▼
┌─────────────────────────────┐
│ 1. Query Classification     │  → decide which vectors to search
└─────────────┬───────────────┘
              ▼
┌─────────────────────────────┐
│ 2. Multi-Vector Search      │  → parallel Qdrant calls per selected vector
│    (top-K per vector)       │
└─────────────┬───────────────┘
              ▼
┌─────────────────────────────┐
│ 3. RRF Fusion               │  → merge results from multiple vectors into unified ranking
└─────────────┬───────────────┘
              ▼
┌─────────────────────────────┐
│ 4. Graph Expansion          │  → follow dependency edges (expand_hops)
│    (adds related chunks)    │
└─────────────┬───────────────┘
              ▼
┌─────────────────────────────┐
│ 5. BM25 Rerank              │  → rerank fused+expanded set against original query tokens
└─────────────┬───────────────┘
              ▼
┌─────────────────────────────┐
│ 6. MMR Diversity            │  → remove near-duplicates, ensure diversity
└─────────────┬───────────────┘
              ▼
┌─────────────────────────────┐
│ 7. Read from Filesystem     │  → top-N results get live code via relativePath:startLine:endLine
└─────────────────────────────┘
```

**Why this order:**

- RRF before graph expansion: fuse first, then expand only the best results
- BM25 after expansion: ensures expanded results that don't match query terms get demoted
- MMR last: final dedup before filesystem reads (avoid reading redundant code)
- Filesystem read only for final top-N: minimizes I/O

**Token Budget:**

- Total cap: ~8000 tokens across all results
- Top-5 results: full method/block content read from filesystem
- Results 6-10: metadata only (description, signature, relativePath) — the LLM can use `get_file` for full content
- Single result cap: ~2000 tokens; if exceeded, truncate with `... [truncated, use get_file for full content]`

**Zero-Result Fallback:**

- When Qdrant returns no results, fall back to filesystem:
  1. If query looks like a path → glob for matching files
  2. If query has identifiers → grep for symbol in source tree
  3. Return raw matches with a note: "No indexed results. Filesystem matches:"

---

### `get_file`

**Parameters:**

| Param  | Type   | Default  | Description                                             |
| ------ | ------ | -------- | ------------------------------------------------------- |
| `path` | string | required | Relative file path (e.g., "src/auth/middleware.ts")     |
| `repo` | string | —        | Filter to specific repo (for multi-repo disambiguation) |

**Behavior:**

1. Primary: read file from filesystem by relative path
2. Fallback: if path not found, perform semantic search to find similar/matching files
3. Returns: full file content + indexed chunk metadata if available

---

### `get_dependencies`

**Parameters:**

| Param    | Type   | Default | Description                                        |
| -------- | ------ | ------- | -------------------------------------------------- |
| `path`   | string | —       | Relative file path (file-level dependencies)       |
| `module` | string | —       | Module name (module-level transitive dependencies) |
| `depth`  | number | 1       | Traversal depth for module-level queries           |
| `repo`   | string | —       | Filter to specific repo                            |

**Behavior:**

- If `path` provided → return file's imports, exports, and dependency edges from indexed metadata
- If `module` provided → BFS traversal of module graph up to `depth` hops, return module-level dependencies
- If both → error (pick one)
- Response shape is the same: list of dependencies with type and direction

---

## Success Criteria _(mandatory)_

### Measurable Outcomes

- **SC-001**: Retrieval precision@5 improves by at least 20% compared to the current baseline (measured via benchmark suite).
- **SC-002**: Retrieval recall@10 improves by at least 25% compared to the current baseline.
- **SC-003**: Zero chunks split mid-function or mid-class across all supported languages (verified by automated validation).
- **SC-004**: 95% of indexed chunks have LLM-enriched metadata when Ollama is available.
- **SC-005**: Indexing completes within 3x the current duration (acceptable overhead for enrichment).
- **SC-006**: Dependency graph covers at least 90% of import/export relationships for Java/TypeScript files (verified against actual source analysis).
- **SC-007**: Queries about business concepts return relevant results that pure token matching would miss, in at least 70% of benchmark cases.
- **SC-008**: Qdrant storage per chunk reduces by at least 60% compared to current (no raw code stored).
- **SC-009**: Retrieval latency (including filesystem read) stays under 500ms for top-10 results.

## Assumptions

- Ollama is available as a local service during indexing (not required at query/retrieval time).
- The MCP server always runs on the same machine where the code is checked out (filesystem reads are local).
- The existing Qdrant vector store infrastructure supports named vectors and additional payload fields.
- tree-sitter-yaml (`@tree-sitter-grammars/tree-sitter-yaml`) and tree-sitter-xml (`@tree-sitter-grammars/tree-sitter-xml`) are production-ready and suitable for configuration file parsing.
- Proto files have a regular enough grammar for a custom regex chunker (no tree-sitter WASM needed).
- Standard tree-sitter-java grammar handles all Guice, Spring, and JavaLite patterns natively.
- Incremental re-indexing uses git-diff (against last indexed commit) to identify changed files. contentHash is stored for drift detection at retrieval time only.
- Enrichment results are cacheable by contentHash — same code content always produces equivalent enrichment.
- The existing benchmark suite provides a valid baseline for measuring precision/recall improvements.
- Maven coordinates are available via pom.xml files in the repository structure.
- Ollama concurrency is configured manually (default: 2); no GPU auto-detection is performed.
- The codebase uses multiple ORM approaches (JPA, JDBC Template, JavaLite) across different modules.
- Flyway migration files are typically small and self-contained (one chunk per file is sufficient).
