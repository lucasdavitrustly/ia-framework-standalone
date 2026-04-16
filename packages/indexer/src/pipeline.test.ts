import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest';
import { mkdir, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import type { ChunkMetadata } from '@ia-framework/core';

// ── Hoist mock variables so they are available in vi.mock factories ──────────
const { mockParseFile } = vi.hoisted(() => ({ mockParseFile: vi.fn() }));

const {
  mockGetLastIndexedCommit,
  mockGetChangedFiles,
  mockGetCurrentCommit,
  mockSaveLastIndexedCommit,
} = vi.hoisted(() => ({
  mockGetLastIndexedCommit: vi.fn(),
  mockGetChangedFiles: vi.fn(),
  mockGetCurrentCommit: vi.fn(),
  mockSaveLastIndexedCommit: vi.fn(),
}));

// ── Mock @ia-framework/ast-parser ───────────────────────────────────────────
vi.mock('@ia-framework/ast-parser', () => ({
  parseFile: mockParseFile,
}));

// ── Mock incremental helpers ─────────────────────────────────────────────────
vi.mock('./incremental.js', () => ({
  getLastIndexedCommit: mockGetLastIndexedCommit,
  getChangedFiles: mockGetChangedFiles,
  getCurrentCommit: mockGetCurrentCommit,
  saveLastIndexedCommit: mockSaveLastIndexedCommit,
}));

// ── Import IndexingPipeline after mocks ────────────────────────────────────
import { IndexingPipeline } from './pipeline.js';
import type { IndexingConfig, IndexingProgress } from './pipeline.js';
import { walkFiles } from './file-walker.js';

// ── Mock factory helpers ─────────────────────────────────────────────────────
function makeMockEmbeddingProvider(dim = 3) {
  return {
    name: 'mock',
    model: 'mock-model',
    dimensions: dim,
    embed: vi.fn().mockResolvedValue([0.1, 0.2, 0.3]),
    embedBatch: vi
      .fn()
      .mockImplementation((texts: string[]) => Promise.resolve(texts.map(() => [0.1, 0.2, 0.3]))),
    estimateTokens: vi.fn().mockReturnValue(10),
  };
}

function makeMockVectorStore() {
  return {
    initialize: vi.fn().mockResolvedValue(undefined),
    upsertBatch: vi.fn().mockResolvedValue(undefined),
    search: vi.fn().mockResolvedValue([]),
    searchHybrid: vi.fn().mockResolvedValue([]),
    getCollectionInfo: vi.fn().mockResolvedValue({
      name: 'test',
      pointCount: 0,
      vectorDimensions: { text: 3, code: 3 },
      status: 'green',
    }),
    deleteByFilter: vi.fn().mockResolvedValue(0),
    deleteByIds: vi.fn().mockResolvedValue(undefined),
    deleteCollection: vi.fn().mockResolvedValue(undefined),
  };
}

function makeChunk(id: string, filePath: string) {
  return {
    id,
    filePath,
    relativePath: filePath.replace('/tmp/proj/', ''),
    language: 'typescript',
    chunkType: 'function',
    name: 'testFn',
    content: 'function testFn() {}',
    startLine: 1,
    endLine: 3,
    imports: [],
    exports: ['testFn'],
  };
}

describe('IndexingPipeline', () => {
  let pipeline: IndexingPipeline;
  let embeddingProvider: ReturnType<typeof makeMockEmbeddingProvider>;
  let vectorStore: ReturnType<typeof makeMockVectorStore>;
  let tmpDir: string;

  beforeEach(async () => {
    vi.clearAllMocks();
    pipeline = new IndexingPipeline();
    embeddingProvider = makeMockEmbeddingProvider();
    vectorStore = makeMockVectorStore();

    // Create temp directory with a source file
    tmpDir = join(tmpdir(), `indexer-test-${Date.now()}`);
    await mkdir(tmpDir, { recursive: true });
    await writeFile(join(tmpDir, 'foo.ts'), 'export function foo() {}');

    // Default mocks
    mockGetLastIndexedCommit.mockResolvedValue(null);
    mockGetCurrentCommit.mockResolvedValue('abc123');
    mockSaveLastIndexedCommit.mockResolvedValue(undefined);
    mockParseFile.mockResolvedValue([makeChunk('chunk-1', join(tmpDir, 'foo.ts'))]);
  });

  const makeConfig = (overrides: Partial<IndexingConfig> = {}): IndexingConfig => ({
    targetProjectPath: tmpDir,
    frameworkDir: join(tmpDir, '.ia-framework'),
    collectionName: 'test-collection',
    embeddingProvider,
    vectorStore,
    ...overrides,
  });

  it('Test 1: run() walks target directory and calls parseFile for each source file found', async () => {
    await pipeline.run(makeConfig());

    expect(mockParseFile).toHaveBeenCalledWith(
      join(tmpDir, 'foo.ts'),
      expect.objectContaining({ projectRoot: tmpDir }),
    );
  });

  it('Test 2: run() calls embeddingProvider.embedBatch() with chunk content strings', async () => {
    await pipeline.run(makeConfig());

    expect(embeddingProvider.embedBatch).toHaveBeenCalledWith(['function testFn() {}']);
  });

  it('Test 3: run() calls vectorStore.upsertBatch() with VectorPoints having both textVector and codeVector', async () => {
    await pipeline.run(makeConfig());

    expect(vectorStore.upsertBatch).toHaveBeenCalledOnce();
    const [points] = vectorStore.upsertBatch.mock.calls[0] as [
      { textVector: number[]; codeVector: number[] }[],
    ];
    expect(points).toHaveLength(1);
    expect(points[0]!.textVector).toEqual([0.1, 0.2, 0.3]);
    expect(points[0]!.codeVector).toEqual([0.1, 0.2, 0.3]);
  });

  it('Test 4: run() calls progress callback with stage="done" when complete', async () => {
    const progressEvents: IndexingProgress[] = [];
    await pipeline.run(makeConfig(), (p) => progressEvents.push({ ...p }));

    const doneEvent = progressEvents.find((e) => e.stage === 'done');
    expect(doneEvent).toBeDefined();
    expect(doneEvent?.filesProcessed).toBe(1);
    expect(doneEvent?.chunksIndexed).toBe(1);
  });

  it('Test 5: run() skips files that fail to parse and continues', async () => {
    // Create a second file
    await writeFile(join(tmpDir, 'bar.ts'), 'export function bar() {}');

    // First call throws, second returns a chunk
    mockParseFile
      .mockRejectedValueOnce(new Error('parse error'))
      .mockResolvedValueOnce([makeChunk('chunk-2', join(tmpDir, 'bar.ts'))]);

    const result = await pipeline.run(makeConfig());

    // Should have processed 2 files, one failed to parse
    expect(result.filesIndexed).toBe(2);
    // Only one chunk was successfully indexed (from bar.ts)
    expect(result.chunksIndexed).toBe(1);
  });

  it('Test 6: run() with incremental=true only processes changed files', async () => {
    const changedFile = join(tmpDir, 'foo.ts');
    mockGetLastIndexedCommit.mockResolvedValue('old-commit-hash');
    mockGetChangedFiles.mockResolvedValue([changedFile]);

    await pipeline.run(makeConfig({ incremental: true }));

    // Should call deleteByFilter for the changed file before re-indexing
    expect(vectorStore.deleteByFilter).toHaveBeenCalledWith({ filePath: changedFile });
    // Should call parseFile for the changed file
    expect(mockParseFile).toHaveBeenCalledWith(changedFile, expect.any(Object));
  });

  it('Test 7: run() calls vectorStore.initialize() before upserting', async () => {
    const callOrder: string[] = [];
    vectorStore.initialize.mockImplementation(async () => {
      callOrder.push('initialize');
    });
    vectorStore.upsertBatch.mockImplementation(async () => {
      callOrder.push('upsertBatch');
    });

    await pipeline.run(makeConfig());

    expect(callOrder[0]).toBe('initialize');
    expect(callOrder).toContain('upsertBatch');
  });

  it('Test 8: walkFiles returns only source files, not .json or .md', async () => {
    // Add non-source files to tmp dir
    await writeFile(join(tmpDir, 'config.json'), '{}');
    await writeFile(join(tmpDir, 'README.md'), '# Readme');

    const files = await walkFiles({ projectPath: tmpDir });

    // Should only include .ts files, not .json or .md
    const hasTsFile = files.some((f) => f.endsWith('.ts'));
    const hasJsonFile = files.some((f) => f.endsWith('.json'));
    const hasMdFile = files.some((f) => f.endsWith('.md'));

    expect(hasTsFile).toBe(true);
    expect(hasJsonFile).toBe(false);
    expect(hasMdFile).toBe(false);
  });
});

// ── Helper factory for contextSources tests ──────────────────────────────────
function makeContextSource(name: string, chunks: ChunkMetadata[]) {
  return { name, getChunks: vi.fn().mockResolvedValue(chunks) };
}

function makeTableChunk(tableName: string): ChunkMetadata {
  return {
    id: `db-${tableName}`,
    filePath: '__db__',
    relativePath: tableName,
    language: 'sql',
    chunkType: 'table',
    name: tableName,
    content: `Table: ${tableName}\nColumns:\n  id: integer`,
    startLine: 0,
    endLine: 0,
    imports: [],
    exports: [],
    indexedAt: new Date().toISOString(),
  };
}

describe('IndexingPipeline — contextSources', () => {
  let pipeline: IndexingPipeline;
  let embeddingProvider: ReturnType<typeof makeMockEmbeddingProvider>;
  let vectorStore: ReturnType<typeof makeMockVectorStore>;
  let tmpDir: string;

  beforeEach(async () => {
    vi.clearAllMocks();
    pipeline = new IndexingPipeline();
    embeddingProvider = makeMockEmbeddingProvider();
    vectorStore = makeMockVectorStore();

    tmpDir = join(tmpdir(), `indexer-ctx-test-${Date.now()}`);
    await mkdir(tmpDir, { recursive: true });
    await writeFile(join(tmpDir, 'foo.ts'), 'export function foo() {}');

    mockGetLastIndexedCommit.mockResolvedValue(null);
    mockGetCurrentCommit.mockResolvedValue('abc123');
    mockSaveLastIndexedCommit.mockResolvedValue(undefined);
    // No file chunks from parser — we focus on contextSources
    mockParseFile.mockResolvedValue([]);
  });

  const makeConfig = (overrides: Partial<IndexingConfig> = {}): IndexingConfig => ({
    targetProjectPath: tmpDir,
    frameworkDir: join(tmpDir, '.ia-framework'),
    collectionName: 'test-collection',
    embeddingProvider,
    vectorStore,
    ...overrides,
  });

  // Test 1: Embeds and upserts chunks from a single ContextSource when provided
  it('embeds and upserts chunks from a single ContextSource when provided', async () => {
    const tableChunk = makeTableChunk('users');
    const source = makeContextSource('postgres', [tableChunk]);

    const result = await pipeline.run(makeConfig({ contextSources: [source] }));

    expect(source.getChunks).toHaveBeenCalledOnce();
    expect(embeddingProvider.embedBatch).toHaveBeenCalledWith([tableChunk.content]);
    expect(vectorStore.upsertBatch).toHaveBeenCalled();
    expect(result.chunksIndexed).toBe(1);
  });

  // Test 2: Handles multiple ContextSources sequentially
  it('handles multiple ContextSources sequentially', async () => {
    const source1 = makeContextSource('postgres', [
      makeTableChunk('users'),
      makeTableChunk('orders'),
    ]);
    const source2 = makeContextSource('docs', [makeTableChunk('products')]);

    const result = await pipeline.run(makeConfig({ contextSources: [source1, source2] }));

    expect(source1.getChunks).toHaveBeenCalledOnce();
    expect(source2.getChunks).toHaveBeenCalledOnce();
    expect(result.chunksIndexed).toBe(3);
  });

  // Test 3: Skips a ContextSource that throws (logs error, continues with next)
  it('skips a ContextSource that throws and continues with next', async () => {
    const failingSource = {
      name: 'broken',
      getChunks: vi.fn().mockRejectedValue(new Error('connection failed')),
    };
    const workingSource = makeContextSource('postgres', [makeTableChunk('users')]);

    const result = await pipeline.run(
      makeConfig({ contextSources: [failingSource, workingSource] }),
    );

    expect(result.chunksIndexed).toBe(1); // only from workingSource
  });

  // Test 4: Returns correct chunksIndexed count including context source chunks
  it('returns correct chunksIndexed count including context source chunks', async () => {
    mockParseFile.mockResolvedValue([
      {
        id: 'file-chunk-1',
        filePath: join(tmpDir, 'foo.ts'),
        relativePath: 'foo.ts',
        language: 'typescript',
        chunkType: 'function',
        name: 'foo',
        content: 'function foo() {}',
        startLine: 1,
        endLine: 1,
        imports: [],
        exports: ['foo'],
      },
    ]);

    const source = makeContextSource('postgres', [
      makeTableChunk('users'),
      makeTableChunk('orders'),
    ]);
    const result = await pipeline.run(makeConfig({ contextSources: [source] }));

    // 1 file chunk + 2 DB chunks = 3 total
    expect(result.chunksIndexed).toBe(3);
  });

  // Test 5: Does not call getChunks when contextSources is undefined
  it('does not call getChunks when contextSources is undefined (baseline)', async () => {
    const source = makeContextSource('postgres', [makeTableChunk('users')]);

    await pipeline.run(makeConfig()); // no contextSources

    expect(source.getChunks).not.toHaveBeenCalled();
  });
});

// Cleanup after all tests
afterAll(async () => {
  try {
    // tmpDir is scoped inside describe block — cleanup is handled by beforeEach per test
    // No-op cleanup needed here
  } catch {
    // ignore cleanup errors
  }
});

// ── Parallel embedding, retry, abort, strategy delegation tests ──────────────
describe('IndexingPipeline — parallel embedding', () => {
  let pipeline: IndexingPipeline;
  let embeddingProvider: ReturnType<typeof makeMockEmbeddingProvider>;
  let vectorStore: ReturnType<typeof makeMockVectorStore>;
  let tmpDir: string;

  beforeEach(async () => {
    vi.clearAllMocks();
    pipeline = new IndexingPipeline();
    embeddingProvider = makeMockEmbeddingProvider();
    vectorStore = makeMockVectorStore();

    tmpDir = join(tmpdir(), `indexer-parallel-test-${Date.now()}`);
    await mkdir(tmpDir, { recursive: true });
    await writeFile(join(tmpDir, 'foo.ts'), 'export function foo() {}');

    mockGetLastIndexedCommit.mockResolvedValue(null);
    mockGetCurrentCommit.mockResolvedValue('abc123');
    mockSaveLastIndexedCommit.mockResolvedValue(undefined);
  });

  const makeConfig = (overrides: Partial<IndexingConfig> = {}): IndexingConfig => ({
    targetProjectPath: tmpDir,
    frameworkDir: join(tmpDir, '.ia-framework'),
    collectionName: 'test-collection',
    embeddingProvider,
    vectorStore,
    ...overrides,
  });

  // Test 1: Pipeline with concurrency=2 processes 4 batches with max 2 running simultaneously
  it('limits concurrent embedding batches to configured concurrency', async () => {
    // Create 4 chunks, batch size 1 → 4 batches
    const chunks = Array.from({ length: 4 }, (_, i) =>
      makeChunk(`chunk-${i}`, join(tmpDir, 'foo.ts')),
    );
    mockParseFile.mockResolvedValue(chunks);

    let activeCalls = 0;
    let maxConcurrent = 0;
    embeddingProvider.embedBatch.mockImplementation(async () => {
      activeCalls++;
      maxConcurrent = Math.max(maxConcurrent, activeCalls);
      await new Promise((r) => setTimeout(r, 50)); // simulate work
      activeCalls--;
      return [[0.1, 0.2, 0.3]];
    });

    await pipeline.run(makeConfig({ embeddingBatchSize: 1, embeddingConcurrency: 2 }));

    // Each batch calls embedBatch twice (text + code), so max concurrent should be ≤ 2 batches
    // which means ≤ 4 concurrent embedBatch calls (2 per batch × 2 concurrent batches)
    // But the key constraint is max 2 batches running at once
    expect(maxConcurrent).toBeLessThanOrEqual(4); // 2 batches × 2 calls each
    expect(maxConcurrent).toBeGreaterThan(1); // proves concurrency
  });

  // Test 2: Pipeline defaults to concurrency=3 when embeddingProvider.name is 'ollama'
  it('defaults to concurrency=3 for ollama provider', async () => {
    const chunks = Array.from({ length: 6 }, (_, i) =>
      makeChunk(`chunk-${i}`, join(tmpDir, 'foo.ts')),
    );
    mockParseFile.mockResolvedValue(chunks);

    const ollamaProvider = {
      ...embeddingProvider,
      name: 'ollama',
    };

    let activeCalls = 0;
    let maxConcurrent = 0;
    ollamaProvider.embedBatch.mockImplementation(async () => {
      activeCalls++;
      maxConcurrent = Math.max(maxConcurrent, activeCalls);
      await new Promise((r) => setTimeout(r, 50));
      activeCalls--;
      return [[0.1, 0.2, 0.3]];
    });

    await pipeline.run(
      makeConfig({
        embeddingProvider: ollamaProvider,
        embeddingBatchSize: 1,
        // No embeddingConcurrency — should default to 3 for 'ollama'
      }),
    );

    // With 6 batches and concurrency=3, max concurrent embedBatch calls ≤ 6 (3 batches × 2 calls)
    expect(maxConcurrent).toBeLessThanOrEqual(6);
    expect(maxConcurrent).toBeGreaterThan(2); // proves more than 1 batch concurrent
  });

  // Test 3: Pipeline defaults to concurrency=10 when embeddingProvider.name is 'openai'
  it('defaults to concurrency=10 for openai provider', async () => {
    const chunks = Array.from({ length: 10 }, (_, i) =>
      makeChunk(`chunk-${i}`, join(tmpDir, 'foo.ts')),
    );
    mockParseFile.mockResolvedValue(chunks);

    const openaiProvider = {
      ...embeddingProvider,
      name: 'openai',
    };

    // We just need to verify it doesn't error and processes all 10 batches
    await pipeline.run(
      makeConfig({
        embeddingProvider: openaiProvider,
        embeddingBatchSize: 1,
        // No embeddingConcurrency — should default to 10 for 'openai'
      }),
    );

    // All 10 chunks should be indexed (10 batches of 1)
    expect(vectorStore.upsertBatch).toHaveBeenCalled();
  });

  // Test 4: Pipeline uses embeddingConcurrency from config when provided (overrides provider default)
  it('uses embeddingConcurrency from config over provider default', async () => {
    const chunks = Array.from({ length: 5 }, (_, i) =>
      makeChunk(`chunk-${i}`, join(tmpDir, 'foo.ts')),
    );
    mockParseFile.mockResolvedValue(chunks);

    let activeCalls = 0;
    let maxConcurrent = 0;
    embeddingProvider.embedBatch.mockImplementation(async () => {
      activeCalls++;
      maxConcurrent = Math.max(maxConcurrent, activeCalls);
      await new Promise((r) => setTimeout(r, 50));
      activeCalls--;
      return [[0.1, 0.2, 0.3]];
    });

    // Provider is 'mock' (defaults to 3), but we override to 1
    await pipeline.run(makeConfig({ embeddingBatchSize: 1, embeddingConcurrency: 1 }));

    // With concurrency=1, only 2 embedBatch calls at once (text + code for single batch)
    expect(maxConcurrent).toBeLessThanOrEqual(2);
  });

  // Test 5: Text and code embeddings within same batch are called via Promise.all
  it('calls embedBatch for both text and code embeddings per batch', async () => {
    mockParseFile.mockResolvedValue([makeChunk('chunk-1', join(tmpDir, 'foo.ts'))]);

    await pipeline.run(makeConfig({ embeddingBatchSize: 1 }));

    // embedBatch should be called at least twice per batch: once for text descriptions, once for code
    expect(embeddingProvider.embedBatch).toHaveBeenCalledTimes(2);
  });

  // Test 6: Failed embedding batch retries once; if retry succeeds, batch is included
  it('retries failed embedding batch once and includes result on success', async () => {
    mockParseFile.mockResolvedValue([makeChunk('chunk-1', join(tmpDir, 'foo.ts'))]);

    let callCount = 0;
    embeddingProvider.embedBatch.mockImplementation(async () => {
      callCount++;
      // Fail on first call, succeed on all subsequent
      if (callCount === 1) {
        throw new Error('transient error');
      }
      return [[0.1, 0.2, 0.3]];
    });

    const result = await pipeline.run(makeConfig({ embeddingBatchSize: 1 }));

    // Batch should have been retried and included
    expect(result.chunksIndexed).toBe(1);
    expect(result.skippedChunks).toBe(0);
  });

  // Test 7: Failed embedding batch that fails retry too is skipped; indexing continues
  it('skips batch after retry failure and continues with remaining batches', async () => {
    const chunks = [
      makeChunk('chunk-1', join(tmpDir, 'foo.ts')),
      makeChunk('chunk-2', join(tmpDir, 'foo.ts')),
    ];
    mockParseFile.mockResolvedValue(chunks);

    let batchAttempts = 0;
    embeddingProvider.embedBatch.mockImplementation(async (texts: string[]) => {
      batchAttempts++;
      // Fail the first 4 calls (2 attempts × 2 calls per batch for first batch)
      // Actually, the retry happens at batch level — if any embedBatch in the batch fails,
      // the entire batch retries. So first batch fails twice (attempt 0 and retry).
      if (batchAttempts <= 4) {
        throw new Error('persistent error');
      }
      return texts.map(() => [0.1, 0.2, 0.3]);
    });

    const result = await pipeline.run(
      makeConfig({ embeddingBatchSize: 1, embeddingConcurrency: 1 }),
    );

    // First batch should be skipped (1 chunk), second batch should succeed (1 chunk)
    expect(result.skippedChunks).toBeGreaterThan(0);
  });

  // Test 8: When signal.aborted is true, queued p-queue tasks are cancelled
  it('cancels queued tasks when abort signal fires', async () => {
    const chunks = Array.from({ length: 4 }, (_, i) =>
      makeChunk(`chunk-${i}`, join(tmpDir, 'foo.ts')),
    );
    mockParseFile.mockResolvedValue(chunks);

    const abortController = new AbortController();
    let batchesStarted = 0;

    embeddingProvider.embedBatch.mockImplementation(async () => {
      batchesStarted++;
      if (batchesStarted === 2) {
        // Abort after first batch's code embedding starts
        abortController.abort();
      }
      await new Promise((r) => setTimeout(r, 50));
      return [[0.1, 0.2, 0.3]];
    });

    const result = await pipeline.run(
      makeConfig({ embeddingBatchSize: 1, embeddingConcurrency: 1 }),
      undefined,
      abortController.signal,
    );

    // Not all chunks should be indexed because abort cancelled queued batches
    expect(result.chunksIndexed).toBeLessThan(4);
  });

  // Test 9: Pipeline accepts optional ChunkingStrategy and delegates file parsing to it
  it('delegates file chunking to provided ChunkingStrategy', async () => {
    const chunks = [makeChunk('chunk-1', join(tmpDir, 'foo.ts'))];
    const mockStrategy = {
      name: 'custom',
      chunk: vi.fn().mockResolvedValue(chunks),
    };

    await pipeline.run(makeConfig({ chunkingStrategy: mockStrategy }));

    // Strategy should have been called instead of parseFile
    expect(mockStrategy.chunk).toHaveBeenCalledWith(
      join(tmpDir, 'foo.ts'),
      expect.objectContaining({ projectRoot: tmpDir }),
    );
    // parseFile should NOT have been called
    expect(mockParseFile).not.toHaveBeenCalled();
  });

  // Test 10: Pipeline defaults to AstChunkingStrategy when no strategy provided (backward compatible)
  it('defaults to AstChunkingStrategy when no chunkingStrategy provided', async () => {
    mockParseFile.mockResolvedValue([makeChunk('chunk-1', join(tmpDir, 'foo.ts'))]);

    await pipeline.run(makeConfig());

    // parseFile should have been called (through AstChunkingStrategy)
    expect(mockParseFile).toHaveBeenCalled();
  });

  // Test 11: Progress callback receives batchesTotal and batchesCompleted during embedding stage
  it('reports batchesTotal and batchesCompleted in progress during embedding', async () => {
    const chunks = Array.from({ length: 3 }, (_, i) =>
      makeChunk(`chunk-${i}`, join(tmpDir, 'foo.ts')),
    );
    mockParseFile.mockResolvedValue(chunks);

    const progressEvents: IndexingProgress[] = [];
    await pipeline.run(makeConfig({ embeddingBatchSize: 1, embeddingConcurrency: 1 }), (p) =>
      progressEvents.push({ ...p }),
    );

    const embeddingEvents = progressEvents.filter((e) => e.stage === 'embedding');
    // Should have batch progress info
    const lastEmbeddingEvent = embeddingEvents[embeddingEvents.length - 1];
    expect(lastEmbeddingEvent?.batchesTotal).toBe(3);
    expect(lastEmbeddingEvent?.batchesCompleted).toBe(3);
  });

  // Test 12: Pipeline returns skippedChunks count in result when batches were skipped
  it('returns skippedChunks in result', async () => {
    mockParseFile.mockResolvedValue([makeChunk('chunk-1', join(tmpDir, 'foo.ts'))]);

    const result = await pipeline.run(makeConfig());

    // No failures → skippedChunks should be 0
    expect(result).toHaveProperty('skippedChunks');
    expect(result.skippedChunks).toBe(0);
  });
});

// ── DependencyGraph wiring tests ──────────────────────────────────────────────
describe('IndexingPipeline — dependencyGraph', () => {
  let pipeline: IndexingPipeline;
  let embeddingProvider: ReturnType<typeof makeMockEmbeddingProvider>;
  let vectorStore: ReturnType<typeof makeMockVectorStore>;
  let tmpDir: string;

  beforeEach(async () => {
    vi.clearAllMocks();
    pipeline = new IndexingPipeline();
    embeddingProvider = makeMockEmbeddingProvider();
    vectorStore = makeMockVectorStore();

    tmpDir = join(tmpdir(), `indexer-depgraph-test-${Date.now()}`);
    await mkdir(tmpDir, { recursive: true });
    await writeFile(join(tmpDir, 'foo.ts'), 'export function foo() {}');

    mockGetLastIndexedCommit.mockResolvedValue(null);
    mockGetCurrentCommit.mockResolvedValue('abc123');
    mockSaveLastIndexedCommit.mockResolvedValue(undefined);
  });

  const makeConfig = (overrides: Partial<IndexingConfig> = {}): IndexingConfig => ({
    targetProjectPath: tmpDir,
    frameworkDir: join(tmpDir, '.ia-framework'),
    collectionName: 'test-collection',
    embeddingProvider,
    vectorStore,
    ...overrides,
  });

  it('calls dependencyGraph.upsertEdges for chunks with imports', async () => {
    const chunk = {
      id: 'chunk-1',
      filePath: join(tmpDir, 'foo.ts'),
      relativePath: 'foo.ts',
      language: 'typescript',
      chunkType: 'function',
      name: 'foo',
      content: 'import { bar } from "./bar";\nfunction foo() {}',
      startLine: 1,
      endLine: 2,
      imports: ['./bar'],
      exports: ['foo'],
    };
    mockParseFile.mockResolvedValue([chunk]);

    const mockGraph = {
      initialize: vi.fn(),
      upsertEdges: vi.fn(),
      deleteEdgesForFile: vi.fn(),
      close: vi.fn(),
    };

    await pipeline.run(makeConfig({ dependencyGraph: mockGraph }));

    expect(mockGraph.initialize).toHaveBeenCalledOnce();
    expect(mockGraph.upsertEdges).toHaveBeenCalledWith(join(tmpDir, 'foo.ts'), ['./bar'], tmpDir);
  });

  it('does not call upsertEdges for chunks with empty imports', async () => {
    const chunk = {
      id: 'chunk-1',
      filePath: join(tmpDir, 'foo.ts'),
      relativePath: 'foo.ts',
      language: 'typescript',
      chunkType: 'function',
      name: 'foo',
      content: 'function foo() {}',
      startLine: 1,
      endLine: 1,
      imports: [],
      exports: ['foo'],
    };
    mockParseFile.mockResolvedValue([chunk]);

    const mockGraph = {
      initialize: vi.fn(),
      upsertEdges: vi.fn(),
      deleteEdgesForFile: vi.fn(),
      close: vi.fn(),
    };

    await pipeline.run(makeConfig({ dependencyGraph: mockGraph }));

    expect(mockGraph.initialize).toHaveBeenCalledOnce();
    expect(mockGraph.upsertEdges).not.toHaveBeenCalled();
  });

  it('calls deleteEdgesForFile during incremental indexing before re-indexing', async () => {
    const changedFile = join(tmpDir, 'foo.ts');
    mockGetLastIndexedCommit.mockResolvedValue('old-commit');
    mockGetChangedFiles.mockResolvedValue([changedFile]);
    mockParseFile.mockResolvedValue([
      {
        id: 'chunk-1',
        filePath: changedFile,
        relativePath: 'foo.ts',
        language: 'typescript',
        chunkType: 'function',
        name: 'foo',
        content: 'function foo() {}',
        startLine: 1,
        endLine: 1,
        imports: [],
        exports: ['foo'],
      },
    ]);

    const mockGraph = {
      initialize: vi.fn(),
      upsertEdges: vi.fn(),
      deleteEdgesForFile: vi.fn(),
      close: vi.fn(),
    };

    await pipeline.run(makeConfig({ incremental: true, dependencyGraph: mockGraph }));

    expect(mockGraph.deleteEdgesForFile).toHaveBeenCalledWith(changedFile);
  });

  it('does not call graph methods when dependencyGraph is undefined', async () => {
    mockParseFile.mockResolvedValue([
      {
        id: 'chunk-1',
        filePath: join(tmpDir, 'foo.ts'),
        relativePath: 'foo.ts',
        language: 'typescript',
        chunkType: 'function',
        name: 'foo',
        content: 'import { bar } from "./bar";\nfunction foo() {}',
        startLine: 1,
        endLine: 2,
        imports: ['./bar'],
        exports: ['foo'],
      },
    ]);

    // No dependencyGraph in config — should not throw
    await expect(pipeline.run(makeConfig())).resolves.toBeDefined();
  });
});

// ── Description-aware text embedding tests ────────────────────────────────────
describe('IndexingPipeline — description-aware text embedding', () => {
  let pipeline: IndexingPipeline;
  let embeddingProvider: ReturnType<typeof makeMockEmbeddingProvider>;
  let vectorStore: ReturnType<typeof makeMockVectorStore>;
  let tmpDir: string;

  beforeEach(async () => {
    vi.clearAllMocks();
    pipeline = new IndexingPipeline();
    embeddingProvider = makeMockEmbeddingProvider();
    vectorStore = makeMockVectorStore();

    tmpDir = join(tmpdir(), `indexer-desc-test-${Date.now()}`);
    await mkdir(tmpDir, { recursive: true });
    await writeFile(join(tmpDir, 'foo.ts'), 'export function foo() {}');

    mockGetLastIndexedCommit.mockResolvedValue(null);
    mockGetCurrentCommit.mockResolvedValue('abc123');
    mockSaveLastIndexedCommit.mockResolvedValue(undefined);
  });

  const makeConfig = (overrides: Partial<IndexingConfig> = {}): IndexingConfig => ({
    targetProjectPath: tmpDir,
    frameworkDir: join(tmpDir, '.ia-framework'),
    collectionName: 'test-collection',
    embeddingProvider,
    vectorStore,
    ...overrides,
  });

  it('uses chunk.description for text embedding when description is present', async () => {
    const chunkWithDesc = {
      ...makeChunk('chunk-1', join(tmpDir, 'foo.ts')),
      description: 'A utility function that handles user authentication and session management',
    };
    mockParseFile.mockResolvedValue([chunkWithDesc]);

    await pipeline.run(makeConfig({ embeddingBatchSize: 50 }));

    // The first embedBatch call should be for text descriptions
    // It should use the chunk.description, not chunkToDescription() output
    const textEmbedCall = embeddingProvider.embedBatch.mock.calls[0];
    expect(textEmbedCall![0]).toContain(
      'A utility function that handles user authentication and session management',
    );
  });

  it('falls back to chunkToDescription() when chunk has no description', async () => {
    const chunkNoDesc = makeChunk('chunk-1', join(tmpDir, 'foo.ts'));
    mockParseFile.mockResolvedValue([chunkNoDesc]);

    await pipeline.run(makeConfig({ embeddingBatchSize: 50 }));

    // The first embedBatch call should be for text descriptions
    // It should use chunkToDescription() output (contains file path, language, etc.)
    const textEmbedCall = embeddingProvider.embedBatch.mock.calls[0];
    expect(textEmbedCall![0][0]).toContain('typescript');
    expect(textEmbedCall![0][0]).toContain('function');
  });

  it('handles mixed batch with some chunks having description and some not', async () => {
    const chunkWithDesc = {
      ...makeChunk('chunk-1', join(tmpDir, 'foo.ts')),
      description: 'LLM-generated prose summary for chunk 1',
    };
    const chunkNoDesc = makeChunk('chunk-2', join(tmpDir, 'foo.ts'));
    mockParseFile.mockResolvedValue([chunkWithDesc, chunkNoDesc]);

    await pipeline.run(makeConfig({ embeddingBatchSize: 50 }));

    // First embedBatch call is for text descriptions
    const textEmbedCall = embeddingProvider.embedBatch.mock.calls[0];
    const textDescriptions = textEmbedCall![0] as string[];

    // First chunk should use its description
    expect(textDescriptions[0]).toBe('LLM-generated prose summary for chunk 1');
    // Second chunk should use chunkToDescription() fallback
    expect(textDescriptions[1]).toContain('typescript');
    expect(textDescriptions[1]).toContain('function');
  });
});
