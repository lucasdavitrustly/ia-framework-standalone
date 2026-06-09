import { createHash } from 'node:crypto';
import type { CodeChunk } from '../types.js';

/**
 * T049: Proto chunker — regex-based.
 *
 * Splits .proto files at message, service, and enum construct boundaries.
 * Leading comments (// lines) attached to a construct are included in its chunk.
 * Returns a single module chunk for files with no constructs.
 */

type ProtoConstructType = 'message-def' | 'service-def' | 'enum';

interface ProtoConstruct {
  type: ProtoConstructType;
  name: string;
  startLine: number; // 1-indexed, includes leading comments
  endLine: number; // 1-indexed (inclusive)
  content: string;
}

function makeChunkId(filePath: string, startLine: number, endLine: number): string {
  return createHash('sha1').update(`${filePath}:${startLine}:${endLine}`).digest('hex');
}

/**
 * Parse a .proto file into semantic CodeChunks.
 * Each message, service, or enum definition becomes a separate chunk.
 * Leading // comment lines are included as part of the chunk.
 */
export function parseProto(content: string, filePath: string, relativePath: string): CodeChunk[] {
  const lines = content.split('\n');

  if (lines.every((l) => l.trim() === '')) {
    // Empty file
    const id = makeChunkId(filePath, 1, Math.max(lines.length, 1));
    return [
      {
        id,
        filePath,
        relativePath,
        language: 'proto',
        chunkType: 'module',
        name: undefined,
        content,
        startLine: 1,
        endLine: Math.max(lines.length, 1),
        imports: [],
        exports: [],
        chunkIndex: 0,
        totalChunks: 1,
      },
    ];
  }

  const constructs = extractProtoConstructs(lines);

  if (constructs.length === 0) {
    // File has only syntax/package/option declarations — return as module chunk
    const id = makeChunkId(filePath, 1, lines.length);
    return [
      {
        id,
        filePath,
        relativePath,
        language: 'proto',
        chunkType: 'module',
        name: undefined,
        content,
        startLine: 1,
        endLine: lines.length,
        imports: [],
        exports: [],
        chunkIndex: 0,
        totalChunks: 1,
      },
    ];
  }

  const chunks: CodeChunk[] = constructs.map((construct, idx) => ({
    id: makeChunkId(filePath, construct.startLine, construct.endLine),
    filePath,
    relativePath,
    language: 'proto',
    chunkType: construct.type,
    name: construct.name,
    content: construct.content,
    startLine: construct.startLine,
    endLine: construct.endLine,
    imports: [],
    exports: [],
    chunkIndex: idx,
    totalChunks: constructs.length,
  }));

  return chunks;
}

/**
 * Extract proto constructs (message, service, enum) from lines.
 * Attaches leading // comment blocks to each construct.
 */
function extractProtoConstructs(lines: string[]): ProtoConstruct[] {
  const constructs: ProtoConstruct[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = (lines[i] ?? '').trim();

    // Skip blank lines, syntax, package, option, import, comment lines at top level
    const constructMatch = line.match(/^(message|service|enum)\s+(\w+)\s*\{?/);
    if (constructMatch) {
      const constructKeyword = constructMatch[1] ?? '';
      const name = constructMatch[2] ?? '';
      const type = keywordToType(constructKeyword);

      // Walk back to include leading comment lines
      let commentStart = i;
      while (commentStart > 0 && (lines[commentStart - 1] ?? '').trim().startsWith('//')) {
        commentStart--;
      }

      // Find the closing brace using brace counting
      let depth = 0;
      let foundOpen = false;
      let endLine = i;
      for (let j = i; j < lines.length; j++) {
        for (const ch of lines[j] ?? '') {
          if (ch === '{') {
            depth++;
            foundOpen = true;
          } else if (ch === '}') {
            depth--;
          }
        }
        if (foundOpen && depth === 0) {
          endLine = j;
          break;
        }
      }

      const chunkLines = lines.slice(commentStart, endLine + 1);
      const chunkContent = chunkLines.join('\n');

      constructs.push({
        type,
        name,
        startLine: commentStart + 1, // 1-indexed
        endLine: endLine + 1, // 1-indexed
        content: chunkContent,
      });

      i = endLine + 1;
    } else {
      i++;
    }
  }

  return constructs;
}

function keywordToType(keyword: string): ProtoConstructType {
  switch (keyword) {
    case 'message':
      return 'message-def';
    case 'service':
      return 'service-def';
    case 'enum':
      return 'enum';
    default:
      return 'message-def';
  }
}
