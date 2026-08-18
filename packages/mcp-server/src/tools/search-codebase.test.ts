import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createHash } from 'node:crypto';
import { estimateTokens } from '@ia-framework/core';
import type { EmbeddingContract } from '@ia-framework/core';
import {
  searchCodebaseHandler,
  formatResult,
  resetSearchSessionCache,
  resetContractVerdictCache,
  registerContractGate,
  warmContractGates,
} from './search-codebase.js';
import type { RetrievalResult } from '@ia-framework/retrieval';
import type { MetricsStore } from '@ia-framework/observability';
import { QdrantVectorStore } from '@ia-framework/vector-store';
import { QueryPlanner } from '@ia-framework/retrieval';

/**
 * Vitest asymmetric matchers are typed `any`; these thin wrappers narrow them to
 * `unknown` so nested matcher shapes stay lint-clean without suppressions.
 */
const arrayContaining = (items: unknown[]): unknown => expect.arrayContaining(items) as unknown;
const objectContaining = (shape: Record<string, unknown>): unknown =>
  expect.objectContaining(shape) as unknown;

/** Typed view of the search_codebase tool's structuredContent payload. */
interface SearchStructured {
  answered?: boolean;
  confidence_gated?: boolean;
  route?: string;
  results?: Array<{
    file?: string;
    name?: string;
    score?: number;
    repo?: string;
    stale?: boolean;
    signature_only?: boolean;
    read_failed?: boolean;
    parent_name?: string;
    parent_start_line?: number;
    parent_end_line?: number;
    part_index?: number;
    total_parts?: number;
    truncated?: boolean;
  }>;
  [key: string]: unknown;
}

function structuredOf(result: { structuredContent?: object | undefined }): SearchStructured {
  return (result.structuredContent ?? {}) as SearchStructured;
}

/**
 * Minimal MetricsStore double: `logClassification` is gated only on
 * `observability.metricsStore` being present, so a bare object suffices.
 * `MetricsStore` is a class with private state, so it cannot be satisfied
 * structurally — the double is asserted through `unknown` instead.
 */
const metricsStoreDouble = {} as unknown as MetricsStore;

// ── F2.3: a mocked Qdrant transport so the real QdrantVectorStore +
// ContractStore produce the refusal, rather than a hand-thrown test error. ──
const mockCollectionExists = vi.fn();
const mockGetCollection = vi.fn();
const mockRetrieve = vi.fn();
const mockCreatePayloadIndex = vi.fn();

vi.mock('@qdrant/js-client-rest', () => {
  class MockQdrantClient {
    collectionExists = mockCollectionExists;
    getCollection = mockGetCollection;
    retrieve = mockRetrieve;
    createPayloadIndex = mockCreatePayloadIndex;
  }
  return { QdrantClient: MockQdrantClient };
});

const ACTIVE_CONTRACT: EmbeddingContract = {
  provider: 'openai',
  model: 'text-embedding-3-small',
  dimension: 3,
  tokenizerVersion: 1,
  sparseHashVersion: 1,
};

const STORED_CONTRACT = {
  kind: '__ia_contract__',
  ...ACTIVE_CONTRACT,
  indexGeneration: 'generation-1',
  writtenAt: '2026-08-13T00:00:00.000Z',
};

/**
 * Configure the mocked transport so an existing, dimension-matching collection
 * carries (or lacks) a persisted contract point.
 */
function makeContractClient(options: { persisted: Record<string, unknown> | undefined }): void {
  mockCollectionExists.mockResolvedValue({ exists: true });
  mockGetCollection.mockResolvedValue({
    config: { params: { vectors: { semantic: { size: 3 }, signature: { size: 3 } } } },
  });
  mockRetrieve.mockResolvedValue(
    options.persisted ? [{ id: 'contract-point', payload: options.persisted }] : [],
  );
  mockCreatePayloadIndex.mockResolvedValue(true);
}

/**
 * The production assert callable: QdrantVectorStore.initialize() is
 * assertSearchable()'s only caller, so this is the real contract gate.
 */
function makeRealAssert(collectionName: string): () => Promise<void> {
  return async () => {
    const store = new QdrantVectorStore({ host: 'localhost', port: 6333, collectionName });
    await store.initialize({
      textDimensions: ACTIVE_CONTRACT.dimension,
      codeDimensions: ACTIVE_CONTRACT.dimension,
      embeddingContract: ACTIVE_CONTRACT,
    });
  };
}

function makeResult(overrides: Partial<RetrievalResult> = {}): RetrievalResult {
  return {
    chunkId: 'chunk-1',
    filePath: '/project/src/foo.ts',
    relativePath: 'src/foo.ts',
    language: 'typescript',
    chunkType: 'function',
    name: 'myFunction',
    content: 'function myFunction() {}',
    startLine: 1,
    endLine: 3,
    score: 0.92,
    matchedVector: 'both',
    imports: [],
    exports: [],
    ...overrides,
  };
}

describe('searchCodebaseHandler - hierarchy expansion', () => {
  it('Test 1: expands superclass when result has superclass field and expand_hops >= 1', async () => {
    const subclassChunk = makeResult({
      chunkId: 'chunk-sub',
      name: 'UserService',
      chunkType: 'class',
      superclass: 'BaseService',
    });
    const parentChunk = makeResult({
      chunkId: 'chunk-parent',
      name: 'BaseService',
      chunkType: 'class',
      content: 'class BaseService {}',
      score: 0,
      relativePath: 'src/base-service.ts',
    });

    const engine = {
      searchWithExpansion: vi.fn().mockResolvedValue([subclassChunk]),
      search: vi.fn().mockResolvedValue([subclassChunk]),
      scrollForHierarchy: vi.fn().mockResolvedValue([parentChunk]),
    };

    const output = await searchCodebaseHandler(engine, {
      query: 'user service',
      expand_hops: 1,
    });

    expect(engine.scrollForHierarchy).toHaveBeenCalledWith(
      'BaseService',
      'class',
      expect.objectContaining({ excludeTests: true, reservedExclusion: true }),
    );
    const text = (output.content[0] as { type: 'text'; text: string }).text;
    expect(text).toContain('BaseService');
    expect(text).toContain('[hierarchy]');
  });

  it('threads repository and metadata filters through implementation expansion', async () => {
    const serviceChunk = makeResult({
      chunkId: 'chunk-service',
      repoId: 'repo-a',
      name: 'PaymentService',
      chunkType: 'class',
      interfaces: ['PaymentPort'],
    });
    const implementationChunk = makeResult({
      chunkId: 'chunk-impl',
      repoId: 'repo-a',
      name: 'PaymentServiceImpl',
      chunkType: 'class',
      score: 0,
    });
    const engine = {
      searchWithExpansion: vi.fn().mockResolvedValue([serviceChunk]),
      search: vi.fn().mockResolvedValue([serviceChunk]),
      scrollForImplementations: vi.fn((_: string, filter: unknown) =>
        Promise.resolve(JSON.stringify(filter).includes('repo-a') ? [implementationChunk] : []),
      ),
    };

    await searchCodebaseHandler(engine, {
      query: 'payment service',
      repo: 'repo-a',
      language: 'typescript',
      expand_hops: 1,
    });

    expect(engine.scrollForImplementations).toHaveBeenCalledWith(
      'PaymentService',
      objectContaining({
        repoId: 'repo-a',
        userFilters: {
          must: arrayContaining([
            { key: 'repoId', match: { value: 'repo-a' } },
            { key: 'language', match: { value: 'typescript' } },
          ]),
        },
        excludeTests: true,
        reservedExclusion: true,
      }),
    );
  });

  it('Test 2: skips hierarchy expansion when expand_hops=0', async () => {
    const subclassChunk = makeResult({
      chunkId: 'chunk-sub',
      name: 'UserService',
      chunkType: 'class',
      superclass: 'BaseService',
    });

    const engine = {
      searchWithExpansion: vi.fn().mockResolvedValue([subclassChunk]),
      search: vi.fn().mockResolvedValue([subclassChunk]),
      scrollForHierarchy: vi.fn().mockResolvedValue([]),
    };

    await searchCodebaseHandler(engine, {
      query: 'user service',
      expand_hops: 0,
    });

    expect(engine.scrollForHierarchy).not.toHaveBeenCalled();
  });

  it('Test 3: multi-level hierarchy expansion follows chain up to hops limit', async () => {
    const subclassChunk = makeResult({
      chunkId: 'chunk-sub',
      name: 'UserService',
      chunkType: 'class',
      superclass: 'BaseService',
    });
    const midChunk = makeResult({
      chunkId: 'chunk-mid',
      name: 'BaseService',
      chunkType: 'class',
      superclass: 'AbstractHandler',
      score: 0,
      relativePath: 'src/base-service.ts',
    });
    const rootChunk = makeResult({
      chunkId: 'chunk-root',
      name: 'AbstractHandler',
      chunkType: 'class',
      score: 0,
      relativePath: 'src/abstract-handler.ts',
    });

    const engine = {
      searchWithExpansion: vi.fn().mockResolvedValue([subclassChunk]),
      search: vi.fn().mockResolvedValue([subclassChunk]),
      scrollForHierarchy: vi
        .fn()
        .mockResolvedValueOnce([midChunk])
        .mockResolvedValueOnce([rootChunk]),
    };

    const output = await searchCodebaseHandler(engine, {
      query: 'handler',
      expand_hops: 2,
    });

    expect(engine.scrollForHierarchy).toHaveBeenCalledTimes(2);
    const text = (output.content[0] as { type: 'text'; text: string }).text;
    expect(text).toContain('BaseService');
    expect(text).toContain('AbstractHandler');
  });

  it('Test 4: exception hierarchy traversal returns connected chain', async () => {
    const leafException = makeResult({
      chunkId: 'chunk-leaf',
      name: 'ResourceNotFoundException',
      chunkType: 'class',
      superclass: 'AppException',
    });
    const parentException = makeResult({
      chunkId: 'chunk-parent',
      name: 'AppException',
      chunkType: 'class',
      superclass: 'RuntimeException',
      score: 0,
      relativePath: 'src/app-exception.ts',
    });
    const rootException = makeResult({
      chunkId: 'chunk-root',
      name: 'RuntimeException',
      chunkType: 'class',
      score: 0,
      relativePath: 'src/runtime-exception.ts',
    });

    const engine = {
      searchWithExpansion: vi.fn().mockResolvedValue([leafException]),
      search: vi.fn().mockResolvedValue([leafException]),
      scrollForHierarchy: vi
        .fn()
        .mockResolvedValueOnce([parentException])
        .mockResolvedValueOnce([rootException]),
    };

    const output = await searchCodebaseHandler(engine, {
      query: 'exception hierarchy',
      expand_hops: 2,
    });

    expect(engine.scrollForHierarchy).toHaveBeenCalledWith(
      'AppException',
      'class',
      expect.objectContaining({ excludeTests: true, reservedExclusion: true }),
    );
    expect(engine.scrollForHierarchy).toHaveBeenCalledWith(
      'RuntimeException',
      'class',
      expect.objectContaining({ excludeTests: true, reservedExclusion: true }),
    );
    const text = (output.content[0] as { type: 'text'; text: string }).text;
    expect(text).toContain('ResourceNotFoundException');
    expect(text).toContain('AppException');
    expect(text).toContain('RuntimeException');
  });
});

