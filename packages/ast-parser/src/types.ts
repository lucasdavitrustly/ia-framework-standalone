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
  chunkType: 'function' | 'class' | 'interface' | 'type' | 'enum' | 'module' | 'other' | 'semantic';
  /** Name of the construct (function/class/type name), if applicable */
  name?: string | undefined;
  /** Raw source code text of this chunk */
  content: string;
  /** 1-indexed start line in source file */
  startLine: number;
  /** 1-indexed end line in source file */
  endLine: number;
  /** Module specifiers this chunk imports from */
  imports: string[];
  /** Names this chunk exports */
  exports: string[];
  /** Parent construct name when this chunk is a sub-chunk (e.g., method split from a class, or fragment of an oversized function) */
  parentName?: string | undefined;
  /** Direct superclass name (e.g., "BaseService"). Extracted from extends clause. */
  superclass?: string | undefined;
  /** Interfaces/traits this class implements. Extracted from implements clause. */
  interfaces?: string[] | undefined;
  /** True when this class is defined inside another class (inner/nested class) */
  isInnerClass?: boolean | undefined;
  /** LLM-generated prose summary of this chunk, used for text embedding when available (per D-04) */
  description?: string | undefined;
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
