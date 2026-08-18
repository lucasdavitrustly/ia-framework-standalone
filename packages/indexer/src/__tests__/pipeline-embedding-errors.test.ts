/**
 * T029-T030: Pipeline embedding error propagation tests
 *
 * Verifies that when embedding fails, the pipeline's catch block:
 * - Captures the error variable (not a bare catch {})
 * - Includes error.message in the logger.warn call
 * - Includes batch size in the skip log
 */
import { describe, it, expect, vi, beforeEach, beforeAll, afterAll } from 'vitest';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';

const TEST_DIR = join('/tmp', 'pipeline-embed-test');
const TEST_FILE = join(TEST_DIR, 'src', 'file.ts');
const FILE_CONTENT = 'function hello() { return "world"; }\n';

// Use vi.hoisted to avoid temporal dead zone with factory mocks
const {
  mockWarn,
  mockInfo,
  mockDebug,
  mockError,
  mockParseFile,
  testFile,
  fileContent,
} = vi.hoisted(() => {
  const dir = '/tmp/pipeline-embed-test';
  return {
    mockWarn: vi.fn(),
    mockInfo: vi.fn(),
    mockDebug: vi.fn(),
    mockError: vi.fn(),
    mockParseFile: vi.fn(),
    testFile: `${dir}/src/file.ts`,
    fileContent: 'function hello() { return "world"; }\n',
  };
});

vi.mock('@ia-framework/core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@ia-framework/core')>();
  return {
    ...actual,
    createLogger: () => ({
      info: mockInfo,
      warn: mockWarn,
      debug: mockDebug,
      error: mockError,
    }),
  };
});

// Mock ast-parser to return actual chunks pointing to our temp file
vi.mock('@ia-framework/ast-parser', () => ({
  parseFile: mockParseFile,
  splitOversizedChunks: vi.fn(),
  extractCalls: vi.fn().mockReturnValue(null),
  buildCalledByIndex: vi.fn().mockReturnValue(new Map()),
  classify: vi.fn().mockReturnValue({}),
}));

vi.mock('../file-walker.js', () => ({
  walkFiles: vi.fn().mockResolvedValue([testFile]),
}));

vi.mock('../incremental.js', () => ({
  getLastIndexedCommit: vi.fn(),
  saveLastIndexedCommit: vi.fn().mockResolvedValue(undefined),
  getCurrentCommit: vi.fn().mockResolvedValue('abc123'),
  getChangedFiles: vi.fn(),
}));

vi.mock('../enrichment/enricher.js', () => ({
  LlmEnricher: vi.fn(),
}));

vi.mock('../concept-generator.js', () => ({
  detectConcepts: vi.fn().mockReturnValue([]),
  generateConceptChunks: vi.fn().mockReturnValue([]),
}));

import { IndexingPipeline } from '../pipeline.js';
import type { EmbeddingProvider } from '@ia-framework/embedding';
import type { EmbeddingContract } from '@ia-framework/core';
import type { Mock } from 'vitest';
import type { VectorStore } from '@ia-framework/vector-store';

function createMockEmbeddingProvider(error: Error): EmbeddingProvider {
  const contract: EmbeddingContract = {
    provider: 'ollama',
    model: 'nomic-embed-text',
    dimension: 768,
    tokenizerVersion: 1,
    sparseHashVersion: 1,
  };
  return {
    name: 'ollama',
    model: 'nomic-embed-text',
    dimensions: 768,
    contract,
    embedBatch: vi.fn().mockRejectedValue(error),
    embed: vi.fn().mockRejectedValue(error),
    estimateTokens: vi.fn().mockReturnValue(10),
  };
}

function createSuccessfulEmbeddingProvider(dimension = 3): EmbeddingProvider {
  const contract: EmbeddingContract = {
    provider: 'openai',
    model: 'text-embedding-3-small',
    dimension,
    tokenizerVersion: 1,
    sparseHashVersion: 1,
  };
  return {
    name: 'openai',
    model: 'text-embedding-3-small',
    dimensions: dimension,
    contract,
    embedBatch: vi.fn((texts: string[]) =>
      Promise.resolve({
        vectors: texts.map(() => Array.from({ length: dimension }, () => 0.1)),
        failures: [],
      }),
    ),
    embed: vi.fn().mockResolvedValue(Array.from({ length: dimension }, () => 0.1)),
    estimateTokens: vi.fn().mockReturnValue(10),
  };
}

