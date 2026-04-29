import { readFile, stat } from 'node:fs/promises';
import { extname, relative } from 'node:path';
import { createHash } from 'node:crypto';
import type { CodeChunk, ChunkerConfig } from './types.js';
import { parseTypeScript } from './parsers/typescript.js';
import { parseJava } from './parsers/java.js';
import { splitOversizedChunks } from './splitter.js';

const LANGUAGE_MAP: Record<string, string> = {
  '.ts': 'typescript',
  '.tsx': 'tsx',
  '.js': 'javascript',
  '.jsx': 'jsx',
  '.mjs': 'javascript',
  '.cjs': 'javascript',
  '.java': 'java',
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
    const id = createHash('sha1').update(`${filePath}:1:${lines.length}`).digest('hex');
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

  let chunks: CodeChunk[];

  if (language === 'java') {
    try {
      chunks = parseJava(content, filePath, relativePath);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.warn(
        `[ast-parser] Java parse failed for ${filePath}, falling back to module chunk: ${message}`,
      );
      const lines = content.split('\n');
      const id = createHash('sha1').update(`${filePath}:1:${lines.length}`).digest('hex');
      chunks = [
        {
          id,
          filePath,
          relativePath,
          language: 'java',
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
  } else {
    chunks = parseTypeScript(content, filePath, relativePath, language);
  }

  // Split any chunks exceeding maxChunkLines
  return splitOversizedChunks(chunks, config.maxChunkLines);
}
