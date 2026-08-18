import { describe, expect, it } from 'vitest';
import type { CodeChunk } from '@ia-framework/ast-parser';
import { OversizedInputError, estimateTokens } from '@ia-framework/core';
import {
  handleOversizedInput,
  OversizedInputHandler,
  type HandledChunk,
} from './oversized-input-handler.js';

type TestChunk = CodeChunk & {
  repoId?: string;
  signature?: string;
  signatureOnly?: boolean;
};

function makeChunk(overrides: Partial<TestChunk> = {}): TestChunk {
  return {
    id: 'chunk-1',
    filePath: '/repo/src/service.ts',
    relativePath: 'src/service.ts',
    language: 'typescript',
    chunkType: 'method',
    name: 'processPayment',
    content: 'function processPayment() {\n  return true;\n}',
    startLine: 10,
    endLine: 12,
    imports: ['node:fs'],
    exports: [],
    parentName: 'PaymentService',
    repoId: 'repo-a',
    signature: 'function processPayment() {',
    ...overrides,
  };
}

function largeClassContent(): string {
  return [
    'class PaymentService {',
    '  public authorize() {',
    '    const authorized = true;',
    '    return authorized;',
    '  }',
    '  public capture() {',
    '    const captured = true;',
    '    return captured;',
    '  }',
    '  public refund() {',
    '    const refunded = true;',
    '    return refunded;',
    '  }',
    '}',
  ].join('\n');
}

