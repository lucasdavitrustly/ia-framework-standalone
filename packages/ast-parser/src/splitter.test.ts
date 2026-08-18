import { describe, it, expect } from 'vitest';
import { splitOversizedChunks } from './splitter.js';
import type { CodeChunk } from './types.js';

function makeChunk(
  overrides: Partial<CodeChunk> & { startLine: number; endLine: number; content: string },
): CodeChunk {
  return {
    id: `test-${overrides.startLine}-${overrides.endLine}`,
    filePath: '/test/file.ts',
    relativePath: 'file.ts',
    language: 'typescript',
    chunkType: 'other', // use 'other' so tests can verify splitting behaviour (function/method are never split)
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

describe('splitOversizedChunks - method boundary splitting', () => {
  function generateClass(methodCount: number, linesPerMethod: number): string {
    const lines = ['export class PaymentService {'];
    for (let m = 1; m <= methodCount; m++) {
      lines.push(`  public method${m}(): void {`);
      for (let l = 1; l <= linesPerMethod; l++) {
        lines.push(`    const x${l} = process(${l});`);
      }
      lines.push('  }');
      lines.push('');
    }
    lines.push('}');
    return lines.join('\n');
  }

  it('splits class chunk at method boundaries instead of fixed intervals', () => {
    // 5 methods × 50 lines each = ~260 body lines — exceeds 200 limit
    const content = generateClass(5, 50);
    const lineCount = content.split('\n').length;
    const chunk = makeChunk({
      startLine: 1,
      endLine: lineCount,
      content,
      chunkType: 'class',
      name: 'PaymentService',
    });

    const result = splitOversizedChunks([chunk], 200);

    // Should split at method boundaries, not at exactly 200 lines
    expect(result.length).toBeGreaterThan(1);
    // Each sub-chunk should start with the class signature
    for (const sub of result) {
      expect(sub.content).toContain('export class PaymentService {');
      expect(sub.parentName).toBe('PaymentService');
    }
    // Each sub-chunk name should reflect method grouping
    for (const sub of result) {
      expect(sub.name).toContain('PaymentService$');
    }
  });

  it('keeps class with small methods in one chunk if under limit', () => {
    // 3 methods × 10 lines each = ~40 body lines — under 200 limit
    const content = generateClass(3, 10);
    const lineCount = content.split('\n').length;
    const chunk = makeChunk({
      startLine: 1,
      endLine: lineCount,
      content,
      chunkType: 'class',
      name: 'SmallService',
    });

    const result = splitOversizedChunks([chunk], 200);
    expect(result).toHaveLength(1);
    expect(result[0]).toBe(chunk);
  });

  it('uses partN names for unnamed class chunks', () => {
    const content = generateClass(5, 50);
    const chunk = makeChunk({
      startLine: 1,
      endLine: content.split('\n').length,
      content,
      chunkType: 'class',
      name: undefined,
    });

    const result = splitOversizedChunks([chunk], 200);

    expect(result.length).toBeGreaterThan(1);
    expect(result.every((part) => /^part\d+$/.test(part.name ?? ''))).toBe(true);
    expect(result.every((part) => part.parentName === undefined)).toBe(true);
  });

  it('ignores annotation braces when finding an enum signature', () => {
    const content = [
      '@JsonSubTypes({ Type(value = PaymentType.class) })',
      'public enum PaymentType',
      '    implements java.io.Serializable',
      '{',
      ...Array.from({ length: 220 }, (_, index) => `  VALUE_${index},`),
      '}',
    ].join('\n');
    const chunk = makeChunk({
      startLine: 1,
      endLine: content.split('\n').length,
      content,
      chunkType: 'other',
      name: 'PaymentType',
    });

    const result = splitOversizedChunks([chunk], 200);

    expect(result.length).toBeGreaterThan(1);
    expect(result.every((part) => part.content.includes('public enum PaymentType'))).toBe(true);
    expect(result.every((part) => part.content.includes('implements java.io.Serializable'))).toBe(
      true,
    );
  });

  it('falls back to fixed splitting for non-class chunks', () => {
    // Large 'other' chunk without method boundaries (e.g. generated code block)
    const content = generateLargeFunction(300);
    const lineCount = content.split('\n').length;
    const chunk = makeChunk({
      startLine: 1,
      endLine: lineCount,
      content,
      chunkType: 'other',
      name: 'bigFunction',
    });

    const result = splitOversizedChunks([chunk], 200);
    // Should still split (fixed interval)
    expect(result.length).toBeGreaterThan(1);
  });
});

describe('splitOversizedChunks - metadata preservation', () => {
  it('preserves optional chunk metadata on every semantic split part', () => {
    const chunk = makeChunk({
      chunkType: 'class',
      name: 'PaymentService',
      content: [
        'class PaymentService {',
        '  public authorize() {',
        '    return true;',
        '  }',
        '  public capture() {',
        '    return true;',
        '  }',
        '}',
      ].join('\n'),
      startLine: 1,
      endLine: 8,
      parentName: 'OuterService',
    }) as CodeChunk & { repoId?: string; signature?: string };
    chunk.repoId = 'repo-a';
    chunk.signature = 'class PaymentService {';

    const result = splitOversizedChunks([chunk], 4);

    expect(result.length).toBeGreaterThan(1);
    for (const part of result as Array<CodeChunk & { repoId?: string; signature?: string }>) {
      expect(part.repoId).toBe('repo-a');
      expect(part.signature).toBe('class PaymentService {');
      expect(part.parentName).toBe('PaymentService');
    }
  });

  it('keeps the original chunk untouched when splitting is disabled', () => {
    const chunk = makeChunk({ startLine: 1, content: 'class Large {}', endLine: 100 });

    expect(splitOversizedChunks([chunk], 0)).toEqual([chunk]);
  });

  it('clears inherited doc-comment and annotation offsets on split parts', () => {
    // A body segment has no doc comment / annotation of its own. The parent's
    // docCommentStartLine / annotationStartLine must NOT leak onto sub-chunks
    // via the `...chunk` spread (T1.6), otherwise parts 2..N would falsely
    // reference the parent's declaration doc/annotation lines.
    const chunk = makeChunk({
      chunkType: 'class',
      content: [
        'class PaymentService {',
        '  public authorize() {',
        '    return true;',
        '  }',
        '  public capture() {',
        '    return true;',
        '  }',
        '}',
      ].join('\n'),
      startLine: 1,
      endLine: 8,
      docCommentStartLine: 1,
      annotationStartLine: 2,
    });

    const result = splitOversizedChunks([chunk], 4);

    expect(result.length).toBeGreaterThan(1);
    expect(result.every((part) => part.docCommentStartLine === undefined)).toBe(true);
    expect(result.every((part) => part.annotationStartLine === undefined)).toBe(true);
  });

  it('persists parent range and part metadata on sub-chunks (T1.1)', () => {
    const content = generateLargeFunction(300);
    const lineCount = content.split('\n').length;
    const chunk = makeChunk({
      startLine: 5,
      endLine: 5 + lineCount - 1,
      content,
      name: 'bigFunction',
    });

    const result = splitOversizedChunks([chunk], 100);

    expect(result.length).toBeGreaterThan(1);
    for (const part of result) {
      expect(part.parentStartLine).toBe(5);
      expect(part.parentEndLine).toBe(5 + lineCount - 1);
      expect(part.totalParts).toBe(result.length);
    }
    // partIndex is 1-based and sequential
    expect(result.map((p) => p.partIndex)).toEqual(
      result.map((_, i) => i + 1),
    );
  });

  it('persists parent range and part metadata on class method-boundary sub-chunks (T1.1)', () => {
    const chunk = makeChunk({
      chunkType: 'class',
      name: 'PaymentService',
      content: [
        'class PaymentService {',
        '  public authorize() {',
        '    return true;',
        '  }',
        '  public capture() {',
        '    return true;',
        '  }',
        '  public refund() {',
        '    return true;',
        '  }',
        '}',
      ].join('\n'),
      startLine: 10,
      endLine: 21,
    });

    const result = splitOversizedChunks([chunk], 3);

    expect(result.length).toBeGreaterThan(1);
    for (const part of result) {
      expect(part.parentStartLine).toBe(10);
      expect(part.parentEndLine).toBe(21);
      expect(part.totalParts).toBe(result.length);
      expect(typeof part.partIndex).toBe('number');
      expect(part.docCommentStartLine).toBeUndefined();
      expect(part.annotationStartLine).toBeUndefined();
    }
  });

  it('does not produce a part with a missing source line range', () => {
    const content = generateLargeFunction(30);
    const chunk = makeChunk({ startLine: 1, content, endLine: content.split('\n').length });

    const result = splitOversizedChunks([chunk], 10);

    expect(result.every((part) => part.startLine <= part.endLine)).toBe(true);
  });

  it('keeps a class with one method whole for signature-only fallback', () => {
    const chunk = makeChunk({
      startLine: 1,
      endLine: 8,
      chunkType: 'class',
      name: 'SingleMethodService',
      content: [
        'class SingleMethodService {',
        '  public run() {',
        '    return true;',
        '  }',
        '}',
      ].join('\n'),
    });

    const result = splitOversizedChunks([chunk], 2);

    expect(result).toEqual([chunk]);
  });
});
