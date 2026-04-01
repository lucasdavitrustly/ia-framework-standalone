import { readFile, stat } from 'node:fs/promises';
import { extname, relative } from 'node:path';
import { createHash } from 'node:crypto';
import type { CodeChunk, ChunkerConfig } from './types.js';
import { parseTypeScript } from './parsers/typescript.js';

const LANGUAGE_MAP: Record<string, string> = {
  '.ts': 'typescript',
  '.tsx': 'tsx',
  '.js': 'javascript',
  '.jsx': 'jsx',
  '.mjs': 'javascript',
  '.cjs': 'javascript',
};

export type { CodeChunk, ChunkerConfig };

export async function parseFile(
  filePath: string,
  config: ChunkerConfig = {},
): Promise<CodeChunk[]> {
  // Verify file exists (throws ENOENT if missing)
  await stat(filePath);

  const ext = extname(filePath).toLowerCase();
  const language = LANGUAGE_MAP[ext];
  const relativePath = config.projectRoot ? relative(config.projectRoot, filePath) : filePath;

  if (!language) {
    // Unsupported language — return single module chunk for the whole file
    const content = await readFile(filePath, 'utf-8');
    const lines = content.split('\n');
    const id = createHash('sha1')
      .update(`${filePath}:1:${lines.length}`)
      .digest('hex');
    return [
      {
        id,
        filePath,
        relativePath,
        language: ext.slice(1) || 'unknown',
        chunkType: 'module',
        name: undefined,
        content,
        startLine: 1,
        endLine: lines.length,
        imports: [],
        exports: [],
      },
    ];
  }

  const content = await readFile(filePath, 'utf-8');

  return parseTypeScript(content, filePath, relativePath, language);
}