describe('OversizedInputHandler', () => {
  it('splits an oversized class at method boundaries', () => {
    const chunk = makeChunk({
      chunkType: 'class',
      name: 'PaymentService',
      content: largeClassContent(),
      endLine: 24,
    });
    const handler = new OversizedInputHandler({ maxInputTokens: 60, maxChunkLines: 5 });

    const result = handler.handle(chunk);

    expect(result.mode).toBe('split');
    expect(result.chunks.length).toBeGreaterThan(1);
    expect(result.chunks.every((part) => part.content.includes('class PaymentService {'))).toBe(
      true,
    );
    expect(result.chunks.every((part) => part.content.includes('{') && part.content.includes('}'))).toBe(
      true,
    );
  });

  it('preserves identity, ranges, signature, parent, and repository metadata on split parts', () => {
    const chunk = makeChunk({
      chunkType: 'class',
      name: 'PaymentService',
      content: largeClassContent(),
      endLine: 24,
    });
    const result = handleOversizedInput(chunk, { maxInputTokens: 60, maxChunkLines: 5 });

    expect(result.mode).toBe('split');
    for (const part of result.chunks as HandledChunk[]) {
      expect(part.id).toMatch(/^chunk-1|[a-f0-9]{40}$/);
      expect(part.name).toContain('$part');
      expect(part.startLine).toBeGreaterThanOrEqual(chunk.startLine);
      expect(part.endLine).toBeLessThanOrEqual(chunk.endLine);
      expect(part.signature).toBe(chunk.signature);
      expect(part.parentName).toBe(chunk.name);
      expect((part as TestChunk).repoId).toBe('repo-a');
    }
  });

  it('falls back to signature and documentation for an indivisible method', () => {
    const chunk = makeChunk({
      content: [
        '/** Charges the payment and records the result. */',
        '@Transactional',
        'public boolean processPayment() {',
        ...Array.from({ length: 30 }, (_, index) => `  chargeLine${index}();`),
        '}',
      ].join('\n'),
      startLine: 10,
      endLine: 43,
    });
    const result = handleOversizedInput(chunk, { maxInputTokens: 50, maxChunkLines: 5 });
    const fallback = result.chunks[0] as TestChunk;

    expect(result.mode).toBe('signature-only');
    expect(fallback.content).toContain('/** Charges the payment and records the result. */');
    expect(fallback.content).toContain('@Transactional');
    expect(fallback.content).toContain('public boolean processPayment() {');
    expect(fallback.content).not.toContain('chargeLine0();');
    expect(fallback.startLine).toBe(10);
    expect(fallback.endLine).toBe(43);
    expect(fallback.signatureOnly).toBe(true);
  });

  it('prefers an enum declaration over a constructor with the same name', () => {
    const chunk = makeChunk({
      chunkType: 'enum',
      name: 'TransactionType$part1',
      content: [
        'public enum TransactionType {',
        '  DEPOSIT("deposit");',
        '  private final String code;',
        '  TransactionType(String code) { this.code = code; }',
        ...Array.from({ length: 40 }, (_, index) => `  // value ${index}`),
        '}',
      ].join('\n'),
    });

    const result = handleOversizedInput(chunk, { maxInputTokens: 30 });
    expect(result.mode).toBe('signature-only');
    expect(result.chunks[0]!.content).toContain('public enum TransactionType {');
    expect(result.chunks[0]!.content).not.toContain('TransactionType(String code)');
  });

  it('keeps a multiline declaration through its opening brace', () => {
    const chunk = makeChunk({
      chunkType: 'enum',
      name: 'PaymentType$part1',
      content: [
        '@JsonSubTypes({ Type(value = PaymentType.class) })',
        'public enum PaymentType',
        '    implements java.io.Serializable',
        '{',
        '  CARD,',
        ...Array.from({ length: 40 }, (_, index) => `  // value ${index}`),
        '}',
      ].join('\n'),
    });

    const result = handleOversizedInput(chunk, { maxInputTokens: 35 });
    expect(result.mode).toBe('signature-only');
    expect(result.chunks[0]!.content).toContain('public enum PaymentType');
    expect(result.chunks[0]!.content).toContain('implements java.io.Serializable');
    expect(result.chunks[0]!.content).toContain('{');
    expect(result.chunks[0]!.content).toContain('@JsonSubTypes');
  });

  it('does not use arbitrary character prefix truncation for signature-only fallback', () => {
    const original = [
      '/** Documented method. */',
      'public void run() {',
      '  veryLongBodyStatement();',
      '}',
    ].join('\n');
    const result = handleOversizedInput(
      makeChunk({ content: original, endLine: 13 }),
      { maxInputTokens: 20, maxChunkLines: 2 },
    );
    const fallback = result.chunks[0]!;

    expect(result.mode).toBe('signature-only');
    expect(fallback.content.endsWith('{')).toBe(true);
    expect(fallback.content).not.toBe(original.slice(0, 12));
  });

  it('throws an actionable error when a declaration is found but its signature cannot fit', () => {
    // A real declaration exists, so the last-resort head truncation must NOT be
    // used — the chunk is reported instead of being silently degraded.
    const chunk = makeChunk({
      repoId: 'payments',
      relativePath: 'src/huge.generated.ts',
      name: 'GeneratedChunk',
      chunkType: 'other',
      startLine: 100,
      endLine: 200,
      content: `function GeneratedChunk(${'a'.repeat(500)}) {\n  body();\n}`,
    });

    expect(() => handleOversizedInput(chunk, { maxInputTokens: 5, maxChunkLines: 2 })).toThrow(
      OversizedInputError,
    );
    try {
      handleOversizedInput(chunk, { maxInputTokens: 5, maxChunkLines: 2 });
    } catch (error) {
      expect(error).toMatchObject({
        repoId: 'payments',
        relativePath: 'src/huge.generated.ts',
        symbol: 'GeneratedChunk',
        startLine: 100,
        endLine: 200,
      });
      expect((error as Error).message).toContain('Suggestion:');
    }
  });

  it('strips a $partN suffix from the name before matching the declaration', () => {
    // The doc comment contains `{@link ...}`, so the brace fallback would pick a
    // mangled prefix of the comment. Matching the parent name — after stripping
    // the splitter's `$partN` suffix — finds the real declaration instead.
    const chunk = makeChunk({
      name: 'processPayment$part1',
      parentName: 'processPayment',
      content: [
        '/** Charges the payment. See {@link PaymentService} for details. */',
        'public boolean processPayment(long id) {',
        ...Array.from({ length: 30 }, (_, index) => `  chargeLine${index}();`),
        '}',
      ].join('\n'),
      startLine: 10,
      endLine: 43,
    });

    const result = handleOversizedInput(chunk, { maxInputTokens: 60, maxChunkLines: 5 });
    const fallback = result.chunks[0] as TestChunk;

    expect(result.mode).toBe('signature-only');
    expect(fallback.content).toContain('public boolean processPayment(long id) {');
    expect(fallback.content.endsWith('{')).toBe(true);
    // Not the mangled `{@link` prefix the brace fallback would have produced.
    expect(fallback.content.endsWith('See {')).toBe(false);
    expect(fallback.signatureOnly).toBe(true);
  });

  it('keeps a brace-less oversized sub-chunk as a flagged head truncation instead of dropping it', () => {
    // SQL-migration-like content: no declaration to extract at all. Previously
    // this threw OversizedInputError and the chunk vanished from the index.
    const lines = [
      'INSERT INTO payments (id, amount) VALUES',
      ...Array.from({ length: 60 }, (_, index) => `  (${index}, ${index}.00),`),
    ];
    const chunk = makeChunk({
      language: 'sql',
      chunkType: 'other',
      name: 'payments$part1',
      parentName: 'payments',
      content: lines.join('\n'),
      startLine: 1,
      endLine: lines.length,
    });
    const maxInputTokens = 60;

    const result = handleOversizedInput(chunk, { maxInputTokens, maxChunkLines: 5 });
    const degraded = result.chunks[0] as TestChunk;

    expect(result.chunks).toHaveLength(1);
    // Degradation is visible via the existing flag the pipeline already reports.
    expect(degraded.signatureOnly).toBe(true);
    expect(degraded.truncated).toBe(true);
    expect(estimateTokens(degraded.content)).toBeLessThanOrEqual(maxInputTokens);
    // It is a leading (head) truncation of the original content.
    expect(degraded.content.length).toBeGreaterThan(0);
    expect(chunk.content.startsWith(degraded.content)).toBe(true);
    expect(degraded.content).toContain('INSERT INTO payments (id, amount) VALUES');
    // Identity and source range are preserved for re-indexing.
    expect(degraded.startLine).toBe(1);
    expect(degraded.endLine).toBe(lines.length);
  });

  it('head-truncates a single brace-less line that alone exceeds the budget', () => {
    const chunk = makeChunk({
      chunkType: 'other',
      name: 'minified$part1',
      parentName: 'minified',
      content: 'x'.repeat(40_000),
      startLine: 1,
      endLine: 1,
    });
    const maxInputTokens = 25;

    const result = handleOversizedInput(chunk, { maxInputTokens });
    const degraded = result.chunks[0] as TestChunk;

    expect(degraded.signatureOnly).toBe(true);
    expect(degraded.truncated).toBe(true);
    expect(degraded.content.length).toBeGreaterThan(0);
    expect(estimateTokens(degraded.content)).toBeLessThanOrEqual(maxInputTokens);
    expect(chunk.content.startsWith(degraded.content)).toBe(true);
  });

  it('is deterministic for identical oversized inputs', () => {
    const chunk = makeChunk({
      content: [
        '/** Documented method. */',
        '@Transactional',
        'public void run() {',
        ...Array.from({ length: 20 }, (_, index) => `  bodyLine${index}();`),
        '}',
      ].join('\n'),
      endLine: 33,
    });
    const options = { maxInputTokens: 20, maxChunkLines: 5 };

    expect(handleOversizedInput(chunk, options)).toEqual(handleOversizedInput(chunk, options));
  });

  it('conserves an oversized input as parts, a fallback, or an error', () => {
    const inputs = [
      makeChunk({ chunkType: 'class', content: largeClassContent(), endLine: 24 }),
      makeChunk({
        id: 'method',
        content: 'public void run() {\n  body();\n}',
        endLine: 12,
      }),
    ];

    const outcomes = inputs.map((input) => handleOversizedInput(input, { maxInputTokens: 20 }));

    expect(outcomes).toHaveLength(inputs.length);
    expect(outcomes.every((outcome) => outcome.chunks.length > 0)).toBe(true);
    expect(outcomes.flatMap((outcome) => outcome.chunks).every((chunk) => chunk.id)).toBe(true);
  });

  it('retains full source range on a signature-only fallback even when content is reduced', () => {
    const chunk = makeChunk({
      startLine: 41,
      endLine: 141,
      content: 'public void run() {\n' + '  body();\n'.repeat(100) + '}',
    });
    const result = handleOversizedInput(chunk, { maxInputTokens: 10 });
    const fallback = result.chunks[0]!;

    expect(result.mode).toBe('signature-only');
    expect(fallback.startLine).toBe(41);
    expect(fallback.endLine).toBe(141);
    expect(fallback.content).toBe('public void run() {');
  });

  // The provider prepends a document prefix at request time. Reducing to exactly
  // maxInputTokens leaves no room for it, so the budgeter rejects the chunk and it
  // is skipped anyway. reservedTokens must be honoured by every reduction path.
  describe('reservedTokens (document prefix headroom)', () => {
    const PREFIX = 'search_document: ';
    const reservedTokens = estimateTokens(PREFIX);

    it('keeps a truncated undeclarable chunk within budget once the prefix is added', () => {
      // No braces and no name match => last-resort head truncation path.
      const chunk = makeChunk({
        name: 'migration$part1',
        chunkType: 'migration',
        content: Array.from({ length: 400 }, (_, i) => `INSERT INTO t VALUES (${i});`).join('\n'),
      });

      const result = handleOversizedInput(chunk, { maxInputTokens: 200, reservedTokens });
      const reduced = result.chunks[0]!;

      expect(result.mode).toBe('signature-only');
      expect(estimateTokens(PREFIX + reduced.content)).toBeLessThanOrEqual(200);
    });

    it('treats a chunk that only fits without the prefix as oversized', () => {
      // Sized to land between (cap - reserved) and cap, so it is 'unchanged'
      // without reservation but must be reduced once the prefix is reserved.
      const body = 'x'.repeat(760); // ~190 tokens at 0.25/char
      const chunk = makeChunk({ content: body });

      expect(handleOversizedInput(chunk, { maxInputTokens: 200 }).mode).toBe('unchanged');

      const reserved = handleOversizedInput(chunk, { maxInputTokens: 200, reservedTokens: 20 });
      expect(reserved.mode).not.toBe('unchanged');
      expect(estimateTokens(reserved.chunks[0]!.content)).toBeLessThanOrEqual(180);
    });

    it('is a no-op when no prefix is configured', () => {
      const chunk = makeChunk({ content: 'x'.repeat(760) });
      expect(handleOversizedInput(chunk, { maxInputTokens: 200, reservedTokens: 0 }).mode).toBe(
        'unchanged',
      );
    });

    it('reduces content when the actual provider channel is oversized', () => {
      const chunk = makeChunk({
        content: 'public void processPayment() {\n' + '  body();\n'.repeat(20) + '}',
      });

      const result = handleOversizedInput(chunk, {
        maxInputTokens: 200,
        estimateInputTokens: (candidate) =>
          (candidate as CodeChunk & { signatureOnly?: boolean }).signatureOnly ? 100 : 201,
      });

      expect(result.mode).toBe('signature-only');
      expect(result.chunks[0]!.signatureOnly).toBe(true);
      expect(result.chunks[0]!.content).toBe('public void processPayment() {');
    });
  });
});
