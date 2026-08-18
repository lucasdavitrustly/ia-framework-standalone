import { describe, expect, it } from 'vitest';
import type { QueryIntent } from '@ia-framework/core';
import { ContextAssembler, selectRange, deduplicateResults } from './assembler.js';
import type { RetrievalResult } from '@ia-framework/retrieval';

function makeResult(overrides: Partial<RetrievalResult> = {}): RetrievalResult {
  return {
    chunkId: 'chunk-1',
    filePath: '/repo/src/service.ts',
    relativePath: 'src/service.ts',
    language: 'typescript',
    chunkType: 'function',
    name: 'loadPayment',
    content: 'function loadPayment() {}',
    startLine: 10,
    endLine: 20,
    imports: ['node:fs'],
    exports: [],
    score: 0.9,
    matchedVector: 'semantic',
    ...overrides,
  };
}

describe('ContextAssembler range selection', () => {
  it.each([
    [{ docCommentStartLine: 4 }, { startLine: 4, endLine: 20 }],
    [{ annotationStartLine: 7 }, { startLine: 7, endLine: 20 }],
    [{ docCommentStartLine: 4, annotationStartLine: 7 }, { startLine: 4, endLine: 20 }],
    [{}, { startLine: 10, endLine: 20 }],
  ])('expands exact-symbol range to associated metadata %j', (fields, expected) => {
    expect(selectRange(makeResult(fields), 'exact_symbol')).toEqual(expected);
  });

  it('selects the class declaration and member signatures for a class overview', () => {
    const result = makeResult({
      chunkType: 'class',
      classSignature: 'class PaymentService extends BaseService implements Port',
      signature: 'class PaymentService',
      content: 'class PaymentService extends BaseService implements Port {}',
    });

    expect(selectRange(result, 'class_overview')).toEqual({ startLine: 10, endLine: 20 });
    expect(result.classSignature).toContain('extends BaseService implements Port');
  });

  it('uses the full body for the highest-priority conceptual result', () => {
    expect(selectRange(makeResult({ score: 0.95 }), 'conceptual')).toEqual({
      startLine: 10,
      endLine: 20,
    });
  });

  it('selects a compact signature for an unenriched conceptual result', () => {
    const result = makeResult({ content: '', signature: 'loadPayment(): Payment' });
    expect(new ContextAssembler().toContextItem(result, 'conceptual').text).toBe(
      'loadPayment(): Payment',
    );
  });

  it('uses a summary when source and signature are unavailable', () => {
    const result = makeResult({ content: '', signature: undefined, enrichment: { description: 'Loads payments.' } });
    expect(new ContextAssembler().toContextItem(result, 'conceptual').text).toBe('Loads payments.');
  });

  it('uses an empty summary when no source, signature, or enrichment exists', () => {
    const result = makeResult({ content: '', signature: undefined, enrichment: undefined });
    expect(new ContextAssembler().toContextItem(result, 'conceptual').text).toBe('');
  });

  it('includes imports only for dependency traces', () => {
    const assembler = new ContextAssembler();
    const result = makeResult({ imports: ['node:fs'] });
    expect(assembler.toContextItem(result, 'dependency_trace').text).toContain('node:fs');
    expect(assembler.toContextItem(result, 'conceptual').text).not.toContain('node:fs');
  });
});

