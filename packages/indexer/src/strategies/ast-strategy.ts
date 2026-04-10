import { parseFile } from '@ia-framework/ast-parser';
import type { CodeChunk } from '@ia-framework/ast-parser';
import type { ChunkingStrategy, ChunkingConfig } from './types.js';

/**
 * AST-based chunking strategy using tree-sitter.
 * Wraps the existing parseFile() function — extracts functions, classes,
 * interfaces at AST boundaries. This is the default strategy.
 */
export class AstChunkingStrategy implements ChunkingStrategy {
  readonly name = 'ast';

  async chunk(filePath: string, config: ChunkingConfig): Promise<CodeChunk[]> {
    return parseFile(filePath, {
      ...(config.maxChunkLines !== undefined && { maxChunkLines: config.maxChunkLines }),
      ...(config.projectRoot !== undefined && { projectRoot: config.projectRoot }),
    });
  }
}
