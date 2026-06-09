import type { CodeChunk } from '@ia-framework/ast-parser';

/**
 * Configuration passed to a chunking operation for a single file.
 */
export interface ChunkingConfig {
  /** Max lines per chunk (default: 200) */
  maxChunkLines?: number;
  /** Project root for relative path calculation */
  projectRoot?: string;
  /** Abort signal for cancellation support */
  signal?: AbortSignal | undefined;
}

/**
 * @deprecated ChunkingStrategy is no longer used. The pipeline now uses a
 * unified AST-first approach with optional LLM enrichment. This interface
 * is kept temporarily for backward compat with external consumers.
 */
export interface ChunkingStrategy {
  /** Strategy identifier */
  readonly name: string;
  chunk(filePath: string, config: ChunkingConfig): Promise<CodeChunk[]>;
}