describe('ContextAssembler deduplication and overlap merging', () => {
  it('deduplicates identical chunk IDs', () => {
    expect(deduplicateResults([makeResult(), makeResult({ score: 0.8 })])).toHaveLength(1);
  });

  it('deduplicates the same source region across collections', () => {
    const first = makeResult({ chunkId: 'ast', source: 'ast' });
    const second = makeResult({ chunkId: 'llm', source: 'llm' });
    expect(deduplicateResults([first, second])).toHaveLength(1);
  });

  it('deduplicates repeated files while preserving the highest-ranked chunk', () => {
    const first = makeResult({ chunkId: 'first', score: 0.9 });
    const second = makeResult({ chunkId: 'second', score: 0.8 });
    expect(deduplicateResults([first, second])[0]?.chunkId).toBe('first');
  });

  it('deduplicates repeated expansion results and summaries', () => {
    const first = makeResult({ chunkId: 'first', expansionSource: 'hierarchy' });
    const second = makeResult({ chunkId: 'second', expansionSource: 'hierarchy' });
    expect(deduplicateResults([first, second])).toHaveLength(1);
  });

  it('does not deduplicate different repositories with the same path and range', () => {
    const first = makeResult({ chunkId: 'repo-a', repoId: 'repo-a' });
    const second = makeResult({ chunkId: 'repo-b', repoId: 'repo-b' });
    expect(deduplicateResults([first, second])).toHaveLength(2);
  });

  it('does not deduplicate different source ranges in one file', () => {
    const first = makeResult({ chunkId: 'first', startLine: 1, endLine: 5 });
    const second = makeResult({ chunkId: 'second', startLine: 6, endLine: 10 });
    expect(deduplicateResults([first, second])).toHaveLength(2);
  });

  it('deduplicates identical summary anchors with different chunk IDs', () => {
    const first = makeResult({ chunkId: 'summary-a', content: '', signature: undefined });
    const second = makeResult({ chunkId: 'summary-b', content: '', signature: undefined });
    expect(deduplicateResults([first, second])).toHaveLength(1);
  });

  it('preserves ranking and provenance for surviving results', () => {
    const results = [
      makeResult({ chunkId: 'top', score: 0.9, expansionSource: undefined }),
      makeResult({ chunkId: 'expanded', score: 0.1, expansionSource: 'adjacent' }),
    ];
    const deduped = deduplicateResults(results);
    expect(deduped.map((result) => result.chunkId)).toEqual(['top']);
    expect(deduped[0]?.expansionSource).toBeUndefined();
  });

  it('always emits a complete source anchor', () => {
    const item = new ContextAssembler().toContextItem(
      makeResult({ repoId: 'repo-a', name: 'loadPayment' }),
      'exact_symbol',
    );
    expect(item.anchor).toEqual({
      repoId: 'repo-a',
      relativePath: 'src/service.ts',
      symbol: 'loadPayment',
      startLine: 10,
      endLine: 20,
    });
  });

  it('emits an anchor without optional repository or symbol fields', () => {
    const [item] = new ContextAssembler().assemble(
      [makeResult({ repoId: undefined, name: undefined })],
      'exact_symbol',
    );
    expect(item?.anchor).toEqual({
      relativePath: 'src/service.ts',
      startLine: 10,
      endLine: 20,
    });
  });

  it('preserves AST collection provenance', () => {
    const [item] = new ContextAssembler().assemble([makeResult({ source: 'ast' })], 'conceptual');
    expect(item?.provenance.collection).toBe('ast');
  });

  it('preserves LLM collection provenance', () => {
    const [item] = new ContextAssembler().assemble([makeResult({ source: 'llm' })], 'conceptual');
    expect(item?.provenance.collection).toBe('llm');
  });
});

