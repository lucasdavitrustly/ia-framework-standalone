import { createHash } from 'node:crypto';
import { basename } from 'node:path';
import type { CodeChunk } from '../types.js';

/**
 * T052: SQL chunker.
 *
 * Treats each SQL file (especially Flyway migration files) as a single chunk
 * with chunkType 'migration'. The entire file becomes one chunk.
 *
 * This is appropriate for Flyway V*__*.sql files where the migration is
 * an atomic unit and should not be split.
 */

function makeChunkId(filePath: string, startLine: number, endLine: number): string {
  return createHash('sha1').update(`${filePath}:${startLine}:${endLine}`).digest('hex');
}

/**
 * Parse a .sql file into a single migration chunk.
 */
export function parseSql(content: string, filePath: string, relativePath: string): CodeChunk[] {
  const lines = content.split('\n');
  const endLine = lines.length;
  const name = basename(filePath);

  return [
    {
      id: makeChunkId(filePath, 1, endLine),
      filePath,
      relativePath,
      language: 'sql',
      chunkType: 'migration',
      name,
      content,
      startLine: 1,
      endLine,
      imports: [],
      exports: [],
      chunkIndex: 0,
      totalChunks: 1,
    },
  ];
}
