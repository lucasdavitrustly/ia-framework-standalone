import { createHash } from 'node:crypto';
import type { CodeChunk } from './types.js';

const DEFAULT_MAX_CHUNK_LINES = 200;

/**
 * Extract the "signature" of a code construct — the lines before the opening
 * brace of the body. This becomes the context prefix for each sub-chunk so
 * embeddings preserve the function/class identity.
 *
 * For `function processOrder(order: Order): Result {` → returns that line.
 * For multi-line signatures → returns all lines up to and including the `{`.
 */
function extractSignature(content: string): { signature: string; bodyStartIndex: number } {
  // Find the first opening brace that starts a block
  const braceIndex = content.indexOf('{');
  if (braceIndex === -1) {
    // No brace found (e.g., arrow function without braces, or malformed)
    // Return the first line as signature
    const firstNewline = content.indexOf('\n');
    if (firstNewline === -1) return { signature: content, bodyStartIndex: content.length };
    return { signature: content.slice(0, firstNewline), bodyStartIndex: firstNewline + 1 };
  }

  // Include the line with the opening brace
  const nextNewline = content.indexOf('\n', braceIndex);
  if (nextNewline === -1) {
    return { signature: content, bodyStartIndex: content.length };
  }

  return {
    signature: content.slice(0, nextNewline),
    bodyStartIndex: nextNewline + 1,
  };
}

function makeChunkId(filePath: string, startLine: number, endLine: number): string {
  return createHash('sha1').update(`${filePath}:${startLine}:${endLine}`).digest('hex');
}

/**
 * Split a single oversized chunk into smaller sub-chunks.
 *
 * Strategy:
 * 1. Extract the construct signature (function/class declaration line(s))
 * 2. Split the remaining body into segments of ~maxLines lines each
 * 3. Each sub-chunk gets the signature prepended as context
 * 4. Sub-chunks get `parentName` set to the original chunk's name
 *
 * The signature is NOT counted against maxLines — it's context overhead
 * that ensures each sub-chunk is self-describing.
 */
function splitChunk(chunk: CodeChunk, maxLines: number): CodeChunk[] {
  const { signature, bodyStartIndex } = extractSignature(chunk.content);
  const body = chunk.content.slice(bodyStartIndex);
  const bodyLines = body.split('\n');

  // If the body alone fits, no split needed (signature + body ≤ limit)
  if (bodyLines.length <= maxLines) {
    return [chunk];
  }

  const subChunks: CodeChunk[] = [];
  const signatureLineCount = signature.split('\n').length;
  let lineOffset = 0;

  while (lineOffset < bodyLines.length) {
    const segmentLines = bodyLines.slice(lineOffset, lineOffset + maxLines);
    const segmentContent = signature + '\n' + segmentLines.join('\n');

    // Calculate actual source file line numbers
    // The body starts after the signature lines in the original chunk
    const segmentStartLine = chunk.startLine + signatureLineCount + lineOffset;
    const segmentEndLine = segmentStartLine + segmentLines.length - 1;

    const partIndex = subChunks.length + 1;
    const partName = chunk.name ? `${chunk.name}$part${partIndex}` : `part${partIndex}`;

    subChunks.push({
      id: makeChunkId(chunk.filePath, segmentStartLine, segmentEndLine),
      filePath: chunk.filePath,
      relativePath: chunk.relativePath,
      language: chunk.language,
      chunkType: chunk.chunkType,
      name: partName,
      content: segmentContent,
      startLine: segmentStartLine,
      endLine: segmentEndLine,
      imports: chunk.imports,
      exports: [], // Sub-chunks don't export — the parent does
      parentName: chunk.name,
    });

    lineOffset += maxLines;
  }

  return subChunks;
}

/**
 * Detect method boundaries within a class body.
 * Returns line indices (0-based within bodyLines) where methods start.
 */