describe('ContextAssembler', () => {
  it('assembles results in ranked order with the requested intent', () => {
    const assembler = new ContextAssembler();
    const results = [
      makeResult({ chunkId: 'first', score: 0.9 }),
      makeResult({ chunkId: 'second', score: 0.8, startLine: 30, endLine: 40 }),
    ];
    const items = assembler.assemble(results, 'conceptual');

    expect(items).toHaveLength(2);
    expect(items[0]?.anchor.symbol).toBe('loadPayment');
    expect(items[1]?.anchor.startLine).toBe(30);
  });

  it.each<QueryIntent>([
    'exact_symbol',
    'class_overview',
    'conceptual',
    'dependency_trace',
    'existence',
    'aggregation',
  ])('supports every query intent: %s', (intent) => {
    const [item] = new ContextAssembler().assemble([makeResult()], intent);
    expect(item?.anchor.relativePath).toBe('src/service.ts');
  });

  it('marks signature-only and stale metadata on the context item', () => {
    const [item] = new ContextAssembler().assemble(
      [makeResult({ signatureOnly: true, stale: true })],
      'exact_symbol',
    );
    expect(item?.signatureOnly).toBe(true);
    expect(item?.stale).toBe(true);
  });

  it('preserves hierarchy expansion provenance and priority', () => {
    const [item] = new ContextAssembler().assemble(
      [makeResult({ expansionSource: 'hierarchy' })],
      'conceptual',
    );
    expect(item?.provenance.expansionSource).toBe('hierarchy');
    expect(item?.priority).toBe(5);
  });

  it('preserves adjacent expansion provenance', () => {
    const [item] = new ContextAssembler().assemble(
      [makeResult({ expansionSource: 'adjacent' })],
      'conceptual',
    );
    expect(item?.provenance.expansionSource).toBe('adjacent');
  });

  it('maps semantic branch provenance', () => {
    const [item] = new ContextAssembler().assemble(
      [makeResult({ matchedVector: 'semantic' })],
      'conceptual',
    );
    expect(item?.provenance.branch).toBe('semantic');
  });

  it('does not invent a branch for RRF provenance', () => {
    const [item] = new ContextAssembler().assemble(
      [makeResult({ matchedVector: 'both', scoreType: 'rrf' })],
      'conceptual',
    );
    expect(item?.provenance.branch).toBeUndefined();
  });

  it('uses expanded exact-symbol ranges on both item and anchor', () => {
    const [item] = new ContextAssembler().assemble(
      [makeResult({ docCommentStartLine: 4, annotationStartLine: 7 })],
      'exact_symbol',
    );
    expect(item?.range).toEqual({ startLine: 4, endLine: 20 });
    expect(item?.anchor.startLine).toBe(4);
  });

  it('keeps input ranking after deduplication', () => {
    const items = new ContextAssembler().assemble(
      [
        makeResult({ chunkId: 'first', score: 0.9 }),
        makeResult({ chunkId: 'second', score: 0.8, startLine: 30 }),
      ],
      'conceptual',
    );
    expect(items.map((item) => item.anchor.startLine)).toEqual([10, 30]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// F3.1 — a class overview is the declaration + the field block + method
// SIGNATURES with no bodies (context.md decision 3). Bodies appear only for
// members the query specifically implicates.
// ─────────────────────────────────────────────────────────────────────────────

const CLASS_WITH_BODIES = [
  'class Entry extends EntryCore implements Auditable {',
  '  private readonly id: string;',
  '  private amount: number;',
  '',
  '  getId(): string {',
  '    return id;',
  '  }',
  '',
  '  setAmount(a: number): void {',
  '    this.amount = a;',
  '  }',
  '}',
].join('\n');

describe('F3.1: class overview omits method bodies', () => {
  const overview = (query = 'what is an Entry?'): string =>
    new ContextAssembler().toContextItem(
      makeResult({
        chunkType: 'class',
        name: 'Entry',
        classSignature: 'class Entry extends EntryCore implements Auditable',
        content: CLASS_WITH_BODIES,
      }),
      'class_overview',
      query,
    ).text ?? '';

  it('renders the declaration with extends and implements', () => {
    expect(overview()).toContain('class Entry extends EntryCore implements Auditable');
  });

  it('renders the field block', () => {
    const text = overview();
    expect(text).toContain('private readonly id: string;');
    expect(text).toContain('private amount: number;');
  });

  it('renders method signatures', () => {
    const text = overview();
    expect(text).toContain('getId(): string');
    expect(text).toContain('setAmount(a: number): void');
  });

  it('omits body statements that the fixture genuinely contains', () => {
    const text = overview();
    // Both strings are present in CLASS_WITH_BODIES, so their absence is a real
    // constraint on the renderer and not a tautology.
    expect(CLASS_WITH_BODIES).toContain('return id;');
    expect(CLASS_WITH_BODIES).toContain('this.amount = a;');
    expect(text).not.toContain('return id;');
    expect(text).not.toContain('this.amount = a;');
  });

  it('omits statements inside a member that has no parameter list, such as a static block', () => {
    // A static initializer block is not a signature; per decision 3 its
    // statements are bodies and must not appear in an overview.
    const content = [
      'class Entry {',
      '  private static registry: Map<string, Entry>;',
      '',
      '  static {',
      '    Entry.registry = new Map();',
      '  }',
      '}',
    ].join('\n');
    const text =
      new ContextAssembler().toContextItem(
        makeResult({ chunkType: 'class', name: 'Entry', classSignature: 'class Entry', content }),
        'class_overview',
        'what is an Entry?',
      ).text ?? '';

    expect(content).toContain('Entry.registry = new Map();');
    expect(text).toContain('private static registry: Map<string, Entry>;');
    expect(text).not.toContain('Entry.registry = new Map();');
  });

  it('renders the body of a member the query specifically implicates', () => {
    const text =
      new ContextAssembler().toContextItem(
        makeResult({
          chunkType: 'class',
          name: 'Entry',
          classSignature: 'class Entry',
          content: [
            'class Entry {',
            '  private amount: number;',
            '',
            '  entryTotal(): number {',
            '    return this.amount * 2;',
            '  }',
            '',
            '  unrelatedHelper(): void {',
            '    this.amount = 0;',
            '  }',
            '}',
          ].join('\n'),
        }),
        'class_overview',
        'what is an Entry?',
      ).text ?? '';

    // entryTotal is implicated by the query term "entry" — its body renders.
    expect(text).toContain('return this.amount * 2;');
    // unrelatedHelper is not implicated — signature only.
    expect(text).toContain('unrelatedHelper(): void');
    expect(text).not.toContain('this.amount = 0;');
  });
});
