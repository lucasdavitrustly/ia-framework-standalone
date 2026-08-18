/**
 * A single semantic code chunk extracted from a source file.
 * Produced by the AST parser; stored in Qdrant by the indexer.
 */
export interface CodeChunk {
  /** Deterministic ID: sha1(filePath + ':' + startLine + ':' + endLine) */
  id: string;
  /** Absolute path to the source file */
  filePath: string;
  /** Path relative to project root */
  relativePath: string;
  /** Programming language */
  language: string;
  /** Type of code construct */
  chunkType:
    | 'function'
    | 'method'
    | 'class-signature'
    | 'class'
    | 'interface'
    | 'type'
    | 'enum'
    | 'module'
    | 'other'
    | 'semantic'
    | 'aspect'
    | 'config-block'
    | 'service-def'
    | 'message-def'
    | 'migration';
  /** Name of the construct (function/class/type name), if applicable */
  name?: string | undefined;
  /** Raw source code text of this chunk */
  content: string;
  /** 1-indexed start line in source file */
  startLine: number;
  /** 1-indexed end line in source file */
  endLine: number;
  /** 1-indexed line where the associated documentation comment starts, if present */
  docCommentStartLine?: number | undefined;
  /** 1-indexed line where the associated annotation/decorator starts, if present */
  annotationStartLine?: number | undefined;
  /** Module specifiers this chunk imports from */
  imports: string[];
  /** Names this chunk exports */
  exports: string[];
  /** Parent construct name when this chunk is a sub-chunk */
  parentName?: string | undefined;
  /** For sub-chunks: 1-indexed start line of the parent construct in the source file */
  parentStartLine?: number | undefined;
  /** For sub-chunks: 1-indexed end line of the parent construct in the source file */
  parentEndLine?: number | undefined;
  /** For sub-chunks: 1-based index of this part within the parent construct */
  partIndex?: number | undefined;
  /** For sub-chunks: total number of parts the parent construct was split into */
  totalParts?: number | undefined;
  /** True when embedding used a bounded head prefix because no declaration was recoverable */
  truncated?: boolean | undefined;
  /** Direct superclass name (e.g., "BaseService"). Extracted from extends clause. */
  superclass?: string | undefined;
  /** Interfaces/traits this class implements. Extracted from implements clause. */
  interfaces?: string[] | undefined;
  /** True when this class is defined inside another class (inner/nested class) */
  isInnerClass?: boolean | undefined;
  /** LLM-generated prose summary (legacy) */
  description?: string | undefined;
  /** 0-based position of this chunk within its source file */
  chunkIndex?: number | undefined;
  /** Total number of chunks produced from the same source file */
  totalChunks?: number | undefined;

  // === New fields (Feature 008) ===
  /** Java annotations or decorators (e.g., ['@Service', '@Transactional']) */
  annotations?: string[] | undefined;
  /** Visibility modifier */
  visibility?: 'public' | 'protected' | 'package' | 'private' | undefined;
  /** Symbol names defined in this chunk */
  defines?: string[] | undefined;
  /** Symbol names called/referenced in this chunk */
  calls?: string[] | undefined;
  /**
   * Compact class context prepended to method chunks for disambiguation.
   * Format: class declaration + field declarations, max 5 lines.
   */
  contextHeader?: string | undefined;
  /**
   * For class-signature chunks: the full class declaration + fields + method signatures (no bodies).
   */
  classSignature?: string | undefined;
  /** Heuristic stereotype (e.g., 'service', 'controller', 'repository') */
  stereotype?: string | undefined;
  /** Heuristic architectural layer */
  archLayer?: string | undefined;
  /** Module hierarchy info from directory structure / pom.xml */
  moduleInfo?:
    | {
        group: string;
        module: string;
        submodule?: string | undefined;
      }
    | undefined;
  /** Maven coordinates if inside a Maven project */
  mavenCoordinates?:
    | {
        groupId: string;
        artifactId: string;
        version: string;
      }
    | undefined;
  /** SHA256 of content — used for enrichment cache keying */
  contentHash?: string | undefined;
  /** Dependency edges to other files */
  dependencyEdges?:
    | Array<{
        targetPath: string;
        relation: string;
        symbols?: string[] | undefined;
      }>
    | undefined;

  // === Phase 14: Heuristic semantic enrichment for thin classes ===
  /**
   * Structured annotation/decorator metadata extracted from AST.
   * Used by buildSemanticInput() to synthesize rich embeddings for thin delegation classes
   * (controllers, facades) without requiring LLM enrichment.
   */
  annotationMeta?:
    | {
        /** @Operation(summary=...) or @ApiOperation values */
        operationSummaries?: string[] | undefined;
        /** @RequestMapping / @GetMapping / @PostMapping path values */
        endpointPaths?: string[] | undefined;
        /** HTTP methods derived from @XMapping annotations (GET, POST, PUT, DELETE, PATCH) */
        httpMethods?: string[] | undefined;
        /** @Tag(name=...) value */
        tagName?: string | undefined;
      }
    | undefined;
}

/**
 * Configuration for the chunker.
 */
export interface ChunkerConfig {
  /** Max lines per chunk before splitting (default: 200) */
  maxChunkLines?: number;
  /** Path to project root (for relativePath calculation) */
  projectRoot?: string;
}
