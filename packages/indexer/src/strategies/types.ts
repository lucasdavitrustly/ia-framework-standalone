import type { CodeChunk } from '@ia-framework/ast-parser';

/**
 * Configuration passed to a ChunkingStrategy for a single file.
 */
export interface ChunkingConfig {
  /** Max lines per chunk (default: 200) */
  maxChunkLines?: number;
  /** Project root for relative path calculation */
  projectRoot?: string;
}

/**
 * A pluggable chunking strategy for the indexing pipeline.
 * Implementations: AstChunkingStrategy (Phase 13), LlmChunkingStrategy (Phase 14).
 *
 * The pipeline orchestrates; strategies chunk. One strategy active per indexing run.
 * Per D-12: Developer selects via CLI flag (--strategy ast|llm).
 */
export interface ChunkingStrategy {
  /** Strategy identifier: 'ast' or 'llm' */
  readonly name: string;

  /**
   * Chunk a single source file into semantic code chunks.
   * @param filePath - Absolute path to the source file
   * @param config - Chunking configuration (maxChunkLines, projectRoot)
   * @returns Array of code chunks extracted from the file
   */
  chunk(filePath: string, config: ChunkingConfig): Promise<CodeChunk[]>;
}