function detectMethodBoundaries(bodyLines: string[]): number[] {
  const boundaries: number[] = [];
  // Match method signatures: access modifiers, async, static, etc.
  const methodPattern =
    /^\s+(public|private|protected|static|async|abstract|override|\*)\s+|^\s+\w+\s*\(|^\s+(get|set)\s+\w+/;

  for (let i = 0; i < bodyLines.length; i++) {
    const line = bodyLines[i]!;
    if (
      methodPattern.test(line) &&
      (line.includes('(') || line.includes('{')) &&
      !line.trim().startsWith('//') &&
      !line.trim().startsWith('*')
    ) {
      boundaries.push(i);
    }
  }

  return boundaries;
}

/**
 * Split a class chunk at method boundaries, grouping methods to stay within maxLines.
 */
function splitClassAtMethodBoundaries(chunk: CodeChunk, maxLines: number): CodeChunk[] {
  const { signature, bodyStartIndex } = extractSignature(chunk.content);
  const body = chunk.content.slice(bodyStartIndex);
  const bodyLines = body.split('\n');

  const boundaries = detectMethodBoundaries(bodyLines);

  // If no method boundaries detected or only one method, fall back to fixed split
  if (boundaries.length <= 1) {
    return splitChunk(chunk, maxLines);
  }

  const signatureLineCount = signature.split('\n').length;
  const subChunks: CodeChunk[] = [];
  let groupStart = 0;

  for (let i = 1; i <= boundaries.length; i++) {
    const nextBoundary = i < boundaries.length ? boundaries[i]! : bodyLines.length;
    const groupLines = nextBoundary - groupStart;

    // If adding the next method would exceed maxLines, flush current group
    if (groupLines > maxLines && i > 1) {
      const segmentLines = bodyLines.slice(groupStart, boundaries[i - 1]!);
      const segmentContent = signature + '\n' + segmentLines.join('\n');
      const segmentStartLine = chunk.startLine + signatureLineCount + groupStart;
      const segmentEndLine = segmentStartLine + segmentLines.length - 1;
      const partIndex = subChunks.length + 1;

      subChunks.push({
        id: makeChunkId(chunk.filePath, segmentStartLine, segmentEndLine),
        filePath: chunk.filePath,
        relativePath: chunk.relativePath,
        language: chunk.language,
        chunkType: chunk.chunkType,
        name: `${chunk.name}$part${partIndex}`,
        content: segmentContent,
        startLine: segmentStartLine,
        endLine: segmentEndLine,
        imports: chunk.imports,
        exports: [],
        parentName: chunk.name,
      });

      groupStart = boundaries[i - 1]!;
    }
  }

  // Flush remaining
  if (groupStart < bodyLines.length) {
    const segmentLines = bodyLines.slice(groupStart);
    const segmentContent = signature + '\n' + segmentLines.join('\n');
    const segmentStartLine = chunk.startLine + signatureLineCount + groupStart;
    const segmentEndLine = segmentStartLine + segmentLines.length - 1;
    const partIndex = subChunks.length + 1;

    subChunks.push({
      id: makeChunkId(chunk.filePath, segmentStartLine, segmentEndLine),
      filePath: chunk.filePath,
      relativePath: chunk.relativePath,
      language: chunk.language,
      chunkType: chunk.chunkType,
      name: `${chunk.name}$part${partIndex}`,
      content: segmentContent,
      startLine: segmentStartLine,
      endLine: segmentEndLine,
      imports: chunk.imports,
      exports: [],
      parentName: chunk.name,
    });
  }

  // If we couldn't split meaningfully (e.g. single huge method), fall back
  return subChunks.length > 1 ? subChunks : splitChunk(chunk, maxLines);
}

/**
 * Post-process chunks from any parser: split any chunk exceeding
 * `maxChunkLines` into smaller sub-chunks with context preservation.
 *
 * Chunks within the limit are passed through unchanged.
 */
export function splitOversizedChunks(chunks: CodeChunk[], maxChunkLines?: number): CodeChunk[] {
  const limit = maxChunkLines ?? DEFAULT_MAX_CHUNK_LINES;

  // No splitting if limit is 0 or negative (disabled)
  if (limit <= 0) return chunks;

  const result: CodeChunk[] = [];

  for (const chunk of chunks) {
    const lineCount = chunk.endLine - chunk.startLine + 1;
    if (lineCount <= limit) {
      result.push(chunk);
    } else if (chunk.chunkType === 'class') {
      result.push(...splitClassAtMethodBoundaries(chunk, limit));
    } else {
      result.push(...splitChunk(chunk, limit));
    }
  }

  return result;
}