function makeOutcome(
  texts: string[],
  dimension: number,
  failures: Array<{ index: number; reason: string; retryable: boolean }> = [],
) {
  const failedIndexes = new Set(failures.map((failure) => failure.index));
  return {
    vectors: texts.map((_, index) =>
      failedIndexes.has(index) ? null : Array.from({ length: dimension }, () => 0.1),
    ),
    failures,
  };
}

function makeChunk(id: string, filePath = testFile, content = fileContent) {
  return {
    id,
    filePath,
    relativePath: 'src/file.ts',
    content,
    language: 'typescript',
    startLine: 1,
    endLine: content.split('\n').length,
    chunkType: 'function' as const,
    name: id,
    imports: [],
    exports: [],
  };
}

/** The double's mocked members must be visible so assertions stay type-safe. */
type MockedVectorStore = VectorStore & { initialize: Mock; upsertBatch: Mock; search: Mock };

function createMockVectorStore(): MockedVectorStore {
  return {
    initialize: vi.fn().mockResolvedValue(undefined),
    upsertBatch: vi.fn().mockResolvedValue(undefined),
    search: vi.fn().mockResolvedValue([]),
  } as unknown as MockedVectorStore;
}

describe('Pipeline embedding error propagation', () => {
  beforeAll(() => {
    mkdirSync(join(TEST_DIR, 'src'), { recursive: true });
    writeFileSync(TEST_FILE, FILE_CONTENT);
  });

  afterAll(() => {
    rmSync(TEST_DIR, { recursive: true, force: true });
  });

  beforeEach(() => {
    vi.clearAllMocks();
    mockParseFile.mockResolvedValue([
      {
        id: 'chunk-1',
        filePath: testFile,
        relativePath: 'src/file.ts',
        content: fileContent,
        language: 'typescript',
        startLine: 1,
        endLine: 1,
        chunkType: 'function',
        name: 'hello',
        imports: [],
        exports: [],
      },
    ]);
  });

  it('includes error message in logger.warn when embedding batch fails', async () => {
    const embeddingError = new Error(
      'Ollama embedding error [model=nomic-embed-text]: 404 {"error":"model not found"}',
    );
    const embeddingProvider = createMockEmbeddingProvider(embeddingError);
    const vectorStore = createMockVectorStore();
    const pipeline = new IndexingPipeline();

    await pipeline.run({
      targetProjectPath: TEST_DIR,
      frameworkDir: join(TEST_DIR, '.ia-framework'),
      collectionName: 'test-collection',
      embeddingProvider,
      vectorStore,
      embeddingBatchSize: 10,
    });

    // Find warn calls that mention batch skip
    const skipWarnCalls = mockWarn.mock.calls.filter(
      (args: unknown[]) => typeof args[1] === 'string' && args[1].toLowerCase().includes('skip'),
    );

    // There should be at least one skip warn because embedBatch always throws
    expect(skipWarnCalls.length).toBeGreaterThan(0);

    const [metadata] = skipWarnCalls[0]! as [Record<string, unknown>, string];
    // The metadata object should include an 'error' property with the error message
    expect(metadata).toHaveProperty('error');
    expect(metadata['error']).toContain('model not found');
  }, 10000);

  it('includes batch size in skip log metadata', async () => {
    const embeddingError = new Error('Ollama embedding error: 500 server overloaded');
    const embeddingProvider = createMockEmbeddingProvider(embeddingError);
    const vectorStore = createMockVectorStore();
    const pipeline = new IndexingPipeline();

    await pipeline.run({
      targetProjectPath: TEST_DIR,
      frameworkDir: join(TEST_DIR, '.ia-framework'),
      collectionName: 'test-collection',
      embeddingProvider,
      vectorStore,
      embeddingBatchSize: 5,
    });

    // Check that any warn about batch skip includes batchSize metadata
    const skipWarnCalls = mockWarn.mock.calls.filter(
      (args: unknown[]) => typeof args[1] === 'string' && args[1].toLowerCase().includes('skip'),
    );

    expect(skipWarnCalls.length).toBeGreaterThan(0);
    const [metadata] = skipWarnCalls[0]! as [Record<string, unknown>, string];
    expect(metadata).toHaveProperty('batchSize');
    expect(typeof metadata['batchSize']).toBe('number');
    // Also verify error is present
    expect(metadata).toHaveProperty('error');
  }, 10000);

  it('upserts successful siblings when one input in a batch fails', async () => {
    const embeddingProvider = createSuccessfulEmbeddingProvider();
    embeddingProvider.embedBatch = vi.fn((texts: string[]) =>
      Promise.resolve(
        makeOutcome(texts, 3, [
          { index: 2, reason: 'input 2 is invalid', retryable: false },
        ]),
      ),
    );
    const vectorStore = createMockVectorStore();
    const chunks = Array.from({ length: 10 }, (_, index) => makeChunk(`chunk-${index}`));
    mockParseFile.mockResolvedValue(chunks);

    const result = await new IndexingPipeline().run({
      targetProjectPath: TEST_DIR,
      frameworkDir: join(TEST_DIR, '.ia-framework'),
      collectionName: 'test-collection',
      embeddingProvider,
      vectorStore,
      embeddingBatchSize: 10,
      embeddingConcurrency: 1,
    });

    expect(result.chunksIndexed).toBe(9);
    expect(result.skippedChunks).toBe(1);
    const [points] = (vectorStore.upsertBatch as ReturnType<typeof vi.fn>).mock.calls[0] as [
      Array<{ id: string }>,
    ];
    expect(points.map((point) => point.id)).toEqual(
      chunks.filter((chunk) => chunk.id !== 'chunk-2').map((chunk) => chunk.id),
    );
  }, 10000);

  it('retries retryable failures but does not retry non-retryable failures', async () => {
    const embeddingProvider = createSuccessfulEmbeddingProvider();
    let calls = 0;
    embeddingProvider.embedBatch = vi.fn((texts: string[]) => {
      calls++;
      if (calls <= 2) {
        return Promise.resolve(
          makeOutcome(texts, 3, [
            { index: 0, reason: 'temporary provider failure', retryable: true },
          ]),
        );
      }
      return Promise.resolve(makeOutcome(texts, 3));
    });
    const vectorStore = createMockVectorStore();
    mockParseFile.mockResolvedValue([makeChunk('chunk-0'), makeChunk('chunk-1')]);

    const retryResult = await new IndexingPipeline().run({
      targetProjectPath: TEST_DIR,
      frameworkDir: join(TEST_DIR, '.ia-framework'),
      collectionName: 'test-collection',
      embeddingProvider,
      vectorStore,
      embeddingBatchSize: 2,
      embeddingConcurrency: 1,
    });

    expect(calls).toBe(4);
    expect(retryResult.chunksIndexed).toBe(2);
    expect(retryResult.skippedChunks).toBe(0);

    calls = 0;
    embeddingProvider.embedBatch = vi.fn((texts: string[]) => {
      calls++;
      return Promise.resolve(
        makeOutcome(texts, 3, [{ index: 0, reason: 'invalid input', retryable: false }]),
      );
    });
    vi.clearAllMocks();
    mockParseFile.mockResolvedValue([makeChunk('chunk-0'), makeChunk('chunk-1')]);

    const nonRetryResult = await new IndexingPipeline().run({
      targetProjectPath: TEST_DIR,
      frameworkDir: join(TEST_DIR, '.ia-framework'),
      collectionName: 'test-collection',
      embeddingProvider,
      vectorStore,
      embeddingBatchSize: 2,
      embeddingConcurrency: 1,
    });

    expect(calls).toBe(2);
    expect(nonRetryResult.chunksIndexed).toBe(1);
    expect(nonRetryResult.skippedChunks).toBe(1);
  }, 10000);

  it('retries a stopped Ollama runner and indexes the chunk when it recovers', async () => {
    const embeddingProvider = createSuccessfulEmbeddingProvider();
    const runnerError = new Error(
      'Ollama embedding error (runner-failure): 400 — {"error":"llama-server process no longer running: unknown"}',
    );
    let calls = 0;
    embeddingProvider.embedBatch = vi.fn((texts: string[]) => {
      calls++;
      if (calls === 1) throw runnerError;
      return Promise.resolve(makeOutcome(texts, 3));
    });
    const vectorStore = createMockVectorStore();
    mockParseFile.mockResolvedValue([makeChunk('runner-recovery')]);

    const result = await new IndexingPipeline().run({
      targetProjectPath: TEST_DIR,
      frameworkDir: join(TEST_DIR, '.ia-framework'),
      collectionName: 'test-collection',
      embeddingProvider,
      vectorStore,
      embeddingBatchSize: 1,
      embeddingConcurrency: 1,
    });

    expect(result.chunksIndexed).toBe(1);
    expect(result.skippedChunks).toBe(0);
    expect(calls).toBe(4);
  }, 10000);

  it('does not retry a permanent Ollama 400 embedding failure', async () => {
    const permanentError = new Error(
      'Ollama embedding error (unknown): 400 — {"error":"invalid input"}',
    );
    const embedBatchMock = vi.fn().mockRejectedValue(permanentError);
    const embeddingProvider = createMockEmbeddingProvider(permanentError);
    embeddingProvider.embedBatch = embedBatchMock;
    const vectorStore = createMockVectorStore();
    mockParseFile.mockResolvedValue([makeChunk('permanent-400')]);

    const result = await new IndexingPipeline().run({
      targetProjectPath: TEST_DIR,
      frameworkDir: join(TEST_DIR, '.ia-framework'),
      collectionName: 'test-collection',
      embeddingProvider,
      vectorStore,
      embeddingBatchSize: 1,
      embeddingConcurrency: 1,
    });

    expect(result.chunksIndexed).toBe(0);
    expect(result.skippedChunks).toBe(1);
    expect(embedBatchMock.mock.calls).toHaveLength(2);
  }, 10000);

  it('splits a context-length-overflow batch and indexes both chunks', async () => {
    // Full batch (2 chunks → 2 inputs per channel) overflows; each half (1 input)
    // succeeds. The pipeline must split rather than drop all chunks.
    const embeddingProvider = createSuccessfulEmbeddingProvider();
    const overflow = new Error(
      'Ollama embedding error (context-length): 400 — {"error":"input exceeds context length"}',
    );
    embeddingProvider.embedBatch = vi.fn((texts: string[]) => {
      if (texts.length > 1) throw overflow;
      return Promise.resolve(makeOutcome(texts, 3));
    });
    const vectorStore = createMockVectorStore();
    mockParseFile.mockResolvedValue([makeChunk('split-a'), makeChunk('split-b')]);

    const result = await new IndexingPipeline().run({
      targetProjectPath: TEST_DIR,
      frameworkDir: join(TEST_DIR, '.ia-framework'),
      collectionName: 'test-collection',
      embeddingProvider,
      vectorStore,
      embeddingBatchSize: 2,
      embeddingConcurrency: 1,
    });

    expect(result.chunksIndexed).toBe(2);
    expect(result.skippedChunks).toBe(0);
  }, 10000);

  it('skips only the single chunk that still overflows at size 1', async () => {
    const embeddingProvider = createSuccessfulEmbeddingProvider();
    const overflow = new Error(
      'Ollama embedding error (context-length): 400 — {"error":"input exceeds context length"}',
    );
    // A chunk whose name marks it as oversized always overflows (even alone);
    // the other succeeds. Split recurses to size 1, then skips only the
    // offending chunk. The name survives into the signature channel; file
    // content is re-read from disk so we key off the name, not the content.
    embeddingProvider.embedBatch = vi.fn((texts: string[]) => {
      if (texts.some((t) => t.includes('OVERSIZED'))) throw overflow;
      return Promise.resolve(makeOutcome(texts, 3));
    });
    const vectorStore = createMockVectorStore();
    mockParseFile.mockResolvedValue([makeChunk('split-ok'), makeChunk('OVERSIZED-chunk')]);

    const result = await new IndexingPipeline().run({
      targetProjectPath: TEST_DIR,
      frameworkDir: join(TEST_DIR, '.ia-framework'),
      collectionName: 'test-collection',
      embeddingProvider,
      vectorStore,
      embeddingBatchSize: 2,
      embeddingConcurrency: 1,
    });

    expect(result.chunksIndexed).toBe(1);
    expect(result.skippedChunks).toBe(1);
  }, 10000);

  it('validates vector dimensions before upsert', async () => {
    const embeddingProvider = createSuccessfulEmbeddingProvider(3);
    embeddingProvider.embedBatch = vi.fn((texts: string[]) =>
      Promise.resolve(makeOutcome(texts, 2)),
    );
    const vectorStore = createMockVectorStore();
    mockParseFile.mockResolvedValue([makeChunk('wrong-dimension')]);

    const result = await new IndexingPipeline().run({
      targetProjectPath: TEST_DIR,
      frameworkDir: join(TEST_DIR, '.ia-framework'),
      collectionName: 'test-collection',
      embeddingProvider,
      vectorStore,
      embeddingBatchSize: 1,
      embeddingConcurrency: 1,
    });

    expect(vectorStore.upsertBatch).not.toHaveBeenCalled();
    expect(result.chunksIndexed).toBe(0);
    expect(result.skippedChunks).toBe(1);
    const warningText = mockWarn.mock.calls
      .map(([metadata, message]) => `${JSON.stringify(metadata)} ${String(message)}`)
      .join(' ');
    expect(warningText).toContain('dimension');
  }, 10000);

  it('checks cancellation after embedding and before upsert', async () => {
    const controller = new AbortController();
    const embeddingProvider = createSuccessfulEmbeddingProvider();
    embeddingProvider.embedBatch = vi.fn((texts: string[]) => {
      controller.abort();
      return Promise.resolve(makeOutcome(texts, 3));
    });
    const vectorStore = createMockVectorStore();
    mockParseFile.mockResolvedValue([makeChunk('cancelled')]);

    const result = await new IndexingPipeline().run(
      {
        targetProjectPath: TEST_DIR,
        frameworkDir: join(TEST_DIR, '.ia-framework'),
        collectionName: 'test-collection',
        embeddingProvider,
        vectorStore,
        embeddingBatchSize: 1,
        embeddingConcurrency: 1,
      },
      undefined,
      controller.signal,
    );

    expect(vectorStore.upsertBatch).not.toHaveBeenCalled();
    expect(result.chunksIndexed).toBe(0);
  }, 10000);

  it('accounts for a failed context-source batch and continues with later sources', async () => {
    const embeddingProvider = createSuccessfulEmbeddingProvider();
    let calls = 0;
    embeddingProvider.embedBatch = vi.fn((texts: string[]) => {
      calls++;
      if (calls === 1) {
        return Promise.resolve(
          makeOutcome(texts, 3, [
            { index: 0, reason: 'context input failed', retryable: false },
          ]),
        );
      }
      return Promise.resolve(makeOutcome(texts, 3));
    });
    const vectorStore = createMockVectorStore();
    mockParseFile.mockResolvedValue([]);
    const contextChunk = {
      id: 'context-1',
      filePath: '__db__',
      relativePath: 'users',
      language: 'sql',
      chunkType: 'table',
      name: 'users',
      content: 'Table users',
      startLine: 0,
      endLine: 0,
      imports: [],
      exports: [],
      indexedAt: new Date().toISOString(),
    };

    const result = await new IndexingPipeline().run({
      targetProjectPath: TEST_DIR,
      frameworkDir: join(TEST_DIR, '.ia-framework'),
      collectionName: 'test-collection',
      embeddingProvider,
      vectorStore,
      contextSources: [
        { name: 'broken', getChunks: vi.fn().mockResolvedValue([contextChunk]) },
        { name: 'working', getChunks: vi.fn().mockResolvedValue([contextChunk]) },
      ],
      embeddingBatchSize: 1,
      embeddingConcurrency: 1,
    });

    expect(result.chunksIndexed).toBe(1);
    expect(result.skippedChunks).toBe(1);
  }, 10000);

  it('uses provider-aware packing instead of fixed-size batches', async () => {
    const embeddingProvider = createSuccessfulEmbeddingProvider();
    const vectorStore = createMockVectorStore();
    const chunks = Array.from({ length: 5 }, (_, index) => makeChunk(`packed-${index}`));
    mockParseFile.mockResolvedValue(chunks);

    await new IndexingPipeline().run({
      targetProjectPath: TEST_DIR,
      frameworkDir: join(TEST_DIR, '.ia-framework'),
      collectionName: 'test-collection',
      embeddingProvider,
      vectorStore,
      embeddingBatchSize: 50,
      embeddingConcurrency: 1,
    });

    const calls = (embeddingProvider.embedBatch as unknown as ReturnType<typeof vi.fn>).mock
      .calls as Array<[string[], string?]>;
    expect(calls.length).toBe(2);
    expect(calls.every(([texts]) => texts.length <= 5)).toBe(true);
  }, 10000);

  it('does not upsert a partial batch after a cancellation during retry', async () => {
    const controller = new AbortController();
    const embeddingProvider = createSuccessfulEmbeddingProvider();
    embeddingProvider.embedBatch = vi.fn(async (texts: string[]) => {
      controller.abort();
      return Promise.resolve(
        makeOutcome(texts, 3, [
          { index: 0, reason: 'temporary failure', retryable: true },
        ]),
      );
    });
    const vectorStore = createMockVectorStore();
    mockParseFile.mockResolvedValue([makeChunk('cancelled-retry')]);

    const result = await new IndexingPipeline().run(
      {
        targetProjectPath: TEST_DIR,
        frameworkDir: join(TEST_DIR, '.ia-framework'),
        collectionName: 'test-collection',
        embeddingProvider,
        vectorStore,
        embeddingBatchSize: 1,
        embeddingConcurrency: 1,
      },
      undefined,
      controller.signal,
    );

    expect(vectorStore.upsertBatch).not.toHaveBeenCalled();
    expect(result.chunksIndexed).toBe(0);
    expect(result.skippedChunks).toBe(1);
  }, 10000);

  it('routes an oversized method through the signature-only handler', async () => {
    const hugeFile = join(TEST_DIR, 'src', 'huge.ts');
    const hugeContent = [
      '/** A deliberately oversized method. */',
      'public void hugeMethod() {',
      ...Array.from({ length: 20_000 }, (_, index) => `  bodyLine${index}();`),
      '}',
    ].join('\n');
    writeFileSync(hugeFile, hugeContent);

    const embeddingProvider = createSuccessfulEmbeddingProvider();
    const vectorStore = createMockVectorStore();
    mockParseFile.mockResolvedValue([
      {
        ...makeChunk('huge-method', hugeFile, hugeContent),
        relativePath: 'src/huge.ts',
        startLine: 1,
        endLine: 20_003,
        chunkType: 'method' as const,
        name: 'hugeMethod',
      },
    ]);

    const result = await new IndexingPipeline().run({
      targetProjectPath: TEST_DIR,
      frameworkDir: join(TEST_DIR, '.ia-framework'),
      collectionName: 'test-collection',
      embeddingProvider,
      vectorStore,
      embeddingBatchSize: 50,
      embeddingConcurrency: 1,
    });

    expect(result.chunksIndexed).toBe(1);
    const [points] = (vectorStore.upsertBatch as ReturnType<typeof vi.fn>).mock.calls[0] as [
      Array<{ payload: { signatureOnly?: boolean; startLine: number; endLine: number } }>,
    ];
    expect(points[0]?.payload.signatureOnly).toBe(true);
    expect(points[0]?.payload.startLine).toBe(1);
    expect(points[0]?.payload.endLine).toBe(20_003);
  }, 10000);

  it('does not upsert an empty vector when a provider returns a short response', async () => {
    const embeddingProvider = createSuccessfulEmbeddingProvider();
    embeddingProvider.embedBatch = vi.fn((texts: string[]) =>
      Promise.resolve({
        vectors: texts.length === 1 ? [] : texts.map(() => [0.1, 0.1, 0.1]),
        failures: [],
      }),
    );
    const vectorStore = createMockVectorStore();
    mockParseFile.mockResolvedValue([makeChunk('short-response')]);

    const result = await new IndexingPipeline().run({
      targetProjectPath: TEST_DIR,
      frameworkDir: join(TEST_DIR, '.ia-framework'),
      collectionName: 'test-collection',
      embeddingProvider,
      vectorStore,
      embeddingBatchSize: 1,
      embeddingConcurrency: 1,
    });

    expect(vectorStore.upsertBatch).not.toHaveBeenCalled();
    expect(result.chunksIndexed).toBe(0);
    expect(result.skippedChunks).toBe(1);
  }, 10000);
});
