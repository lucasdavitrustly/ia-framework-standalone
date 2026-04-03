import { describe, it, expect } from 'vitest';
import { splitOversizedChunks } from './splitter.js';
import type { CodeChunk } from './types.js';

function makeChunk(overrides: Partial<CodeChunk> & { startLine: number; endLine: number; content: string }): CodeChunk {
  return {
    id: `test-${overrides.startLine}-${overrides.endLine}`,
    filePath: '/test/file.ts',
    relativePath: 'file.ts',
    language: 'typescript',
    chunkType: 'function',
    name: 'testFunction',
    imports: [],
    exports: [],
    ...overrides,
  };
}

/** Generate a function with N body lines */
function generateLargeFunction(bodyLineCount: number): string {
  const lines = [`export function bigFunction(input: string): string {`];
  for (let i = 1; i <= bodyLineCount; i++) {
    lines.push(`  const line${i} = process(input, ${i});`);
  }
  lines.push(`  return line${bodyLineCount};`);
  lines.push(`}`);
  return lines.join('\n');
}

describe('splitOversizedChunks', () => {
  it('passes through chunks within the limit unchanged', () => {
    const chunk = makeChunk({
      startLine: 1,
      endLine: 10,
      content: 'function small() {\n  return 1;\n}',
    });

    const result = splitOversizedChunks([chunk], 200);
    expect(result).toHaveLength(1);
    expect(result[0]).toBe(chunk); // Same reference — not cloned
  });

  it('splits a chunk exceeding maxChunkLines into sub-chunks', () => {
    const content = generateLargeFunction(300);
    const lineCount = content.split('\n').length;
    const chunk = makeChunk({
      startLine: 1,
      endLine: lineCount,
      content,
      name: 'bigFunction',
    });

    const result = splitOversizedChunks([chunk], 100);

    // Should produce multiple sub-chunks
    expect(result.length).toBeGreaterThan(1);

    // Each sub-chunk should have parentName set
    for (const sub of result) {
      expect(sub.parentName).toBe('bigFunction');
    }
  });

  it('preserves the function signature in each sub-chunk', () => {
    const content = generateLargeFunction(300);
    const lineCount = content.split('\n').length;
    const chunk = makeChunk({
      startLine: 1,
      endLine: lineCount,
      content,
      name: 'bigFunction',
    });

    const result = splitOversizedChunks([chunk], 100);

    // Every sub-chunk should start with the function signature
    for (const sub of result) {
      expect(sub.content).toContain('export function bigFunction(input: string): string {');
    }
  });

  it('names sub-chunks with $partN suffix', () => {
    const content = generateLargeFunction(300);
    const lineCount = content.split('\n').length;
    const chunk = makeChunk({
      startLine: 1,
      endLine: lineCount,
      content,
      name: 'bigFunction',
    });

    const result = splitOversizedChunks([chunk], 100);

    expect(result[0]!.name).toBe('bigFunction$part1');
    expect(result[1]!.name).toBe('bigFunction$part2');
  });

  it('generates unique IDs for each sub-chunk', () => {
    const content = generateLargeFunction(300);
    const lineCount = content.split('\n').length;
    const chunk = makeChunk({
      startLine: 1,
      endLine: lineCount,
      content,
      name: 'bigFunction',
    });

    const result = splitOversizedChunks([chunk], 100);
    const ids = result.map((c) => c.id);
    const uniqueIds = new Set(ids);
    expect(uniqueIds.size).toBe(ids.length);
  });

  it('sub-chunks have empty exports (parent owns the export)', () => {
    const content = generateLargeFunction(300);
    const lineCount = content.split('\n').length;
    const chunk = makeChunk({
      startLine: 1,
      endLine: lineCount,
      content,
      name: 'bigFunction',
      exports: ['bigFunction'],
    });

    const result = splitOversizedChunks([chunk], 100);
    for (const sub of result) {
      expect(sub.exports).toEqual([]);
    }
  });

  it('sub-chunks inherit imports from the original chunk', () => {
    const content = generateLargeFunction(300);
    const lineCount = content.split('\n').length;
    const chunk = makeChunk({
      startLine: 1,
      endLine: lineCount,
      content,
      name: 'bigFunction',
      imports: ['node:fs', 'node:path'],
    });

    const result = splitOversizedChunks([chunk], 100);
    for (const sub of result) {
      expect(sub.imports).toEqual(['node:fs', 'node:path']);
    }
  });

  it('uses default maxChunkLines of 200 when not specified', () => {
    const content = generateLargeFunction(250);
    const lineCount = content.split('\n').length;
    const chunk = makeChunk({
      startLine: 1,
      endLine: lineCount,
      content,
      name: 'bigFunction',
    });

    // No maxChunkLines arg — should use default 200
    const result = splitOversizedChunks([chunk]);
    expect(result.length).toBeGreaterThan(1);
  });

  it('does not split when maxChunkLines is 0 (disabled)', () => {
    const content = generateLargeFunction(500);
    const lineCount = content.split('\n').length;
    const chunk = makeChunk({
      startLine: 1,
      endLine: lineCount,
      content,
      name: 'bigFunction',
    });

    const result = splitOversizedChunks([chunk], 0);
    expect(result).toHaveLength(1);
    expect(result[0]).toBe(chunk);
  });

  it('handles mixed chunks — only splits oversized ones', () => {
    const smallChunk = makeChunk({
      startLine: 1,
      endLine: 5,
      content: 'function small() {\n  return 1;\n}',
      name: 'small',
    });

    const bigContent = generateLargeFunction(300);
    const bigLineCount = bigContent.split('\n').length;
    const bigChunk = makeChunk({
      startLine: 10,
      endLine: 10 + bigLineCount - 1,
      content: bigContent,
      name: 'bigFunction',
    });

    const result = splitOversizedChunks([smallChunk, bigChunk], 100);

    // Small chunk passed through, big chunk split
    expect(result[0]).toBe(smallChunk);
    expect(result.length).toBeGreaterThan(2);
    expect(result[0]!.parentName).toBeUndefined();
    expect(result[1]!.parentName).toBe('bigFunction');
  });

  it('covers all body lines without gaps or loss', () => {
    const content = generateLargeFunction(250);
    const lineCount = content.split('\n').length;
    const chunk = makeChunk({
      startLine: 1,
      endLine: lineCount,
      content,
      name: 'bigFunction',
    });

    const result = splitOversizedChunks([chunk], 100);

    // Collect all non-signature body content from sub-chunks
    // Every body line from the original should appear in exactly one sub-chunk
    const bodyLines = content.split('\n').slice(1); // skip signature line
    const coveredLines = new Set<string>();
    for (const sub of result) {
      const subLines = sub.content.split('\n');
      // Skip the signature line(s) — they're context, not body
      const signatureLine = 'export function bigFunction(input: string): string {';
      for (const line of subLines) {
        if (line !== signatureLine) {
          coveredLines.add(line);
        }
      }
    }

    // Every body line should be covered
    for (const line of bodyLines) {
      expect(coveredLines.has(line)).toBe(true);
    }
  });
});