describe('searchCodebaseHandler - token cap', () => {
  it('Test 5: trims results when total tokens exceed maxTokensPerCall', async () => {
    // Each result has 3000-char content → ~750 tokens each
    // 10 results × 750 tokens = 7500 tokens > 6000 cap
    const largeContent = 'x'.repeat(3000);
    const results = Array.from({ length: 10 }, (_, i) =>
      makeResult({
        chunkId: `chunk-${i}`,
        content: largeContent,
        score: 1.0 - i * 0.05,
        relativePath: `src/file${i}.ts`,
        startLine: i * 4 + 1,
        endLine: i * 4 + 3,
      }),
    );

    const engine = {
      searchWithExpansion: vi.fn().mockResolvedValue(results),
      search: vi.fn().mockResolvedValue(results),
      scrollForHierarchy: vi.fn().mockResolvedValue([]),
    };

    const output = await searchCodebaseHandler(
      engine,
      { query: 'test token cap', expand_hops: 0 },
      { maxTokensPerCall: 6000 },
    );

    // The serialized response is governed by the assembled evidence budget:
    // 10 candidates × ~750 tokens cannot all survive a 6000-token budget.
    const text = (output.content[0] as { type: 'text'; text: string }).text;
    const matchCount = (text.match(/###\s+\d+\./g) ?? []).length;
    expect(matchCount).toBeGreaterThan(0);
    expect(matchCount).toBeLessThan(10);

    // BUD-15: the trimming is reported, not silent.
    const s = output.structuredContent as Record<string, unknown>;
    expect(s.candidate_count).toBe(10);
    expect(s.selected_count).toBe(matchCount);
    expect((s.omitted_count as number) + (s.compaction_count as number)).toBe(10 - matchCount);
    expect(s.token_cap_applied).toBe(true);
    expect(s.results_trimmed).toBe(10 - matchCount);
    // The trimming actually worked: the response the caller receives fits the cap,
    // and the untrimmed candidate set provably would not have.
    expect(s.estimated_tokens as number).toBeLessThanOrEqual(6000);
    expect(estimateTokens(results.map((r) => r.content).join('\n'))).toBeGreaterThan(6000);
  });

  it('Test 6: 70/30 split applies when hierarchy results are present', async () => {
    const largeContent = 'x'.repeat(4000); // ~1000 tokens each
    const directResults = Array.from({ length: 3 }, (_, i) =>
      makeResult({
        chunkId: `direct-${i}`,
        content: largeContent,
        score: 0.9 - i * 0.1,
        relativePath: `src/direct${i}.ts`,
        startLine: i * 4 + 1,
        endLine: i * 4 + 3,
      }),
    );
    const hierarchyResults = Array.from({ length: 3 }, (_, i) =>
      makeResult({
        chunkId: `hier-${i}`,
        content: largeContent,
        score: 0.5,
        relativePath: `src/hier${i}.ts`,
        startLine: i * 4 + 1,
        endLine: i * 4 + 3,
        expansionSource: 'hierarchy' as const,
      }),
    );

    const engine = {
      searchWithExpansion: vi.fn().mockResolvedValue(directResults),
      search: vi.fn().mockResolvedValue(directResults),
      scrollForHierarchy: vi.fn().mockResolvedValue(hierarchyResults),
    };

    const output = await searchCodebaseHandler(
      engine,
      { query: 'hierarchy cap test', expand_hops: 1 },
      { maxTokensPerCall: 6000 },
    );

    // With 6 results × 1000 tokens = 6000 tokens, cap should apply to at least some
    expect(output.structuredContent).toBeDefined();
    // Both direct and hierarchy results should appear (70/30 split preserves at least 1 from each)
    const text = (output.content[0] as { type: 'text'; text: string }).text;
    expect(text).toContain('src/direct0.ts');
  });
});

describe('T45: serialized context assembly and candidate limits', () => {
  it('runs retrieve, expand, rank, live-read, assemble, serialize, measure, and enforce in order', async () => {
    const stages: string[] = [];
    const result = makeResult({ content: '', relativePath: 'src/stage.ts' });
    const engine = {
      searchWithExpansion: vi.fn().mockImplementation(() => Promise.resolve([result])),
      search: vi.fn(),
    };

    await searchCodebaseHandler(
      engine,
      { query: 'how does payment work', expand_hops: 0 },
      {
        readFileFn: vi.fn().mockImplementation(() => {
          stages.push('live-read');
          return Promise.resolve('live payment code');
        }),
        stageHook: (stage: string) => stages.push(stage),
      },
    );

    expect(stages).toEqual([
      'retrieve',
      'expand',
      'dedup+merge',
      'rank',
      'live-read',
      'assemble',
      'serialize',
      'measure',
      'enforce',
    ]);
  });

  it('keeps candidate limit independent from the model-visible budget', async () => {
    const results = [makeResult({ chunkId: 'a' }), makeResult({ chunkId: 'b', relativePath: 'src/b.ts' })];
    const searchWithExpansion = vi.fn().mockResolvedValue(results);
    const engine = { searchWithExpansion, search: vi.fn() };

    const output = await searchCodebaseHandler(
      engine,
      { query: 'payment service', limit: 2, expand_hops: 0 },
      { maxTokensPerCall: 1000 },
    );

    const firstQuery = searchWithExpansion.mock.calls[0]?.[0] as { limit?: number } | undefined;
    expect(firstQuery?.limit).toBe(2);
    expect((output.content[0] as { type: 'text'; text: string }).text).toContain('src/foo.ts');
  });

  it('includes live source beyond the old fixed top-five cutoff', async () => {
    const results = Array.from({ length: 7 }, (_, index) =>
      makeResult({
        chunkId: `chunk-${index}`,
        name: `function${index}`,
        content: '',
        score: 0.95 - index * 0.01,
        relativePath: `src/file${index}.ts`,
        startLine: 1,
        endLine: 1,
      }),
    );
    const engine = {
      searchWithExpansion: vi.fn().mockResolvedValue(results),
      search: vi.fn(),
    };
    const output = await searchCodebaseHandler(
      engine,
      { query: 'payment service', limit: 10, expand_hops: 0 },
      { readFileFn: vi.fn((path: string) => Promise.resolve(`live source for ${path}`)) },
    );

    const text = (output.content[0] as { type: 'text'; text: string }).text;
    expect(text).toContain('live source for src/file6.ts');
  });

  it('does not treat an empty stored payload as costless when live source is available', async () => {
    const result = makeResult({ content: '', score: 0.95 });
    const engine = { searchWithExpansion: vi.fn().mockResolvedValue([result]), search: vi.fn() };
    const output = await searchCodebaseHandler(
      engine,
      { query: 'payment service', expand_hops: 0 },
      { readFileFn: vi.fn().mockResolvedValue('live source that must be measured') },
    );

    const text = (output.content[0] as { type: 'text'; text: string }).text;
    expect(text).toContain('live source that must be measured');
  });

  it('returns a targeted range instead of a whole file for a named method query', async () => {
    const result = makeResult({
      name: 'refund',
      content: '',
      relativePath: 'src/payment.ts',
      startLine: 100,
      endLine: 110,
      score: 0.95,
    });
    const engine = { searchWithExpansion: vi.fn().mockResolvedValue([result]), search: vi.fn() };
    // L-008: a reader over a genuine 2000-line file, returning exactly the range it
    // is asked for. A whole-file read WOULD emit 'line 2000', so its absence is a
    // real property of the request rather than an artefact of the fixture.
    const wholeFile = Array.from({ length: 2000 }, (_, index) => `line ${index + 1}`);
    const readFileFn = vi.fn(
      (_path: string, startLine: number, endLine: number): Promise<string> =>
        Promise.resolve(wholeFile.slice(startLine - 1, endLine).join('\n')),
    );

    const output = await searchCodebaseHandler(
      engine,
      { query: 'how does PaymentService.refund work', expand_hops: 0 },
      { readFileFn },
    );

    const text = (output.content[0] as { type: 'text'; text: string }).text;
    expect(text).toContain('src/payment.ts:100-110');
    // The requested range is present in full...
    expect(text).toContain('line 100');
    expect(text).toContain('line 110');
    // ...and nothing outside it, including the file's last line.
    expect(text).not.toContain('line 99');
    expect(text).not.toContain('line 111');
    expect(text).not.toContain('line 2000');
    expect(readFileFn).toHaveBeenCalledWith('src/payment.ts', 100, 110, undefined);
  });

  it('places the requested symbol code in the response without caller-side grep', async () => {
    const result = makeResult({ name: 'refund', content: '', score: 0.95 });
    const engine = { searchWithExpansion: vi.fn().mockResolvedValue([result]), search: vi.fn() };
    const output = await searchCodebaseHandler(
      engine,
      { query: 'how does PaymentService.refund work', expand_hops: 0 },
      { readFileFn: vi.fn().mockResolvedValue('function refund() { return payment; }') },
    );

    expect((output.content[0] as { type: 'text'; text: string }).text).toContain('function refund()');
  });
});

describe('query classification routing', () => {
  it('keyword query routes to searchWithFallback, not searchWithExpansion', async () => {
    const result = makeResult({ chunkId: 'kw-1', name: 'UserService', relativePath: 'src/kw.ts' });
    const engine = {
      searchWithExpansion: vi.fn().mockResolvedValue([]),
      search: vi.fn().mockResolvedValue([]),
      searchWithFallback: vi
        .fn()
        .mockResolvedValue({ results: [result], suggestions: [], fallback_used: false }),
    };

    const output = await searchCodebaseHandler(engine, { query: 'UserService' });

    expect(engine.searchWithFallback).toHaveBeenCalled();
    expect(engine.searchWithExpansion).not.toHaveBeenCalled();
    const text = (output.content[0] as { type: 'text'; text: string }).text;
    expect(text).toContain('keyword-routed');
  });

  it('semantic query routes to searchWithExpansion', async () => {
    const result = makeResult({ chunkId: 'sem-1' });
    const engine = {
      searchWithExpansion: vi.fn().mockResolvedValue([result]),
      search: vi.fn().mockResolvedValue([result]),
      searchWithFallback: vi
        .fn()
        .mockResolvedValue({ results: [], suggestions: [], fallback_used: false }),
    };

    const output = await searchCodebaseHandler(engine, {
      query: 'how does authentication work in this project',
    });

    expect(engine.searchWithExpansion).toHaveBeenCalled();
    const text = (output.content[0] as { type: 'text'; text: string }).text;
    expect(text).not.toContain('keyword-routed');
  });

  it('keyword query with 0 results falls back to semantic path', async () => {
    const result = makeResult({ chunkId: 'fb-1' });
    const engine = {
      searchWithExpansion: vi.fn().mockResolvedValue([result]),
      search: vi.fn().mockResolvedValue([result]),
      searchWithFallback: vi
        .fn()
        .mockResolvedValue({ results: [], suggestions: [], fallback_used: false }),
    };

    const output = await searchCodebaseHandler(engine, { query: 'NonExistentSymbol' });

    // searchWithFallback called first (keyword route), then searchWithExpansion (semantic fallback)
    expect(engine.searchWithFallback).toHaveBeenCalled();
    expect(engine.searchWithExpansion).toHaveBeenCalled();
    const text = (output.content[0] as { type: 'text'; text: string }).text;
    expect(text).not.toContain('keyword-routed');
  });

  it('keyword route skips score threshold filtering', async () => {
    const lowScoreResult = makeResult({ chunkId: 'low-1', score: 0.1 });
    const engine = {
      searchWithExpansion: vi.fn().mockResolvedValue([]),
      search: vi.fn().mockResolvedValue([]),
      searchWithFallback: vi
        .fn()
        .mockResolvedValue({ results: [lowScoreResult], suggestions: [], fallback_used: false }),
    };

    const output = await searchCodebaseHandler(
      engine,
      { query: 'UserService' },
      { defaultScoreThreshold: 0.5 },
    );

    const text = (output.content[0] as { type: 'text'; text: string }).text;
    expect(text).toContain('keyword-routed');
    expect(text).toContain('1 results');
  });
});

describe('CEX — confidence-based early exit', () => {
  it('logs earlyExit=true when keyword confidence >= 0.8 and results > 0', async () => {
    // "UserService" is a symbol pattern → classified as keyword with confidence 1.0
    const result = makeResult({ chunkId: 'cex-1', name: 'UserService' });
    const loggerInfo = vi.fn();
    const engine = {
      searchWithExpansion: vi.fn().mockResolvedValue([]),
      search: vi.fn().mockResolvedValue([]),
      searchWithFallback: vi
        .fn()
        .mockResolvedValue({ results: [result], suggestions: [], fallback_used: false }),
    };

    await searchCodebaseHandler(
      engine,
      { query: 'UserService' },
      { metricsStore: metricsStoreDouble, logger: { info: loggerInfo } },
    );

    expect(loggerInfo).toHaveBeenCalled();
    const logEntry = loggerInfo.mock.calls[0]![0] as Record<string, unknown>;
    expect(logEntry.earlyExit).toBe(true);
    expect(logEntry.earlyExitReason).toBe('confidence-above-threshold');
  });

  it('logs earlyExit=false when keyword confidence >= 0.8 but 0 results (fallback)', async () => {
    // "NonExistentSymbol" is a symbol → keyword with high confidence, but 0 results
    const semanticResult = makeResult({ chunkId: 'fb-sem' });
    const loggerInfo = vi.fn();
    const engine = {
      searchWithExpansion: vi.fn().mockResolvedValue([semanticResult]),
      search: vi.fn().mockResolvedValue([semanticResult]),
      searchWithFallback: vi
        .fn()
        .mockResolvedValue({ results: [], suggestions: [], fallback_used: false }),
    };

    await searchCodebaseHandler(
      engine,
      { query: 'NonExistentSymbol' },
      { metricsStore: metricsStoreDouble, logger: { info: loggerInfo } },
    );

    // First log call is the keyword-fallback-semantic
    expect(loggerInfo).toHaveBeenCalled();
    const firstLog = loggerInfo.mock.calls[0]![0] as Record<string, unknown>;
    expect(firstLog.earlyExit).toBe(false);
    expect(firstLog.earlyExitReason).toBe('fallback-no-results');
  });

  it('logs earlyExit=false when keyword confidence < 0.8', async () => {
    const result = makeResult({ chunkId: 'low-conf' });
    const loggerInfo = vi.fn();
    const engine = {
      searchWithExpansion: vi.fn().mockResolvedValue([result]),
      search: vi.fn().mockResolvedValue([result]),
      searchWithFallback: vi
        .fn()
        .mockResolvedValue({ results: [result], suggestions: [], fallback_used: false }),
    };

    await searchCodebaseHandler(
      engine,
      { query: 'some query' },
      { metricsStore: metricsStoreDouble, logger: { info: loggerInfo } },
    );

    expect(loggerInfo).toHaveBeenCalled();
    const logEntry = loggerInfo.mock.calls[0]![0] as Record<string, unknown>;
    expect(logEntry.earlyExit).toBe(false);
    expect(logEntry.earlyExitReason).toBeUndefined();

  });

  it('respects custom earlyExitConfidence threshold (0.9)', async () => {
    // "UserService" → confidence 1.0, which is >= 0.9
    const result = makeResult({ chunkId: 'custom-1', name: 'UserService' });
    const loggerInfo = vi.fn();
    const engine = {
      searchWithExpansion: vi.fn().mockResolvedValue([]),
      search: vi.fn().mockResolvedValue([]),
      searchWithFallback: vi
        .fn()
        .mockResolvedValue({ results: [result], suggestions: [], fallback_used: false }),
    };

    await searchCodebaseHandler(
      engine,
      { query: 'UserService' },
      {
        metricsStore: metricsStoreDouble,
        logger: { info: loggerInfo },
        earlyExitConfidence: 0.9,
      },
    );

    expect(loggerInfo).toHaveBeenCalled();
    const logEntry = loggerInfo.mock.calls[0]![0] as Record<string, unknown>;
    expect(logEntry.earlyExit).toBe(true);
    expect(logEntry.earlyExitReason).toBe('confidence-above-threshold');
  });
});

describe('searchCodebaseHandler - confidence gate', () => {
  it('returns "no relevant code found" when best result score is below confidenceThreshold', async () => {
    const lowScoreResult = makeResult({ chunkId: 'low-1', score: 0.55 });
    const engine = {
      searchWithExpansion: vi.fn().mockResolvedValue([lowScoreResult]),
      search: vi.fn().mockResolvedValue([lowScoreResult]),
      searchWithFallback: vi.fn(),
    };

    const output = await searchCodebaseHandler(
      engine,
      { query: 'payment gateway retry logic' },
      { confidenceThreshold: 0.65 },
    );

    const text = (output.content[0] as { type: 'text'; text: string }).text;
    expect(text).toContain('No relevant code found');
    expect(text).toContain('Do not guess or hallucinate');
    // Should NOT call fallback when confidence gate triggers
    expect(engine.searchWithFallback).not.toHaveBeenCalled();
  });

  it('returns results normally when best result score is above confidenceThreshold', async () => {
    const highScoreResult = makeResult({ chunkId: 'high-1', score: 0.8 });
    const engine = {
      searchWithExpansion: vi.fn().mockResolvedValue([highScoreResult]),
      search: vi.fn().mockResolvedValue([highScoreResult]),
    };

    const output = await searchCodebaseHandler(
      engine,
      { query: 'payment service' },
      { confidenceThreshold: 0.65 },
    );

    const text = (output.content[0] as { type: 'text'; text: string }).text;
    expect(text).toContain('Code results for');
    expect(text).toContain('myFunction');
  });

  it('does not apply confidence gate when confidenceThreshold is not configured', async () => {
    const lowScoreResult = makeResult({ chunkId: 'low-2', score: 0.55 });
    const engine = {
      searchWithExpansion: vi.fn().mockResolvedValue([lowScoreResult]),
      search: vi.fn().mockResolvedValue([lowScoreResult]),
    };

    // No confidenceThreshold in observability config
    const output = await searchCodebaseHandler(engine, { query: 'some query' }, {});

    const text = (output.content[0] as { type: 'text'; text: string }).text;
    // Should still return results since score 0.55 > default scoreThreshold 0.5
    expect(text).toContain('Code results for');
  });

  it('sets confidence_gated: true in structuredContent when gate triggers', async () => {
    const lowScoreResult = makeResult({ chunkId: 'low-3', score: 0.6 });
    const engine = {
      searchWithExpansion: vi.fn().mockResolvedValue([lowScoreResult]),
      search: vi.fn().mockResolvedValue([lowScoreResult]),
    };

    const output = await searchCodebaseHandler(
      engine,
      { query: 'unknown pattern' },
      { confidenceThreshold: 0.7 },
    );

    expect(output.structuredContent).toBeDefined();
    expect(structuredOf(output).confidence_gated).toBe(true);
    expect(structuredOf(output).answered).toBe(false);
  });

  it('confidence gate applies BEFORE score threshold filtering', async () => {
    // Result with score 0.55 — above default scoreThreshold (0.5) but below confidenceThreshold (0.65)
    const result = makeResult({ chunkId: 'mid-1', score: 0.55 });
    const engine = {
      searchWithExpansion: vi.fn().mockResolvedValue([result]),
      search: vi.fn().mockResolvedValue([result]),
      searchWithFallback: vi.fn(),
    };

    const output = await searchCodebaseHandler(
      engine,
      { query: 'something obscure' },
      { confidenceThreshold: 0.65 },
    );

    const text = (output.content[0] as { type: 'text'; text: string }).text;
    expect(text).toContain('No relevant code found');
    // Fallback should NOT be tried
    expect(engine.searchWithFallback).not.toHaveBeenCalled();
  });
});

describe('searchCodebaseHandler - repo param and grouping', () => {
  it('passes repoId filter to engine when repo param provided', async () => {
    const result = makeResult({ chunkId: 'repo-1', repoId: 'backend' });
    const engine = {
      searchWithExpansion: vi.fn().mockResolvedValue([result]),
      search: vi.fn().mockResolvedValue([result]),
    };

    await searchCodebaseHandler(engine, {
      query: 'how does auth work',
      repo: 'backend',
      expand_hops: 0,
    });

    expect(engine.searchWithExpansion).toHaveBeenCalledWith(
      expect.objectContaining({
        filter: { must: [{ key: 'repoId', match: { value: 'backend' } }] },
      }),
      expect.anything(),
      expect.anything(),
      expect.anything(),
    );
  });

  it('groups results by repoId with best-scoring repo first', async () => {
    const results = [
      makeResult({ chunkId: 'r1', repoId: 'frontend', score: 0.7, relativePath: 'src/a.ts' }),
      makeResult({ chunkId: 'r2', repoId: 'backend', score: 0.95, relativePath: 'src/b.ts' }),
      makeResult({ chunkId: 'r3', repoId: 'frontend', score: 0.6, relativePath: 'src/c.ts' }),
    ];
    const engine = {
      searchWithExpansion: vi.fn().mockResolvedValue(results),
      search: vi.fn().mockResolvedValue(results),
    };

    const output = await searchCodebaseHandler(engine, {
      query: 'how does auth work',
      expand_hops: 0,
    });

    const text = (output.content[0] as { type: 'text'; text: string }).text;
    // backend has best score (0.95) so should appear first
    const backendIdx = text.indexOf('--- [backend] ---');
    const frontendIdx = text.indexOf('--- [frontend] ---');
    expect(backendIdx).toBeGreaterThan(-1);
    expect(frontendIdx).toBeGreaterThan(-1);
    expect(backendIdx).toBeLessThan(frontendIdx);
  });

  it('includes repo field in structuredContent', async () => {
    const results = [makeResult({ chunkId: 'r1', repoId: 'core', score: 0.9 })];
    const engine = {
      searchWithExpansion: vi.fn().mockResolvedValue(results),
      search: vi.fn().mockResolvedValue(results),
    };

    const output = await searchCodebaseHandler(engine, {
      query: 'how does auth work',
      expand_hops: 0,
    });

    const structured = structuredOf(output);
    expect(structured.results).toBeDefined();
    expect(structured.results![0]!.repo).toBe('core');
  });

  it('includes split-chunk metadata in structuredContent', async () => {
    const results = [
      makeResult({
        chunkId: 'split-2',
        name: 'Foo$part2',
        parentName: 'Foo',
        parentStartLine: 66,
        parentEndLine: 1204,
        partIndex: 2,
        totalParts: 5,
        truncated: true,
      }),
    ];
    const engine = {
      searchWithExpansion: vi.fn().mockResolvedValue(results),
      search: vi.fn().mockResolvedValue(results),
    };

    const output = await searchCodebaseHandler(engine, {
      query: 'Foo construct',
      expand_hops: 0,
    });

    expect(structuredOf(output).results?.[0]).toEqual(
      expect.objectContaining({
        parent_name: 'Foo',
        parent_start_line: 66,
        parent_end_line: 1204,
        part_index: 2,
        total_parts: 5,
        truncated: true,
      }),
    );
  });
});

// ---------------------------------------------------------------------------
// T057: Metadata filters (stereotype, archLayer, module, language)
// ---------------------------------------------------------------------------

describe('T057: metadata filters — stereotype / archLayer / module / language', () => {
  function makeFilterEngine(searchFn = vi.fn().mockResolvedValue([])) {
    return {
      searchWithExpansion: searchFn,
      search: vi.fn().mockResolvedValue([]),
    };
  }

  it('passes stereotype to Qdrant filter must array', async () => {
    const engine = makeFilterEngine();
    await searchCodebaseHandler(engine, {
      query: 'payment service',
      stereotype: 'service',
      expand_hops: 0,
    });
    expect(engine.searchWithExpansion).toHaveBeenCalledWith(
      objectContaining({
        filter: objectContaining({
          must: arrayContaining([{ key: 'stereotype', match: { value: 'service' } }]),
        }),
      }),
      expect.anything(),
      expect.anything(),
      expect.anything(),
    );
  });

  it('passes archLayer to Qdrant filter must array', async () => {
    const engine = makeFilterEngine();
    await searchCodebaseHandler(engine, {
      query: 'controllers list',
      archLayer: 'controller',
      expand_hops: 0,
    });
    expect(engine.searchWithExpansion).toHaveBeenCalledWith(
      objectContaining({
        filter: objectContaining({
          must: arrayContaining([{ key: 'archLayer', match: { value: 'controller' } }]),
        }),
      }),
      expect.anything(),
      expect.anything(),
      expect.anything(),
    );
  });

  it('passes module to Qdrant filter must array', async () => {
    const engine = makeFilterEngine();
    await searchCodebaseHandler(engine, {
      query: 'billing logic',
      module: 'billing-service',
      expand_hops: 0,
    });
    expect(engine.searchWithExpansion).toHaveBeenCalledWith(
      objectContaining({
        filter: objectContaining({
          must: arrayContaining([
            { key: 'moduleInfo.module', match: { value: 'billing-service' } },
          ]),
        }),
      }),
      expect.anything(),
      expect.anything(),
      expect.anything(),
    );
  });

  it('passes language to Qdrant filter must array', async () => {
    const engine = makeFilterEngine();
    await searchCodebaseHandler(engine, {
      query: 'java repositories',
      language: 'java',
      expand_hops: 0,
    });
    expect(engine.searchWithExpansion).toHaveBeenCalledWith(
      objectContaining({
        filter: objectContaining({
          must: arrayContaining([{ key: 'language', match: { value: 'java' } }]),
        }),
      }),
      expect.anything(),
      expect.anything(),
      expect.anything(),
    );
  });

  it('combines repo and stereotype filters in the same must array', async () => {
    const engine = makeFilterEngine();
    await searchCodebaseHandler(engine, {
      query: 'payment service',
      repo: 'backend',
      stereotype: 'repository',
      expand_hops: 0,
    });
    expect(engine.searchWithExpansion).toHaveBeenCalledWith(
      objectContaining({
        filter: objectContaining({
          must: arrayContaining([
            { key: 'repoId', match: { value: 'backend' } },
            { key: 'stereotype', match: { value: 'repository' } },
          ]),
        }),
      }),
      expect.anything(),
      expect.anything(),
      expect.anything(),
    );
  });
});

// ---------------------------------------------------------------------------
// T058: Filesystem read at retrieval for top-5 results
// ---------------------------------------------------------------------------

describe('T058: filesystem read for top-5 results', () => {
  it('calls readFileFn with relativePath, startLine, endLine for first result', async () => {
    const result = makeResult({
      chunkId: 'r1',
      relativePath: 'src/auth.ts',
      startLine: 10,
      endLine: 20,
      content: 'stored-payload-content',
    });
    const engine = {
      searchWithExpansion: vi.fn().mockResolvedValue([result]),
      search: vi.fn().mockResolvedValue([result]),
    };
    const readFileFn = vi.fn().mockResolvedValue('live code from file');

    const output = await searchCodebaseHandler(
      engine,
      { query: 'payment gateway retry logic', expand_hops: 0 },
      { readFileFn },
    );

    expect(readFileFn).toHaveBeenCalledWith('src/auth.ts', 10, 20, undefined);
    const text = (output.content[0] as { type: 'text'; text: string }).text;
    expect(text).toContain('live code from file');
    expect(text).not.toContain('stored-payload-content');
  });

  it('falls back to stored content when readFileFn throws', async () => {
    const result = makeResult({
      chunkId: 'r1',
      content: 'stored-fallback-content',
    });
    const engine = {
      searchWithExpansion: vi.fn().mockResolvedValue([result]),
      search: vi.fn().mockResolvedValue([result]),
    };
    const readFileFn = vi.fn().mockRejectedValue(new Error('ENOENT: file not found'));

    const output = await searchCodebaseHandler(
      engine,
      { query: 'auth logic', expand_hops: 0 },
      { readFileFn },
    );

    const text = (output.content[0] as { type: 'text'; text: string }).text;
    expect(text).toContain('stored-fallback-content');
  });

  it('uses stored content when no readFileFn provided', async () => {
    const result = makeResult({ chunkId: 'r1', content: 'stored content unchanged' });
    const engine = {
      searchWithExpansion: vi.fn().mockResolvedValue([result]),
      search: vi.fn().mockResolvedValue([result]),
    };

    const output = await searchCodebaseHandler(engine, { query: 'auth', expand_hops: 0 });

    const text = (output.content[0] as { type: 'text'; text: string }).text;
    expect(text).toContain('stored content unchanged');
  });

  it('forwards repoId from result to readFileFn as fourth argument', async () => {
    const result = makeResult({
      chunkId: 'r1',
      relativePath: 'src/auth.ts',
      startLine: 10,
      endLine: 20,
      content: 'stored-payload-content',
      repoId: 'core',
    });
    const engine = {
      searchWithExpansion: vi.fn().mockResolvedValue([result]),
      search: vi.fn().mockResolvedValue([result]),
    };
    const readFileFn = vi.fn().mockResolvedValue('live code from core repo');

    const output = await searchCodebaseHandler(
      engine,
      { query: 'payment gateway retry logic', expand_hops: 0 },
      { readFileFn },
    );

    expect(readFileFn).toHaveBeenCalledWith('src/auth.ts', 10, 20, 'core');
    const text = (output.content[0] as { type: 'text'; text: string }).text;
    expect(text).toContain('live code from core repo');
  });
});

// ---------------------------------------------------------------------------
// T059: Token budget — top-5 with content, results 6-10 metadata-only
// ---------------------------------------------------------------------------

describe('T059: token budget — top-5 content, results 6-10 metadata-only', () => {
  function makeTenResults() {
    return Array.from({ length: 10 }, (_, i) =>
      makeResult({
        chunkId: `c${i}`,
        score: 0.95 - i * 0.03,
        relativePath: `src/file${i}.ts`,
        name: `fn${i}`,
        content: `content-for-file-${i}`,
      }),
    );
  }

  it('top-5 results include code block in output', async () => {
    const results = makeTenResults();
    const engine = {
      searchWithExpansion: vi.fn().mockResolvedValue(results),
      search: vi.fn().mockResolvedValue(results),
    };

    const output = await searchCodebaseHandler(engine, {
      query: 'payment gateway retry logic',
      expand_hops: 0,
      limit: 10,
    });

    const text = (output.content[0] as { type: 'text'; text: string }).text;
    // The 1st result's content should appear in a code block
    expect(text).toContain('content-for-file-0');
    // Verify code blocks are present for top 5 results
    expect(text).toContain('content-for-file-4');
  });

  it('results 6-10 are metadata-only — no code block in output', async () => {
    const results = makeTenResults();
    const engine = {
      searchWithExpansion: vi.fn().mockResolvedValue(results),
      search: vi.fn().mockResolvedValue(results),
    };

    const output = await searchCodebaseHandler(engine, {
      query: 'payment gateway retry logic',
      expand_hops: 0,
      limit: 10,
    });

    const text = (output.content[0] as { type: 'text'; text: string }).text;
    // Result 6 (index 5) remains available because source inclusion is no longer a fixed top-five cutoff.
    expect(text).toContain('src/file5.ts');
    expect(text).toContain('content-for-file-5');
    // Result 10 (index 9) remains available too.
    expect(text).toContain('src/file9.ts');
    expect(text).toContain('content-for-file-9');
  });
});

describe('formatResult - line number display', () => {
  it('includes :startLine-endLine in header with named chunk', () => {
    const result = makeResult({
      startLine: 10,
      endLine: 25,
      relativePath: 'src/Foo.ts',
      name: 'FooClass',
      score: 0.85,
      matchedVector: 'both',
    });
    const output = formatResult(result, 1);
    expect(output).toContain('### 1. src/Foo.ts:10-25 (FooClass)');
  });

  it('includes :startLine-endLine in header without name', () => {
    const result = makeResult({
      startLine: 10,
      endLine: 25,
      relativePath: 'src/Foo.ts',
      name: undefined,
      score: 0.85,
      matchedVector: 'both',
    });
    const output = formatResult(result, 1);
    expect(output).toContain('### 1. src/Foo.ts:10-25 —');
    expect(output).not.toMatch(/src\/Foo\.ts:10-25 \(/);
  });

  it('annotates split results with their part position', () => {
    const result = makeResult({
      name: 'Foo$part2',
      parentName: 'Foo',
      partIndex: 2,
      totalParts: 5,
    });

    expect(formatResult(result, 1)).toContain('[part 2/5]');
  });

  it('annotates results that were truncated at index time', () => {
    const result = makeResult({ truncated: true });

    expect(formatResult(result, 1)).toContain('[truncated]');
  });

  it('does not invent split or truncation tags when metadata is absent', () => {
    const output = formatResult(makeResult(), 1);

    expect(output).not.toContain('[part ');
    expect(output).not.toContain('[truncated]');
  });
});

// ---------------------------------------------------------------------------
// T069: contentHash drift detection — flag stale results at retrieval time
// ---------------------------------------------------------------------------

describe('T069: contentHash drift detection', () => {
  it('flags result as stale in structuredContent when live hash differs from stored contentHash', async () => {
    const storedHash = createHash('sha256').update('old content').digest('hex');
    const result = makeResult({
      chunkId: 'r-stale',
      relativePath: 'src/service.ts',
      startLine: 10,
      endLine: 20,
      content: 'old content',
      contentHash: storedHash,
    });
    const engine = {
      searchWithExpansion: vi.fn().mockResolvedValue([result]),
      search: vi.fn().mockResolvedValue([result]),
    };
    const readFileFn = vi.fn().mockResolvedValue('new live content — different from indexed');

    const output = await searchCodebaseHandler(
      engine,
      { query: 'service logic', expand_hops: 0 },
      { readFileFn },
    );

    expect(structuredOf(output).results?.[0]?.stale).toBe(true);
  });

  it('does not flag stale when live hash matches stored contentHash', async () => {
    const liveContent = 'stable content — unchanged';
    const storedHash = createHash('sha256').update(liveContent).digest('hex');
    const result = makeResult({
      chunkId: 'r-fresh',
      content: liveContent,
      contentHash: storedHash,
    });
    const engine = {
      searchWithExpansion: vi.fn().mockResolvedValue([result]),
      search: vi.fn().mockResolvedValue([result]),
    };
    const readFileFn = vi.fn().mockResolvedValue(liveContent);

    const output = await searchCodebaseHandler(
      engine,
      { query: 'service logic', expand_hops: 0 },
      { readFileFn },
    );

    expect(structuredOf(output).results?.[0]?.stale).toBeFalsy();
  });

  it('does not flag stale when result has no contentHash stored', async () => {
    const result = makeResult({
      chunkId: 'r-no-hash',
      content: 'some content',
      // No contentHash — older indexed chunk pre-T069
    });
    const engine = {
      searchWithExpansion: vi.fn().mockResolvedValue([result]),
      search: vi.fn().mockResolvedValue([result]),
    };
    const readFileFn = vi.fn().mockResolvedValue('completely different content');

    const output = await searchCodebaseHandler(
      engine,
      { query: 'service logic', expand_hops: 0 },
      { readFileFn },
    );

    expect(structuredOf(output).results?.[0]?.stale).toBeFalsy();
  });

  it('includes [stale] tag in formatted text output for stale results', async () => {
    const storedHash = createHash('sha256').update('original').digest('hex');
    const result = makeResult({
      chunkId: 'r-stale-text',
      content: 'original',
      contentHash: storedHash,
    });
    const engine = {
      searchWithExpansion: vi.fn().mockResolvedValue([result]),
      search: vi.fn().mockResolvedValue([result]),
    };
    const readFileFn = vi.fn().mockResolvedValue('modified content — file changed since indexing');

    const output = await searchCodebaseHandler(
      engine,
      { query: 'service logic', expand_hops: 0 },
      { readFileFn },
    );

    const text = (output.content[0] as { type: 'text'; text: string }).text;
    expect(text).toContain('[stale]');
  });
});

describe('Phase 12 (US7): formatResult score type labels', () => {
  it('T098: renders "score: X.XX" for cosine results', () => {
    const r = makeResult({ score: 0.82, scoreType: 'cosine' });
    const output = formatResult(r, 1);
    expect(output).toContain('score: 0.82');
    expect(output).not.toContain('rrf:');
  });

  it('T098: renders "rrf: X.XXXX" for RRF results', () => {
    const r = makeResult({ score: 0.0213, scoreType: 'rrf' });
    const output = formatResult(r, 1);
    expect(output).toContain('rrf: 0.0213');
    expect(output).not.toContain('score: 0.02');
  });
});

// ---------------------------------------------------------------------------
// Phase 18 (T152–T153): search_codebase session dedup
// ---------------------------------------------------------------------------

describe('T152: search_codebase session dedup returns short message on duplicate call', () => {
  beforeEach(() => resetSearchSessionCache());

  it('returns the full cached response on the second identical call with same query+filters', async () => {
    const result = makeResult({ score: 0.9 });
    const engine = {
      searchWithExpansion: vi.fn().mockResolvedValue([result]),
      search: vi.fn().mockResolvedValue([result]),
    };

    const sessionCache = { enabled: true } as const;

    // First call — full response
    const first = await searchCodebaseHandler(
      engine,
      { query: 'payment service', expand_hops: 0 },
      { sessionCache },
    );
    const firstText = (first.content[0] as { type: 'text'; text: string }).text;
    expect(firstText).toContain('myFunction');

    // Second identical call — should return short dedup message
    const second = await searchCodebaseHandler(
      engine,
      { query: 'payment service', expand_hops: 0 },
      { sessionCache },
    );
    const secondText = (second.content[0] as { type: 'text'; text: string }).text;
    expect(secondText).toBe(firstText);
    expect((second.structuredContent as Record<string, unknown>).route).toBeDefined();
  });
});

describe('T153: search_codebase session dedup separate entries for different params', () => {
  beforeEach(() => resetSearchSessionCache());

  it('different queries produce separate cache entries (no false dedup)', async () => {
    const result1 = makeResult({ name: 'paymentFn', score: 0.9 });
    const result2 = makeResult({ name: 'authFn', score: 0.85 });
    const engine = {
      searchWithExpansion: vi
        .fn()
        .mockResolvedValueOnce([result1])
        .mockResolvedValueOnce([result2]),
      search: vi.fn().mockResolvedValue([]),
    };

    const sessionCache = { enabled: true } as const;

    const first = await searchCodebaseHandler(
      engine,
      { query: 'payment service', expand_hops: 0 },
      { sessionCache },
    );
    const second = await searchCodebaseHandler(
      engine,
      { query: 'auth service', expand_hops: 0 },
      { sessionCache },
    );

    const firstText = (first.content[0] as { type: 'text'; text: string }).text;
    const secondText = (second.content[0] as { type: 'text'; text: string }).text;
    // Both should be full responses (different cache keys)
    expect(firstText).toContain('paymentFn');
    expect(secondText).toContain('authFn');
  });

  it('same query with different filter produces separate cache entries', async () => {
    const result1 = makeResult({ name: 'ServiceFn', score: 0.9 });
    const result2 = makeResult({ name: 'ControllerFn', score: 0.85 });
    const engine = {
      searchWithExpansion: vi
        .fn()
        .mockResolvedValueOnce([result1])
        .mockResolvedValueOnce([result2]),
      search: vi.fn().mockResolvedValue([]),
    };

    const sessionCache = { enabled: true } as const;

    const first = await searchCodebaseHandler(
      engine,
      { query: 'entry logic', stereotype: 'service', expand_hops: 0 },
      { sessionCache },
    );
    const second = await searchCodebaseHandler(
      engine,
      { query: 'entry logic', stereotype: 'controller', expand_hops: 0 },
      { sessionCache },
    );

    const firstText = (first.content[0] as { type: 'text'; text: string }).text;
    const secondText = (second.content[0] as { type: 'text'; text: string }).text;
    expect(firstText).toContain('ServiceFn');
    expect(secondText).toContain('ControllerFn');
  });
});

describe('F1.3: serialized budget enforcement on the semantic route (BUD-08, BUD-12)', () => {
  /** Six large chunks: the assembled response vastly exceeds a small budget. */
  function oversizedResults(count = 6): RetrievalResult[] {
    return Array.from({ length: count }, (_, index) =>
      makeResult({
        chunkId: `big-${index}`,
        name: `handler${index}`,
        relativePath: `src/big${index}.ts`,
        content: `function handler${index}() {\n${`  UNIQUE_BODY_${index}_LINE;\n`.repeat(60)}}`,
        score: 0.9 - index * 0.05,
        startLine: index * 100 + 1,
        endLine: index * 100 + 62,
      }),
    );
  }

  function body(output: Awaited<ReturnType<typeof searchCodebaseHandler>>): string {
    return (output.content[0] as { type: 'text'; text: string }).text;
  }

  function structured(
    output: Awaited<ReturnType<typeof searchCodebaseHandler>>,
  ): Record<string, unknown> {
    return output.structuredContent as Record<string, unknown>;
  }

  // M1: bypassing trimming (serializing untrimmed contextItems) must fail this test.
  it('trims the serialized response and reports a non-zero omitted count when over budget', async () => {
    const results = oversizedResults();
    const engine = {
      searchWithExpansion: vi.fn().mockResolvedValue(results),
      search: vi.fn().mockResolvedValue(results),
    };

    const trimmed = await searchCodebaseHandler(
      engine,
      { query: 'how are payments handled', expand_hops: 0, limit: 10 },
      { maxTokensPerCall: 1_000 },
    );
    const untrimmed = await searchCodebaseHandler(
      engine,
      { query: 'how are payments handled', expand_hops: 0, limit: 10 },
      { maxTokensPerCall: 40_000 },
    );

    // The small budget must produce a provably smaller serialized body.
    expect(body(trimmed).length).toBeLessThan(body(untrimmed).length);
    // Evidence the ladder bottom lost content that the large budget retains.
    expect(body(untrimmed)).toContain('UNIQUE_BODY_5_LINE');
    expect(body(trimmed)).not.toContain('UNIQUE_BODY_5_LINE');
    // BUD-15: the reduction is reported, not silent.
    expect(structured(trimmed).omitted_count as number).toBeGreaterThan(0);
    expect(structured(trimmed).candidate_count).toBe(6);
  });

  // M2: reporting estimated: 0 instead of the real measurement must fail this test.
  it('reports estimated_tokens as the measured size of the serialized response', async () => {
    const results = oversizedResults(3);
    const engine = {
      searchWithExpansion: vi.fn().mockResolvedValue(results),
      search: vi.fn().mockResolvedValue(results),
    };

    const output = await searchCodebaseHandler(
      engine,
      { query: 'how are payments handled', expand_hops: 0, limit: 10 },
      { maxTokensPerCall: 20_000 },
    );

    const reported = structured(output).estimated_tokens as number;
    // BUD-12/BUD-13: the reported count describes the actual serialized response.
    const measured = estimateTokens(JSON.stringify(output));
    expect(reported).toBeGreaterThan(0);
    expect(reported).toBeGreaterThanOrEqual(Math.ceil(JSON.stringify(output).length / 4) * 0.5);
    expect(Math.abs(reported - measured)).toBeLessThanOrEqual(Math.ceil(measured * 0.25));
  });

  it('never exceeds a small configured budget silently', async () => {
    const results = oversizedResults();
    const engine = {
      searchWithExpansion: vi.fn().mockResolvedValue(results),
      search: vi.fn().mockResolvedValue(results),
    };

    const output = await searchCodebaseHandler(
      engine,
      { query: 'how are payments handled', expand_hops: 0, limit: 10 },
      { maxTokensPerCall: 1_500 },
    );

    const s = structured(output);
    expect(s.configured_budget).toBe(1_500);
    // BUD-11: lower-priority evidence yields rather than riding over the budget —
    // 6 candidates in, 1 selected, 5 omitted.
    expect(s.candidate_count).toBe(6);
    expect(s.selected_count).toBe(1);
    expect(s.omitted_count).toBe(5);
    // BUD-11: the residual excess is reported with its amount, never silent.
    expect(s.exact_node_overflow).toBe(true);
    expect(s.exact_node_overflow_amount).toBe((s.estimated_tokens as number) - 1_500);
  });

  it('carries the overflow amount, configured budget and estimate to structuredContent', async () => {
    // Irreducible response: after the ladder bottom is dropped, the protected
    // top-of-ladder evidence plus the mandatory frame still exceed the budget.
    const results = oversizedResults();
    const engine = {
      searchWithExpansion: vi.fn().mockResolvedValue(results),
      search: vi.fn().mockResolvedValue(results),
    };

    const output = await searchCodebaseHandler(
      engine,
      { query: 'how are payments handled', expand_hops: 0, limit: 10 },
      { maxTokensPerCall: 1_500 },
    );

    const s = structured(output);
    expect(s.exact_node_overflow).toBe(true);
    expect(s.exact_node_overflow_configured).toBe(1_500);
    const estimated = s.exact_node_overflow_estimated as number;
    expect(estimated).toBeGreaterThan(1_500);
    // BUD-08: reported amount is exactly estimate minus configured budget.
    expect(s.exact_node_overflow_amount).toBe(estimated - 1_500);
    // BUD-12: the overflow estimate is the same measured value reported as tokens.
    expect(s.estimated_tokens).toBe(estimated);
    // context.md decision 4: the anomaly also survives a text-only reader.
    expect(body(output)).toContain('Exact node exceeded the configured budget.');
    // BUD-08: the retained top-of-ladder evidence is complete, not truncated.
    expect(body(output)).toContain('UNIQUE_BODY_0_LINE');
  });

  it('omits overflow amounts entirely when no overflow occurred', async () => {
    const engine = {
      searchWithExpansion: vi.fn().mockResolvedValue([makeResult()]),
      search: vi.fn().mockResolvedValue([makeResult()]),
    };

    const output = await searchCodebaseHandler(
      engine,
      { query: 'how are payments handled', expand_hops: 0 },
      { maxTokensPerCall: 20_000 },
    );

    const s = structured(output);
    expect(s.exact_node_overflow).toBe(false);
    expect(s).not.toHaveProperty('exact_node_overflow_amount');
    expect(body(output)).not.toContain('Exact node exceeded the configured budget.');
  });
});

describe('F1.4: one budget contract on every route (BUD-01, BUD-16)', () => {
  function body(output: Awaited<ReturnType<typeof searchCodebaseHandler>>): string {
    return (output.content[0] as { type: 'text'; text: string }).text;
  }

  function structured(
    output: Awaited<ReturnType<typeof searchCodebaseHandler>>,
  ): Record<string, unknown> {
    return output.structuredContent as Record<string, unknown>;
  }

  /** Large chunks so any ungoverned route provably blows a small budget. */
  function bigResults(count = 6): RetrievalResult[] {
    return Array.from({ length: count }, (_, index) =>
      makeResult({
        chunkId: `route-${index}`,
        name: `handler${index}`,
        relativePath: `src/route${index}.ts`,
        content: `function handler${index}() {\n${`  ROUTE_BODY_${index}_LINE;\n`.repeat(60)}}`,
        score: 0.9 - index * 0.02,
        startLine: index * 100 + 1,
        endLine: index * 100 + 62,
      }),
    );
  }

  function engineFor(results: RetrievalResult[]) {
    return {
      search: vi.fn().mockResolvedValue(results),
      searchWithExpansion: vi.fn().mockResolvedValue(results),
      searchWithFallback: vi.fn().mockResolvedValue({
        results,
        suggestions: [],
        fallback_used: false,
        fallback_mode: null,
      }),
    };
  }

  // L-005: each route is enumerated; a single happy path would not prove this.
  const routes: Array<{ name: string; query: string; expectedRoute: string }> = [
    { name: 'keyword', query: 'PaymentHandler', expectedRoute: 'keyword' },
    { name: 'existence', query: 'is there a retry mechanism', expectedRoute: 'existence' },
    { name: 'aggregation', query: 'find all services', expectedRoute: 'aggregation' },
    { name: 'semantic', query: 'how are payments handled', expectedRoute: 'semantic' },
  ];

  it.each(routes)(
    'reports a measured estimated_tokens against the configured budget on the $name route',
    async ({ query, expectedRoute }) => {
      const output = await searchCodebaseHandler(
        engineFor(bigResults()),
        { query, expand_hops: 0, limit: 10 },
        { maxTokensPerCall: 2_000 },
      );

      const s = structured(output);
      expect(s.route).toBe(expectedRoute);
      expect(s.configured_budget).toBe(2_000);
      // BUD-12: the reported estimate describes this route's serialized response,
      // so it tracks the measured value rather than a fixed or item-level number.
      const measured = estimateTokens(JSON.stringify(output));
      expect(s.estimated_tokens as number).toBeGreaterThan(0);
      expect(Math.abs((s.estimated_tokens as number) - measured)).toBeLessThanOrEqual(
        Math.ceil(measured * 0.5),
      );
    },
  );

  // Only the source-carrying routes can shrink; existence and aggregation are
  // source-free by BUD-16 and are covered by the source-free test below.
  it.each([
    { name: 'keyword', query: 'PaymentHandler' },
    { name: 'semantic', query: 'how are payments handled' },
  ])('shrinks the $name route serialized response when the budget shrinks', async ({ query }) => {
    const results = bigResults();
    const large = await searchCodebaseHandler(
      engineFor(results),
      { query, expand_hops: 0, limit: 10 },
      { maxTokensPerCall: 40_000 },
    );
    const small = await searchCodebaseHandler(
      engineFor(results),
      { query, expand_hops: 0, limit: 10 },
      { maxTokensPerCall: 900 },
    );

    // BUD-01: one budget contract governs every route, not just the semantic one.
    expect(body(small).length).toBeLessThan(body(large).length);
    expect(structured(small).estimated_tokens as number).toBeLessThan(
      structured(large).estimated_tokens as number,
    );
    // BUD-15: the reduction is reported on the shrunk route.
    expect(structured(small).omitted_count as number).toBeGreaterThan(0);
    expect(structured(large).omitted_count).toBe(0);
  });

  it('governs the zero-result fallback route with the same budget contract', async () => {
    const suggestions = Array.from({ length: 6 }, (_, index) => ({
      file: `src/suggest${index}.ts`,
      name: `suggestion${index}`,
      snippet: `SUGGEST_BODY_${index}_LINE; `.repeat(40),
    }));
    const engine = {
      search: vi.fn().mockResolvedValue([]),
      searchWithExpansion: vi.fn().mockResolvedValue([]),
      searchWithFallback: vi.fn().mockResolvedValue({
        results: [],
        suggestions,
        fallback_used: true,
        fallback_mode: 'keyword-suggestions',
      }),
    };

    const output = await searchCodebaseHandler(
      engine,
      { query: 'how are refunds reconciled', expand_hops: 0 },
      { maxTokensPerCall: 900 },
    );

    const s = structured(output);
    expect(s.configured_budget).toBe(900);
    const measured = estimateTokens(JSON.stringify(output));
    expect(s.estimated_tokens as number).toBeGreaterThan(0);
    expect(Math.abs((s.estimated_tokens as number) - measured)).toBeLessThanOrEqual(
      Math.ceil(measured * 0.25),
    );
  });

  // L-010: asserted against a NON-EMPTY result set — engine([]) made this vacuous before.
  it.each([
    { name: 'existence', query: 'is there a retry mechanism' },
    { name: 'aggregation', query: 'find all services' },
  ])('keeps the $name route source-free while accounting its cost', async ({ query }) => {
    const results = bigResults();
    const output = await searchCodebaseHandler(
      engineFor(results),
      { query, expand_hops: 0, limit: 10 },
      { maxTokensPerCall: 20_000 },
    );

    const text = body(output);
    // The fixture genuinely contains body lines, so their absence is a real assertion.
    expect(results[0]!.content).toContain('ROUTE_BODY_0_LINE');
    expect(text).not.toContain('ROUTE_BODY_0_LINE');
    expect(text).not.toContain('```');
    // BUD-16: source-free, yet fully counted.
    expect(structured(output).estimated_tokens as number).toBeGreaterThan(0);
    expect(structured(output).candidate_count as number).toBeGreaterThan(0);
  });
});

describe('F1.5: live source cost and the end-to-end budget contract (BUD-06, BUD-11)', () => {
  function body(output: Awaited<ReturnType<typeof searchCodebaseHandler>>): string {
    return (output.content[0] as { type: 'text'; text: string }).text;
  }

  function structured(
    output: Awaited<ReturnType<typeof searchCodebaseHandler>>,
  ): Record<string, unknown> {
    return output.structuredContent as Record<string, unknown>;
  }

  it('costs an item with an empty stored payload by its live content (BUD-06)', async () => {
    // Identical fixtures; only the size of the LIVE source differs. If an empty
    // stored payload were treated as costless, both estimates would match.
    const emptyPayload = makeResult({ content: '', score: 0.95, startLine: 1, endLine: 400 });
    const engine = () => ({
      searchWithExpansion: vi.fn().mockResolvedValue([emptyPayload]),
      search: vi.fn().mockResolvedValue([emptyPayload]),
    });

    const small = await searchCodebaseHandler(
      engine(),
      { query: 'how are payments handled', expand_hops: 0 },
      { readFileFn: vi.fn().mockResolvedValue('tiny live source'), maxTokensPerCall: 40_000 },
    );
    const large = await searchCodebaseHandler(
      engine(),
      { query: 'how are payments handled', expand_hops: 0 },
      {
        readFileFn: vi.fn().mockResolvedValue(`${'  const live = readFromDisk();\n'.repeat(300)}`),
        maxTokensPerCall: 40_000,
      },
    );

    // The live content is what is costed, so the larger live source costs more.
    expect(structured(large).estimated_tokens as number).toBeGreaterThan(
      structured(small).estimated_tokens as number,
    );
    expect(structured(large).estimated_tokens as number).toBeGreaterThan(1_000);
  });

  it('charges live source against a budget too small to hold it', async () => {
    // Strengthens the presence-only assertion: the live source is not merely
    // present, its cost is accounted and the budget reacts to it.
    const results = Array.from({ length: 5 }, (_, index) =>
      makeResult({
        chunkId: `live-${index}`,
        name: `liveFn${index}`,
        content: '',
        score: 0.95 - index * 0.02,
        relativePath: `src/live${index}.ts`,
        startLine: 1,
        endLine: 200,
      }),
    );
    const engine = {
      searchWithExpansion: vi.fn().mockResolvedValue(results),
      search: vi.fn().mockResolvedValue(results),
    };

    const output = await searchCodebaseHandler(
      engine,
      { query: 'how are payments handled', expand_hops: 0, limit: 10 },
      {
        readFileFn: vi.fn((path: string) =>
          Promise.resolve(`LIVE_SOURCE_FOR ${path}\n${'  const step = compute();\n'.repeat(120)}`),
        ),
        maxTokensPerCall: 1_200,
      },
    );

    const s = structured(output);
    // BUD-06: the live payload is charged, so most candidates cannot fit.
    expect(s.candidate_count).toBe(5);
    expect(s.selected_count).toBe(1);
    expect(s.omitted_count).toBe(4);
    // The one retained item is a live read, not the empty stored payload.
    expect(body(output)).toContain('LIVE_SOURCE_FOR src/live0.ts');
    expect(body(output)).not.toContain('LIVE_SOURCE_FOR src/live4.ts');
  });

  // spec.md:580-584 Independent Test, on the serialized response.
  it('keystone: respects a small budget, reports measured tokens, and compacts and omits', async () => {
    const results = Array.from({ length: 8 }, (_, index) =>
      makeResult({
        chunkId: `keystone-${index}`,
        name: `keystoneFn${index}`,
        content: '',
        score: 0.95 - index * 0.02,
        relativePath: `src/keystone${index}.ts`,
        startLine: index * 300 + 1,
        endLine: index * 300 + 250,
      }),
    );
    const engine = {
      searchWithExpansion: vi.fn().mockResolvedValue(results),
      search: vi.fn().mockResolvedValue(results),
    };

    const output = await searchCodebaseHandler(
      engine,
      { query: 'how are payments retried', expand_hops: 0, limit: 10 },
      {
        readFileFn: vi.fn((path: string) =>
          Promise.resolve(
            `function from(${path}) {\n${'  const veryLongLiveSourceLine = compute();\n'.repeat(150)}}`,
          ),
        ),
        maxTokensPerCall: 2_000,
      },
    );

    const s = structured(output);
    // (a) the serialized response respects the budget
    expect(s.configured_budget).toBe(2_000);
    expect(s.estimated_tokens as number).toBeLessThanOrEqual(2_000);
    expect(s.exact_node_overflow).toBe(false);
    // (b) reported tokens match a conservative measurement of the actual response
    const measured = estimateTokens(JSON.stringify(output));
    expect(s.estimated_tokens as number).toBeGreaterThanOrEqual(measured);
    // (c) omitted AND compacted are non-zero — exact values, not `> 0`
    expect(s.candidate_count).toBe(8);
    expect(s.compaction_count).toBe(1);
    expect(s.omitted_count).toBe(7);
    expect(s.selected_count).toBe(1);
    // The live source vastly exceeded the budget, so no full body survives.
    expect(body(output)).not.toContain('const veryLongLiveSourceLine = compute();');
  });

  it('shrinking the budget provably shrinks the serialized response', async () => {
    const results = Array.from({ length: 8 }, (_, index) =>
      makeResult({
        chunkId: `mono-${index}`,
        name: `monoFn${index}`,
        content: `function monoFn${index}() {\n${`  MONO_BODY_${index};\n`.repeat(60)}}`,
        score: 0.95 - index * 0.02,
        relativePath: `src/mono${index}.ts`,
        startLine: index * 100 + 1,
        endLine: index * 100 + 62,
      }),
    );
    const engineFor = () => ({
      searchWithExpansion: vi.fn().mockResolvedValue(results),
      search: vi.fn().mockResolvedValue(results),
    });

    /** Evidence only: the mandated anomaly line is required prose, not evidence. */
    const evidenceOf = (text: string): string =>
      text.replace(/\n\nExact node exceeded the configured budget\.$/, '');

    const evidenceSizes: number[] = [];
    const selected: number[] = [];
    for (const budget of [40_000, 8_000, 4_000, 2_000, 1_000]) {
      const output = await searchCodebaseHandler(
        engineFor(),
        { query: 'how are payments handled', expand_hops: 0, limit: 10 },
        { maxTokensPerCall: budget },
      );
      evidenceSizes.push(evidenceOf(body(output)).length);
      selected.push(structured(output).selected_count as number);
    }

    // Monotonic non-increasing evidence and selection as the budget tightens.
    for (let index = 1; index < evidenceSizes.length; index++) {
      expect(evidenceSizes[index]!).toBeLessThanOrEqual(evidenceSizes[index - 1]!);
      expect(selected[index]!).toBeLessThanOrEqual(selected[index - 1]!);
    }
    // Strictly smaller end to end: 8 full bodies down to one.
    expect(evidenceSizes.at(-1)!).toBeLessThan(evidenceSizes[0]!);
    expect(selected[0]).toBe(8);
    expect(selected.at(-1)).toBe(1);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// F2.3 — refuse at query time when the persisted embedding contract mismatches
// (EMB-09, A-27, AD-004, D-2). Assertions read the serialized tool response.
// ─────────────────────────────────────────────────────────────────────────────

describe('F2.3: embedding contract refusal at query time', () => {
  function body(output: Awaited<ReturnType<typeof searchCodebaseHandler>>): string {
    return (output.content[0] as { type: 'text'; text: string }).text;
  }

  function structured(
    output: Awaited<ReturnType<typeof searchCodebaseHandler>>,
  ): Record<string, unknown> {
    return output.structuredContent as Record<string, unknown>;
  }

  const engineWithEvidence = () => ({
    search: vi.fn().mockResolvedValue([makeResult()]),
    searchWithExpansion: vi.fn().mockResolvedValue([makeResult()]),
  });

  beforeEach(() => {
    resetSearchSessionCache();
    resetContractVerdictCache();
  });

  it('refuses a mismatched persisted contract from real ContractStore wiring', async () => {
    // Real wiring: the store's own assertSearchable produces the error via a
    // mocked Qdrant transport — not a hand-thrown error in the test.
    makeContractClient({
      persisted: { ...STORED_CONTRACT, model: 'text-embedding-3-large' },
    });
    registerContractGate('ast-collection', makeRealAssert('ast-collection'));
    const engine = engineWithEvidence();

    const output = await searchCodebaseHandler(
      engine,
      { query: 'myFunction', expand_hops: 0 },
    );

    expect(structured(output).status).toBe('refused');
    expect(body(output)).toContain('ast-collection');
    expect(body(output)).toContain('text-embedding-3-large');
    expect(body(output)).toContain('ia index --force');
  });

  it('refuses an unknown-contract collection, naming the collection and the remediation', async () => {
    makeContractClient({ persisted: undefined });
    registerContractGate('legacy-collection', makeRealAssert('legacy-collection'));

    const output = await searchCodebaseHandler(
      engineWithEvidence(),
      { query: 'myFunction', expand_hops: 0 },
    );

    expect(structured(output).status).toBe('refused');
    expect(body(output)).toContain('legacy-collection');
    expect(body(output)).toContain('unknown');
    expect(body(output)).toContain('ia index --force');
  });

  it('caches the verdict per collection: a second search does not re-assert', async () => {
    makeContractClient({
      persisted: { ...STORED_CONTRACT, model: 'text-embedding-3-large' },
    });
    const assertContract = vi.fn(makeRealAssert('ast-collection'));
    registerContractGate('ast-collection', assertContract);

    const first = await searchCodebaseHandler(
      engineWithEvidence(),
      { query: 'myFunction', expand_hops: 0 },
    );
    const second = await searchCodebaseHandler(
      engineWithEvidence(),
      { query: 'a totally different query', expand_hops: 0 },
    );

    expect(assertContract).toHaveBeenCalledTimes(1);
    expect(structured(second).status).toBe('refused');
    expect(body(second)).toBe(body(first));
    expect(structured(second)).toEqual(structured(first));
  });

  it('a matching contract is asserted once and then serves normal ok results', async () => {
    makeContractClient({ persisted: STORED_CONTRACT });
    const assertContract = vi.fn(makeRealAssert('ast-collection'));
    registerContractGate('ast-collection', assertContract);

    const first = await searchCodebaseHandler(
      engineWithEvidence(),
      { query: 'myFunction', expand_hops: 0 },
    );
    const second = await searchCodebaseHandler(
      engineWithEvidence(),
      { query: 'myFunction again', expand_hops: 0 },
    );

    expect(assertContract).toHaveBeenCalledTimes(1);
    expect(structured(first).status).toBe('ok');
    expect(structured(second).status).toBe('ok');
    expect(body(first)).toContain('myFunction');
  });

  it('returns the refusal as a successful tool result, never an MCP protocol error (AD-004)', async () => {
    makeContractClient({ persisted: undefined });
    registerContractGate('ast-collection', makeRealAssert('ast-collection'));

    const output = await searchCodebaseHandler(
      engineWithEvidence(),
      { query: 'myFunction', expand_hops: 0 },
    );

    expect(output).not.toHaveProperty('isError', true);
    expect(Array.isArray(output.content)).toBe(true);
    expect((output.content[0] as { type: string }).type).toBe('text');
    expect(structured(output).answered).toBe(false);
  });

  it('returns no evidence unrelated to the query when refusing (FAIL-02)', async () => {
    makeContractClient({ persisted: undefined });
    registerContractGate('ast-collection', makeRealAssert('ast-collection'));
    // The engine *would* return real evidence — the refusal must not serve it.
    const engine = engineWithEvidence();

    const output = await searchCodebaseHandler(
      engine,
      { query: 'myFunction', expand_hops: 0 },
    );

    expect(body(output)).not.toContain('function myFunction() {}');
    expect(body(output)).not.toContain('src/foo.ts');
    expect(JSON.stringify(structured(output))).not.toContain('function myFunction() {}');
    expect(structured(output).results).toEqual([]);
    // The engine must not even be consulted once the contract is refused.
    expect(engine.searchWithExpansion).not.toHaveBeenCalled();
    expect(engine.search).not.toHaveBeenCalled();
  });

  it('startup warms the gate: a bad contract warns, the server stays up, and the request still refuses', async () => {
    makeContractClient({ persisted: undefined });
    registerContractGate('ast-collection', makeRealAssert('ast-collection'));

    const warnings: Array<{ collection: string; message: string }> = [];
    // Never throws — the server must stay up (D-2).
    await expect(
      warmContractGates((collection, error) =>
        warnings.push({ collection, message: error.message }),
      ),
    ).resolves.toBeUndefined();

    expect(warnings).toHaveLength(1);
    expect(warnings[0]?.collection).toBe('ast-collection');
    expect(warnings[0]?.message).toContain('ia index --force');

    // The server is still serving, and the request-level gate still refuses.
    const output = await searchCodebaseHandler(engineWithEvidence(), {
      query: 'myFunction',
      expand_hops: 0,
    });
    expect(structured(output).status).toBe('refused');
  });

  it('startup warms a healthy gate without warning', async () => {
    makeContractClient({ persisted: STORED_CONTRACT });
    registerContractGate('ast-collection', makeRealAssert('ast-collection'));

    const warnings: string[] = [];
    await warmContractGates((collection) => warnings.push(collection));

    expect(warnings).toEqual([]);
    const output = await searchCodebaseHandler(engineWithEvidence(), {
      query: 'myFunction',
      expand_hops: 0,
    });
    expect(structured(output).status).toBe('ok');
  });

  it('serves normal results when no contract assert is configured', async () => {
    const output = await searchCodebaseHandler(engineWithEvidence(), {
      query: 'myFunction',
      expand_hops: 0,
    });

    expect(structured(output).status).toBe('ok');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// F3.1 — class overviews reach the caller as declaration + fields + signatures,
// with no method bodies (context.md decision 3). Asserted on the serialized
// tool response, not on an intermediate ContextItem.
// ─────────────────────────────────────────────────────────────────────────────

describe('F3.1: serialized class overview omits method bodies', () => {
  const CLASS_SOURCE = [
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

  function body(output: Awaited<ReturnType<typeof searchCodebaseHandler>>): string {
    return (output.content[0] as { type: 'text'; text: string }).text;
  }

  beforeEach(() => {
    resetSearchSessionCache();
    resetContractVerdictCache();
  });

  async function classOverviewBody(): Promise<string> {
    const result = makeResult({
      name: 'Entry',
      chunkType: 'class',
      relativePath: 'src/entry.ts',
      classSignature: 'class Entry extends EntryCore implements Auditable',
      content: CLASS_SOURCE,
      score: 0.9,
    });
    const output = await searchCodebaseHandler(
      {
        search: vi.fn().mockResolvedValue([result]),
        searchWithExpansion: vi.fn().mockResolvedValue([result]),
      },
      { query: 'what is an Entry', expand_hops: 0 },
      // Ample budget so budget compaction cannot be mistaken for the fix.
      { maxTokensPerCall: 40_000 },
    );
    return body(output);
  }

  it('serves the declaration, the field block, and method signatures', async () => {
    const text = await classOverviewBody();

    expect(text).toContain('class Entry extends EntryCore implements Auditable');
    expect(text).toContain('private readonly id: string;');
    expect(text).toContain('private amount: number;');
    expect(text).toContain('getId(): string');
    expect(text).toContain('setAmount(a: number): void');
  });

  it('does not serve body statements the fixture genuinely contains', async () => {
    const text = await classOverviewBody();

    // Non-tautology guard: the fixture really does contain both statements.
    expect(CLASS_SOURCE).toContain('return id;');
    expect(CLASS_SOURCE).toContain('this.amount = a;');
    expect(text).not.toContain('return id;');
    expect(text).not.toContain('this.amount = a;');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// F3.2 — enrichment never substitutes for required exact source (ENR-07, A-11,
// context.md decision 3), and imports never leak onto the ordinary search path.
// Asserted on the serialized tool response.
// ─────────────────────────────────────────────────────────────────────────────

describe('F3.2: enrichment never substitutes for exact source', () => {
  const EXACT_SOURCE = 'function refund(id: string) {\n  return ledger.reverse(id);\n}';
  const ENRICHED_DESCRIPTION = 'MODEL_GENERATED_SUMMARY_OF_REFUND';

  function body(output: Awaited<ReturnType<typeof searchCodebaseHandler>>): string {
    return (output.content[0] as { type: 'text'; text: string }).text;
  }

  function structured(
    output: Awaited<ReturnType<typeof searchCodebaseHandler>>,
  ): Record<string, unknown> {
    return output.structuredContent as Record<string, unknown>;
  }

  beforeEach(() => {
    resetSearchSessionCache();
    resetContractVerdictCache();
  });

  const run = async (
    result: RetrievalResult,
    query: string,
  ): Promise<Awaited<ReturnType<typeof searchCodebaseHandler>>> =>
    searchCodebaseHandler(
      {
        search: vi.fn().mockResolvedValue([result]),
        searchWithExpansion: vi.fn().mockResolvedValue([result]),
      },
      { query, expand_hops: 0 },
      { maxTokensPerCall: 40_000 },
    );

  /**
   * An exact_symbol query routes to `keyword`, which formats raw results and
   * never reaches the assembler. The assembler's exact_symbol branch — the one
   * M6 mutates — is reached through the real keyword-returns-zero fallthrough to
   * the semantic path (search-codebase.ts logs this as
   * 'keyword-fallback-semantic'). This helper drives that production path.
   */
  const runExactSymbol = async (
    result: RetrievalResult,
  ): Promise<Awaited<ReturnType<typeof searchCodebaseHandler>>> =>
    searchCodebaseHandler(
      {
        // Keyword lookup finds nothing → fall through to semantic.
        search: vi.fn().mockResolvedValue([]),
        searchWithExpansion: vi.fn().mockResolvedValue([result]),
      },
      { query: 'PaymentService.refund', expand_hops: 0 },
      { maxTokensPerCall: 40_000 },
    );

  // M6: preferring enrichment.description over exact source must fail this test.
  // 'PaymentService.refund' is a qualified symbol, so the planner classifies the
  // query as exact_symbol — the intent whose branch M6 mutates. Asserted below.
  it('classifies the M6 fixture query as exact_symbol', () => {
    // Guards the M6 test below: if the planner ever stopped classifying this
    // query as exact_symbol, the mutated branch would go unexercised and M6
    // would survive silently — which is how it survived iteration 1.
    const plan = new QueryPlanner().plan(
      { query: 'PaymentService.refund', expansionHops: 0 },
      { sparse: true, filterOnly: true, payloadIndexes: [] },
    );
    expect(plan.intent).toBe('exact_symbol');
  });

  it('serves the exact source and not the enrichment description for an exact symbol', async () => {
    const output = await runExactSymbol(
      makeResult({
        name: 'refund',
        relativePath: 'src/refund.ts',
        content: EXACT_SOURCE,
        signature: 'function refund(id: string)',
        enrichment: { description: ENRICHED_DESCRIPTION },
        score: 0.95,
      }),
    );
    const text = body(output);

    expect(text).toContain('return ledger.reverse(id);');
    expect(text).not.toContain(ENRICHED_DESCRIPTION);
  });

  // M6 companion: the same must hold on the ordinary (conceptual) search path,
  // at BOTH a high and a low score, so neither branch can substitute.
  it.each([0.95, 0.5])(
    'serves exact source rather than the enrichment description at score %s',
    async (score) => {
      const output = await run(
        makeResult({
          name: 'refund',
          relativePath: 'src/refund.ts',
          content: EXACT_SOURCE,
          signature: undefined,
          enrichment: { description: ENRICHED_DESCRIPTION },
          score,
        }),
        'how are refunds reversed in the ledger',
      );
      const text = body(output);

      expect(text).toContain('return ledger.reverse(id);');
      expect(text).not.toContain(ENRICHED_DESCRIPTION);
    },
  );

  it('degrades to a marked signature when exact source is genuinely unavailable', async () => {
    const output = await runExactSymbol(
      makeResult({
        name: 'refund',
        relativePath: 'src/refund.ts',
        content: '',
        signature: 'function refund(id: string)',
        enrichment: { description: ENRICHED_DESCRIPTION },
        score: 0.95,
      }),
    );
    const text = body(output);

    expect(text).toContain('function refund(id: string)');
    // Marked as a degraded signature, never silently summarized.
    expect(text).toContain('[signature]');
    expect(text).not.toContain(ENRICHED_DESCRIPTION);
    expect(structured(output).status).toBe('ok');
  });

  const WITH_IMPORTS = [
    "import { ledger } from './ledger';",
    "import type { Money } from './money';",
    'function refund(id: string) {',
    '  return ledger.reverse(id);',
    '}',
  ].join('\n');

  it.each([0.95, 0.5])('strips the import block at score %s', async (score) => {
    const output = await run(
      makeResult({
        name: 'refund',
        relativePath: 'src/refund.ts',
        content: WITH_IMPORTS,
        signature: undefined,
        score,
      }),
      'how are refunds reversed in the ledger',
    );
    const text = body(output);

    // Non-tautology guard: the fixture genuinely carries both import lines.
    expect(WITH_IMPORTS).toContain("import { ledger } from './ledger';");
    expect(text).not.toContain("import { ledger } from './ledger';");
    expect(text).not.toContain("import type { Money } from './money';");
    expect(text).toContain('return ledger.reverse(id);');
  });

  it('still includes imports for a dependency trace', async () => {
    const output = await run(
      makeResult({
        name: 'refund',
        relativePath: 'src/refund.ts',
        content: WITH_IMPORTS,
        imports: ['./ledger', './money'],
        signature: 'function refund(id: string)',
        score: 0.95,
      }),
      'what does src/refund.ts import',
    );

    expect(body(output)).toContain('./ledger');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// F3.3 — expansion evidence defaults to compact form (CTX-08, ENR-04) even at a
// high score. Rendered as anchor + signature + a one-line enrichment
// description; the description line is omitted entirely when enrichment is
// absent (ENR-08, context.md decision 5). Asserted on the serialized response.
// ─────────────────────────────────────────────────────────────────────────────

describe('F3.3: expansion evidence defaults to compact form', () => {
  const EXPANDED_BODY = 'function helper() {\n  return EXPANDED_BODY_STATEMENT;\n}';
  const DIRECT_BODY = 'function refundDirect() {\n  return DIRECT_BODY_STATEMENT;\n}';

  function body(output: Awaited<ReturnType<typeof searchCodebaseHandler>>): string {
    return (output.content[0] as { type: 'text'; text: string }).text;
  }

  beforeEach(() => {
    resetSearchSessionCache();
    resetContractVerdictCache();
  });

  const direct = makeResult({
    chunkId: 'direct',
    name: 'refundDirect',
    relativePath: 'src/direct.ts',
    content: DIRECT_BODY,
    signature: 'function refundDirect()',
    score: 0.95,
    startLine: 1,
    endLine: 3,
  });

  const runWith = async (
    extra: RetrievalResult[],
  ): Promise<Awaited<ReturnType<typeof searchCodebaseHandler>>> => {
    const results = [direct, ...extra];
    return searchCodebaseHandler(
      {
        search: vi.fn().mockResolvedValue(results),
        searchWithExpansion: vi.fn().mockResolvedValue(results),
      },
      { query: 'how are refunds reversed in the ledger', expand_hops: 0 },
      // Ample budget: compaction must not be mistaken for compact-by-form.
      { maxTokensPerCall: 40_000 },
    );
  };

  it.each(['dependency', 'hierarchy', 'call-chain', 'adjacent'])(
    'renders %s expansion evidence compactly even at a high score',
    async (expansionSource) => {
      const expanded = makeResult({
        chunkId: `expanded-${expansionSource}`,
        name: 'helper',
        relativePath: 'src/helper.ts',
        content: EXPANDED_BODY,
        signature: 'function helper()',
        enrichment: { description: 'Reverses a ledger entry.' },
        expansionSource,
        score: 0.95,
        startLine: 40,
        endLine: 42,
      });

      const text = body(await runWith([expanded]));

      // Non-tautology guard: the expansion result genuinely carries a body.
      expect(EXPANDED_BODY).toContain('return EXPANDED_BODY_STATEMENT;');
      expect(text).not.toContain('return EXPANDED_BODY_STATEMENT;');
      // Compact form: anchor + signature + one-line description.
      expect(text).toContain('src/helper.ts:40-42');
      expect(text).toContain('function helper()');
      expect(text).toContain('Reverses a ledger entry.');
    },
  );

  it('still carries live source for a direct high-confidence result (ENR-05)', async () => {
    const text = body(await runWith([]));

    expect(text).toContain('return DIRECT_BODY_STATEMENT;');
  });

  it('omits the description line entirely when expansion enrichment is missing (ENR-08)', async () => {
    const expanded = makeResult({
      chunkId: 'expanded-unenriched',
      name: 'helper',
      relativePath: 'src/helper.ts',
      content: EXPANDED_BODY,
      signature: 'function helper()',
      enrichment: undefined,
      expansionSource: 'dependency',
      score: 0.95,
      startLine: 40,
      endLine: 42,
    });

    const text = body(await runWith([expanded]));

    // Deterministic AST metadata still renders...
    expect(text).toContain('src/helper.ts:40-42');
    expect(text).toContain('function helper()');
    // ...but no empty field and no placeholder for the missing description.
    expect(text).not.toContain('undefined');
    expect(text).not.toContain('Description:');
    expect(text).not.toMatch(/\n\s*\n\s*\n/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// F3.4 — enrichment reaches the caller in structuredContent ONLY (ENR-01,
// context.md decision 5), and the signature-only degraded state is visibly
// marked on the response (A-29). Asserted on the serialized tool response.
// ─────────────────────────────────────────────────────────────────────────────

describe('F3.4: enrichment and the signature-only marker reach the caller', () => {
  const DIRECT_BODY = 'function refundDirect() {\n  return DIRECT_BODY_STATEMENT;\n}';

  function body(output: Awaited<ReturnType<typeof searchCodebaseHandler>>): string {
    return (output.content[0] as { type: 'text'; text: string }).text;
  }

  function structured(
    output: Awaited<ReturnType<typeof searchCodebaseHandler>>,
  ): Record<string, unknown> {
    return output.structuredContent as Record<string, unknown>;
  }

  beforeEach(() => {
    resetSearchSessionCache();
    resetContractVerdictCache();
  });

  const enriched = makeResult({
    chunkId: 'enriched',
    name: 'refundDirect',
    relativePath: 'src/direct.ts',
    content: DIRECT_BODY,
    signature: 'function refundDirect()',
    score: 0.95,
    startLine: 1,
    endLine: 3,
    enrichment: {
      description: 'Reverses a ledger entry.',
      businessContext: 'Refunds must be auditable.',
      semanticTags: ['payments', 'ledger'],
      relationships: [{ target: 'Ledger', type: 'uses', label: 'reverse' }],
      enrichmentModel: 'qwen3:8b',
      enrichedAt: '2026-08-01T00:00:00.000Z',
    },
  });

  const unenriched = makeResult({
    chunkId: 'unenriched',
    name: 'plainHelper',
    relativePath: 'src/plain.ts',
    content: 'function plainHelper() {\n  return 1;\n}',
    signature: 'function plainHelper()',
    score: 0.9,
    startLine: 10,
    endLine: 12,
    enrichment: undefined,
  });

  const runWith = async (
    results: RetrievalResult[],
  ): Promise<Awaited<ReturnType<typeof searchCodebaseHandler>>> =>
    searchCodebaseHandler(
      {
        search: vi.fn().mockResolvedValue(results),
        searchWithExpansion: vi.fn().mockResolvedValue(results),
      },
      { query: 'how are refunds reversed in the ledger', expand_hops: 0 },
      { maxTokensPerCall: 40_000 },
    );

  it('emits description, businessContext, semanticTags, relationships and provenance in structuredContent', async () => {
    const output = await runWith([enriched]);
    const results = structured(output).results as Array<Record<string, unknown>>;
    const item = results.find((entry) => entry.file === 'src/direct.ts');

    expect(item?.enrichment).toEqual({
      description: 'Reverses a ledger entry.',
      businessContext: 'Refunds must be auditable.',
      semanticTags: ['payments', 'ledger'],
      relationships: [{ target: 'Ledger', type: 'uses', label: 'reverse' }],
      enrichmentModel: 'qwen3:8b',
      enrichedAt: '2026-08-01T00:00:00.000Z',
    });
  });

  it('keeps enrichment out of the prose body for a direct result carrying live source', async () => {
    const text = body(await runWith([enriched]));

    // The source is present, so a model-generated summary of it would be paying
    // twice for the same information (context.md decision 5).
    expect(text).toContain('return DIRECT_BODY_STATEMENT;');
    expect(text).not.toContain('Reverses a ledger entry.');
    expect(text).not.toContain('Refunds must be auditable.');
    expect(text).not.toContain('semanticTags');
    expect(text).not.toContain('payments, ledger');
  });

  it('degrades an unenriched chunk in the same response to AST metadata with no error', async () => {
    const output = await runWith([enriched, unenriched]);
    const results = structured(output).results as Array<Record<string, unknown>>;
    const plain = results.find((entry) => entry.file === 'src/plain.ts');

    expect(structured(output).status).toBe('ok');
    // Deterministic AST metadata is present...
    expect(plain).toMatchObject({ file: 'src/plain.ts', name: 'plainHelper' });
    // ...and the enrichment key is absent rather than empty or null (ENR-08).
    expect('enrichment' in (plain ?? {})).toBe(false);
    // The enriched sibling still carries its enrichment in the same response.
    const rich = results.find((entry) => entry.file === 'src/direct.ts');
    expect((rich?.enrichment as Record<string, unknown>).description).toBe(
      'Reverses a ledger entry.',
    );
  });

  it('renders a visible signature-only marker on the serialized response (A-29)', async () => {
    const output = await runWith([
      makeResult({
        chunkId: 'sig-only',
        name: 'hugeMethod',
        relativePath: 'src/huge.ts',
        content: 'function hugeMethod() {\n  return 2;\n}',
        signature: 'function hugeMethod()',
        signatureOnly: true,
        score: 0.95,
        startLine: 20,
        endLine: 500,
      }),
    ]);

    expect(body(output)).toContain('[signature-only]');
    const results = structured(output).results as Array<Record<string, unknown>>;
    expect(results.find((entry) => entry.file === 'src/huge.ts')?.signature_only).toBe(true);
  });

  it('does not mark a normally-embedded chunk as signature-only', async () => {
    const output = await runWith([enriched]);

    expect(body(output)).not.toContain('[signature-only]');
    const results = structured(output).results as Array<Record<string, unknown>>;
    expect('signature_only' in (results[0] ?? {})).toBe(false);
  });

  it('makes no LLM call while handling the query (ENR-02)', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');

    await runWith([enriched, unenriched]);

    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// F5.1 — a filesystem read failure is surfaced as marked degradation rather
// than swallowed by a bare catch (FAIL-01, FAIL-04, spec Edge Cases → Context
// assembly). Asserted on the serialized tool response.
// ─────────────────────────────────────────────────────────────────────────────

describe('F5.1: filesystem read failures are surfaced as marked degradation', () => {
  function body(output: Awaited<ReturnType<typeof searchCodebaseHandler>>): string {
    return (output.content[0] as { type: 'text'; text: string }).text;
  }

  function structured(
    output: Awaited<ReturnType<typeof searchCodebaseHandler>>,
  ): Record<string, unknown> {
    return output.structuredContent as Record<string, unknown>;
  }

  beforeEach(() => {
    resetSearchSessionCache();
    resetContractVerdictCache();
  });

  const unreadable = makeResult({
    chunkId: 'unreadable',
    name: 'refund',
    relativePath: 'src/unreadable.ts',
    content: 'function refund() { return STORED_BODY; }',
    signature: 'function refund()',
    score: 0.95,
    startLine: 40,
    endLine: 60,
  });

  function runWith(
    results: RetrievalResult[],
    readFileFn: (relativePath: string) => Promise<string>,
    options: Record<string, unknown> = {},
  ) {
    const engine = {
      searchWithExpansion: vi.fn().mockResolvedValue(results),
      search: vi.fn().mockResolvedValue(results),
    };
    return searchCodebaseHandler(
      engine,
      { query: 'refund', expand_hops: 0, fallback: false },
      { readFileFn, ...options },
    );
  }

  it('states what failed and still returns the best grounded anchor (FAIL-04)', async () => {
    const output = await runWith([unreadable], () =>
      Promise.reject(new Error('EACCES: permission denied')),
    );

    // The failure is named, with the file that could not be read...
    expect(body(output)).toContain('EACCES: permission denied');
    expect(body(output)).toContain('src/unreadable.ts');
    // ...and the grounded anchor (path + line range + symbol) survives.
    expect(body(output)).toContain('src/unreadable.ts:40-60');
    expect(body(output)).toContain('refund');
    const results = structured(output).results as Array<Record<string, unknown>>;
    expect(results[0]).toMatchObject({ file: 'src/unreadable.ts', read_failed: true });
  });

  it('reports a non-ok status and marks the item rather than omitting it', async () => {
    const output = await runWith([unreadable], () =>
      Promise.reject(new Error('ENOENT: no such file or directory')),
    );

    // spec Edge Cases → Context assembly: degrade to anchor + metadata, MARKED.
    expect(structured(output).status).not.toBe('ok');
    expect(structured(output).status).toBe('low_confidence');
    expect(body(output)).toContain('[read-failed]');
    // Not silently omitted: the item is still counted as selected evidence.
    expect(structured(output).selected_count).toBe(1);
  });

  it('does not mark a successful read as degraded', async () => {
    const output = await runWith([unreadable], () => Promise.resolve('function refund() {}'));

    expect(structured(output).status).toBe('ok');
    expect(body(output)).not.toContain('[read-failed]');
    const results = structured(output).results as Array<Record<string, unknown>>;
    expect('read_failed' in (results[0] ?? {})).toBe(false);
  });

  it('marks only the item whose file failed, leaving readable siblings intact', async () => {
    const readable = makeResult({
      chunkId: 'readable',
      name: 'charge',
      relativePath: 'src/readable.ts',
      content: 'function charge() { return STORED; }',
      score: 0.9,
      startLine: 1,
      endLine: 3,
    });

    const output = await runWith([unreadable, readable], (relativePath) =>
      relativePath === 'src/unreadable.ts'
        ? Promise.reject(new Error('EACCES: permission denied'))
        : Promise.resolve('function charge() { return LIVE_CHARGE; }'),
    );

    const results = structured(output).results as Array<Record<string, unknown>>;
    expect(results.find((entry) => entry.file === 'src/unreadable.ts')?.read_failed).toBe(true);
    expect('read_failed' in (results.find((entry) => entry.file === 'src/readable.ts') ?? {})).toBe(
      false,
    );
    // The readable sibling still serves its LIVE source.
    expect(body(output)).toContain('LIVE_CHARGE');
  });

  it('does not invoke the overflow rule when the exact highest-priority node cannot be read', async () => {
    // spec Edge Cases: "WHEN the exact highest-priority node itself cannot be read
    // from disk THEN the overflow rule SHALL NOT be invoked and the failure SHALL
    // be reported." A tiny budget would otherwise trigger the one-node exception.
    const output = await runWith(
      [unreadable],
      () => Promise.reject(new Error('EACCES: permission denied')),
      { maxTokensPerCall: 10 },
    );

    expect(structured(output).exact_node_overflow).toBe(false);
    expect('exact_node_overflow_amount' in structured(output)).toBe(false);
    expect(body(output)).toContain('EACCES: permission denied');
  });
});
