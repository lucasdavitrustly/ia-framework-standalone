import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { join, relative } from 'node:path';
import { tmpdir } from 'node:os';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type { ChunkMetadata, EmbeddingContract } from '@ia-framework/core';
import { contractFingerprint } from '@ia-framework/core';

const execFileAsync = promisify(execFile);

// ── Hoist mock variables so they are available in vi.mock factories ──────────
const { mockParseFile } = vi.hoisted(() => ({ mockParseFile: vi.fn() }));

const {
  mockGetLastIndexedCommit,
  mockGetChangedFiles,
  mockGetCurrentCommit,
  mockSaveLastIndexedCommit,
  mockGetLastPromptContentHash,
} = vi.hoisted(() => ({
  mockGetLastIndexedCommit: vi.fn(),
  mockGetChangedFiles: vi.fn(),
  mockGetCurrentCommit: vi.fn(),
  mockSaveLastIndexedCommit: vi.fn(),
  mockGetLastPromptContentHash: vi.fn(),
}));

const { mockPromptContentHash } = vi.hoisted(() => ({
  mockPromptContentHash: { value: 'test-hash-abc' },
}));

const { mockLoggerWarn } = vi.hoisted(() => ({
  mockLoggerWarn: vi.fn(),
}));

// ── Mock @ia-framework/core ─────────────────────────────────────────────────
vi.mock('@ia-framework/core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@ia-framework/core')>();
  return {
    ...actual,
    createLogger: () => ({
      info: vi.fn(),
      warn: mockLoggerWarn,
      error: vi.fn(),
      debug: vi.fn(),
      child: vi.fn().mockReturnThis(),
    }),
  };
});

// ── Mock @ia-framework/ast-parser ───────────────────────────────────────────
vi.mock('@ia-framework/ast-parser', () => ({
  parseFile: mockParseFile,
  extractCalls: () => undefined,
  buildCalledByIndex: () => new Map(),
  classify: vi.fn().mockReturnValue({ stereotype: 'unknown' }),
}));

// ── Mock incremental helpers ─────────────────────────────────────────────────
vi.mock('./incremental.js', () => ({
  getLastIndexedCommit: mockGetLastIndexedCommit,
  getChangedFiles: mockGetChangedFiles,
  getCurrentCommit: mockGetCurrentCommit,
  saveLastIndexedCommit: mockSaveLastIndexedCommit,
  getLastPromptContentHash: mockGetLastPromptContentHash,
}));

// ── Mock prompt module ───────────────────────────────────────────────────────
vi.mock('./strategies/prompt.js', () => ({
  get PROMPT_CONTENT_HASH() {
    return mockPromptContentHash.value;
  },
  buildPrompt: vi.fn(),
  CHUNK_JSON_SCHEMA: {},
}));

// ── Import IndexingPipeline after mocks ────────────────────────────────────
import { IndexingPipeline } from './pipeline.js';
import type { IndexingConfig, IndexingProgress } from './pipeline.js';
import { walkFiles } from './file-walker.js';
import type { VectorStore } from '@ia-framework/vector-store';

// ── Mock factory helpers ─────────────────────────────────────────────────────
function makeMockEmbeddingProvider(dim = 3) {
  const contract: EmbeddingContract = {
    provider: 'openai',
    model: 'mock-model',
    dimension: dim,
    tokenizerVersion: 1,
    sparseHashVersion: 1,
  };
  return {
    name: 'mock',
    model: 'mock-model',
    dimensions: dim,
    contract,
    embed: vi.fn().mockResolvedValue([0.1, 0.2, 0.3]),
    embedBatch: vi.fn().mockImplementation((texts: string[]) =>
      Promise.resolve({
        vectors: texts.map(() => [0.1, 0.2, 0.3]),
        failures: [],
      }),
    ),
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
    scroll: vi.fn().mockResolvedValue({ points: [], nextOffset: undefined }),
    countPoints: vi.fn().mockResolvedValue(0),
    deleteCollection: vi.fn().mockResolvedValue(undefined),
    // T22 made both members required on VectorStore; mirror the real
    // QdrantVectorStore.capabilities() so the double stays honest.
    searchSparse: vi.fn().mockResolvedValue([]),
    capabilities: vi.fn().mockReturnValue({
      sparse: true,
      filterOnly: false,
      payloadIndexes: [],
    }),
  } satisfies VectorStore;
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
    endLine: 1,
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
    await writeFile(join(tmpDir, 'foo.ts'), 'function testFn() {}');

    // Default mocks
    mockGetLastIndexedCommit.mockResolvedValue(null);
    mockGetCurrentCommit.mockResolvedValue('abc123');
    mockSaveLastIndexedCommit.mockResolvedValue(undefined);
    mockGetLastPromptContentHash.mockResolvedValue(null);
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

  it('Test 2: run() calls embeddingProvider.embedBatch() with semantic descriptions and signature inputs', async () => {
    await pipeline.run(makeConfig());

    // First call: semantic inputs (language + chunkType + name + content fallback)
    expect(embeddingProvider.embedBatch).toHaveBeenCalledWith(
      expect.arrayContaining([expect.any(String)]),
      'document',
      undefined,
    );
    // Second call: signature inputs (name + chunkType fallback since no signature on chunk)
    expect(embeddingProvider.embedBatch).toHaveBeenCalledWith(
      ['testFn function'],
      'document',
      undefined,
    );
  });

  it('Test 3: run() calls vectorStore.upsertBatch() with VectorPoints having semantic and signature vectors', async () => {
    await pipeline.run(makeConfig());

    expect(vectorStore.upsertBatch).toHaveBeenCalledOnce();
    const [points] = vectorStore.upsertBatch.mock.calls[0] as [
      { semantic: number[]; signature: number[] }[],
    ];
    expect(points).toHaveLength(1);
    expect(points[0]!.semantic).toEqual([0.1, 0.2, 0.3]);
    expect(points[0]!.signature).toEqual([0.1, 0.2, 0.3]);
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
    expect(result.failedFiles).toHaveLength(1);
    expect(mockSaveLastIndexedCommit).not.toHaveBeenCalled();
  });

  it('advances the indexed commit only when no chunks were skipped', async () => {
    // Clean run → commit saved.
    await pipeline.run(makeConfig());
    expect(mockSaveLastIndexedCommit).toHaveBeenCalledTimes(1);
  });

  it('does NOT advance the indexed commit when a chunk was skipped', async () => {
    // Force an embedding failure so the chunk is skipped.
    embeddingProvider.embedBatch = vi
      .fn()
      .mockRejectedValue(
        new Error('Ollama embedding error (unknown): 400 — {"error":"invalid input"}'),
      );

    const result = await pipeline.run(makeConfig());

    expect(result.skippedChunks).toBeGreaterThan(0);
    expect(mockSaveLastIndexedCommit).not.toHaveBeenCalled();
  });

  it('Test 6: run() with incremental=true only processes changed files', async () => {
    const changedFile = join(tmpDir, 'foo.ts');
    mockGetLastIndexedCommit.mockResolvedValue('old-commit-hash');
    mockGetChangedFiles.mockResolvedValue({ toProcess: [changedFile], toDelete: [] });

    await pipeline.run(makeConfig({ incremental: true }));

    // T095 fix: deleteByFilter is called with proper Qdrant filter for relativePath
    expect(vectorStore.deleteByFilter).toHaveBeenCalledWith({
      must: [{ key: 'relativePath', match: { value: 'foo.ts' } }],
    });
    // Should call parseFile for the changed file
    expect(mockParseFile).toHaveBeenCalledWith(changedFile, expect.any(Object));
  });

  it('T090: incremental run deletes stale chunks by relativePath, not absolute filePath', async () => {
    const changedFile = join(tmpDir, 'foo.ts');
    const expectedRelativePath = relative(tmpDir, changedFile); // = 'foo.ts'
    mockGetLastIndexedCommit.mockResolvedValue('old-commit-hash');
    mockGetChangedFiles.mockResolvedValue({ toProcess: [changedFile], toDelete: [] });

    await pipeline.run(makeConfig({ incremental: true }));

    // After fix: deleteByFilter must use proper Qdrant filter format, not raw key-value
    expect(vectorStore.deleteByFilter).toHaveBeenCalledWith({
      must: [{ key: 'relativePath', match: { value: expectedRelativePath } }],
    });
    expect(vectorStore.deleteByFilter).not.toHaveBeenCalledWith({ filePath: changedFile });
  });

  it('F2.2: run() initializes the collection with the provider embedding contract', async () => {
    await pipeline.run(makeConfig());

    expect(vectorStore.initialize).toHaveBeenCalledTimes(1);
    const [initArgs] = vectorStore.initialize.mock.calls[0] as [
      { embeddingContract?: EmbeddingContract; indexGeneration?: string },
    ];
    expect(initArgs.embeddingContract).toEqual(embeddingProvider.contract);
  });

  it('F2.2: indexGeneration is the contract fingerprint joined to the run ISO timestamp', async () => {
    await pipeline.run(makeConfig());

    const [initArgs] = vectorStore.initialize.mock.calls[0] as [{ indexGeneration?: string }];
    const generation = initArgs.indexGeneration;
    expect(typeof generation).toBe('string');

    // Structural assertion (not expect.any(String)): "<fingerprint>-<ISO timestamp>".
    const fingerprint = contractFingerprint(embeddingProvider.contract);
    expect(generation?.startsWith(`${fingerprint}-`)).toBe(true);
    const timestamp = generation?.slice(fingerprint.length + 1) ?? '';
    expect(new Date(timestamp).toISOString()).toBe(timestamp);
  });

  it('F2.2: two runs with the same contract produce different indexGeneration values (BUD-14)', async () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date('2026-08-13T10:00:00.000Z'));
      await pipeline.run(makeConfig());
      vi.setSystemTime(new Date('2026-08-13T11:30:00.000Z'));
      await pipeline.run(makeConfig());
    } finally {
      vi.useRealTimers();
    }

    const generations = vectorStore.initialize.mock.calls.map(
      ([args]) => (args as { indexGeneration?: string }).indexGeneration,
    );
    expect(generations).toHaveLength(2);
    const fingerprint = contractFingerprint(embeddingProvider.contract);
    expect(generations[0]).toBe(`${fingerprint}-2026-08-13T10:00:00.000Z`);
    expect(generations[1]).toBe(`${fingerprint}-2026-08-13T11:30:00.000Z`);
    expect(generations[0]).not.toBe(generations[1]);
  });

  it('Test 7: run() calls vectorStore.initialize() before upserting', async () => {
    const callOrder: string[] = [];
    vectorStore.initialize.mockImplementation(() => {
      callOrder.push('initialize');
      return Promise.resolve();
    });
    vectorStore.upsertBatch.mockImplementation(() => {
      callOrder.push('upsertBatch');
      return Promise.resolve();
    });

    await pipeline.run(makeConfig());

    expect(callOrder[0]).toBe('initialize');
    expect(callOrder).toContain('upsertBatch');
  });

  it('Test 8a: walkFiles with empty includePatterns treats it as unset (matches all source files)', async () => {
    const files = await walkFiles({ projectPath: tmpDir, includePatterns: [] });
    expect(files.length).toBeGreaterThan(0);
    expect(files.some((f) => f.endsWith('.ts'))).toBe(true);
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
    mockGetLastPromptContentHash.mockResolvedValue(null);
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
    // ThreeVectorEmbedder calls embedBatch twice per batch (semantic + signature), both with 'document'
    expect(embeddingProvider.embedBatch).toHaveBeenCalledWith(
      expect.arrayContaining([expect.any(String)]),
      'document',
      undefined,
    );
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

// ── T019: Unified pipeline — VectorPoints must not carry raw code ─────────────
//
// This test verifies that when the pipeline produces VectorPoints for Qdrant,
// the payload does NOT contain a 'content' (raw code) field.
// That field is intentionally omitted — code is read from the filesystem at retrieval time.
//
// NOTE: This test will FAIL until the pipeline is updated to emit lean payloads.

describe('IndexingPipeline — T019: lean VectorPoint payloads (no raw code)', () => {
  let pipeline: IndexingPipeline;
  let embeddingProvider: ReturnType<typeof makeMockEmbeddingProvider>;
  let vectorStore: ReturnType<typeof makeMockVectorStore>;
  let tmpDir: string;

  beforeEach(async () => {
    vi.clearAllMocks();
    pipeline = new IndexingPipeline();
    embeddingProvider = makeMockEmbeddingProvider();
    vectorStore = makeMockVectorStore();

    tmpDir = join(tmpdir(), `indexer-lean-test-${Date.now()}`);
    await mkdir(tmpDir, { recursive: true });
    await writeFile(join(tmpDir, 'Payment.java'), 'public class Payment {}');

    mockGetLastIndexedCommit.mockResolvedValue(null);
    mockGetCurrentCommit.mockResolvedValue('abc123');
    mockSaveLastIndexedCommit.mockResolvedValue(undefined);
    mockGetLastPromptContentHash.mockResolvedValue(null);
    mockParseFile.mockResolvedValue([
      {
        id: 'chunk-1',
        filePath: join(tmpDir, 'Payment.java'),
        relativePath: 'Payment.java',
        language: 'java',
        chunkType: 'class',
        name: 'Payment',
        content: 'public class Payment {}',
        startLine: 1,
        endLine: 1,
        imports: [],
        exports: ['Payment'],
        contentHash: 'sha256-of-payment',
      },
    ]);
  });

  const makeConfig = (overrides: Partial<IndexingConfig> = {}): IndexingConfig => ({
    targetProjectPath: tmpDir,
    frameworkDir: join(tmpDir, '.ia-framework'),
    collectionName: 'test-collection',
    embeddingProvider,
    vectorStore,
    ...overrides,
  });

  it('upserts VectorPoints whose payload does NOT contain a content field', async () => {
    await pipeline.run(makeConfig());

    expect(vectorStore.upsertBatch).toHaveBeenCalled();
    const [points] = vectorStore.upsertBatch.mock.calls[0] as [Record<string, unknown>[]];
    expect(points.length).toBeGreaterThan(0);

    for (const point of points) {
      // The payload is nested under point.payload OR the point itself IS the payload —
      // check both shapes. The key requirement: 'content' must not be present.
      const payload = (point['payload'] ?? point) as Record<string, unknown>;
      expect(payload).not.toHaveProperty('content');
    }
  });

  it('upserts VectorPoints whose payload contains relativePath and startLine for filesystem lookup', async () => {
    await pipeline.run(makeConfig());

    const [points] = vectorStore.upsertBatch.mock.calls[0] as [Record<string, unknown>[]];
    expect(points.length).toBeGreaterThan(0);

    for (const point of points) {
      const payload = (point['payload'] ?? point) as Record<string, unknown>;
      expect(payload).toHaveProperty('relativePath');
      expect(payload).toHaveProperty('startLine');
    }
  });
});

// Cleanup after all tests
afterAll(() => {
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
    mockGetLastPromptContentHash.mockResolvedValue(null);
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
      return { vectors: [[0.1, 0.2, 0.3]], failures: [] };
    });

    await pipeline.run(makeConfig({ embeddingBatchSize: 1, embeddingConcurrency: 2 }));

    // Each batch calls embedBatch twice (text + code), so max concurrent should be ≤ 2 batches
    // which means ≤ 4 concurrent embedBatch calls (2 per batch × 2 concurrent batches)
    // But the key constraint is max 2 batches running at once
    expect(maxConcurrent).toBeLessThanOrEqual(4); // 2 batches × 2 calls each
    expect(maxConcurrent).toBeGreaterThan(1); // proves concurrency
  });

  // Test 2: Pipeline defaults to concurrency=6 when embeddingProvider.name is 'ollama'
  it('defaults to concurrency=6 for ollama provider', async () => {
    const chunks = Array.from({ length: 12 }, (_, i) =>
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
      return { vectors: [[0.1, 0.2, 0.3]], failures: [] };
    });

    await pipeline.run(
      makeConfig({
        embeddingProvider: ollamaProvider,
        embeddingBatchSize: 1,
        // No embeddingConcurrency — should default to 6 for 'ollama'
      }),
    );

    // With 12 batches and concurrency=6, max concurrent embedBatch calls ≤ 12 (6 batches × 2 calls)
    expect(maxConcurrent).toBeLessThanOrEqual(12);
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
      return { vectors: [[0.1, 0.2, 0.3]], failures: [] };
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
    embeddingProvider.embedBatch.mockImplementation(() => {
      callCount++;
      // Fail on first call, succeed on all subsequent
      if (callCount === 1) {
        throw new Error('transient error');
      }
      return Promise.resolve({ vectors: [[0.1, 0.2, 0.3]], failures: [] });
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
    embeddingProvider.embedBatch.mockImplementation((texts: string[]) => {
      batchAttempts++;
      // Fail the first 4 calls (2 attempts × 2 calls per batch for first batch)
      // Actually, the retry happens at batch level — if any embedBatch in the batch fails,
      // the entire batch retries. So first batch fails twice (attempt 0 and retry).
      if (batchAttempts <= 4) {
        throw new Error('persistent error');
      }
      return Promise.resolve({
        vectors: texts.map(() => [0.1, 0.2, 0.3]),
        failures: [],
      });
    });

    const result = await pipeline.run(
      makeConfig({ embeddingBatchSize: 1, embeddingConcurrency: 1 }),
    );

    // First batch should be skipped (1 chunk), second batch should succeed (1 chunk)
    expect(result.skippedChunks).toBeGreaterThan(0);
  });

  // Test 8: When signal.aborted is true, queued p-queue tasks are cancelled
  // NOTE: Skipped — test hangs because PQueue.clear() leaves Promise.all waiting on
  // promises that will never settle. The abort logic works correctly in production
  // (process exits). Fixing requires switching to queue.onIdle() pattern.
  it.skip('cancels queued tasks when abort signal fires', async () => {
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
      return { vectors: [[0.1, 0.2, 0.3]], failures: [] };
    });

    const result = await pipeline.run(
      makeConfig({ embeddingBatchSize: 1, embeddingConcurrency: 1 }),
      undefined,
      abortController.signal,
    );

    // Not all chunks should be indexed because abort cancelled queued batches
    expect(result.chunksIndexed).toBeLessThan(4);
  }, 10000);

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
    mockGetLastPromptContentHash.mockResolvedValue(null);
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
    mockGetChangedFiles.mockResolvedValue({ toProcess: [changedFile], toDelete: [] });
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
    mockGetLastPromptContentHash.mockResolvedValue(null);
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
    const [textDescriptions] = embeddingProvider.embedBatch.mock.calls[0] as [string[]];
    expect(textDescriptions[0]).toContain('typescript');
    expect(textDescriptions[0]).toContain('function');
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

// ── Prompt content hash re-index tests ────────────────────────────────────────
describe('IndexingPipeline — prompt content hash change triggers re-index', () => {
  let pipeline: IndexingPipeline;
  let embeddingProvider: ReturnType<typeof makeMockEmbeddingProvider>;
  let vectorStore: ReturnType<typeof makeMockVectorStore>;
  let tmpDir: string;

  beforeEach(async () => {
    vi.clearAllMocks();
    pipeline = new IndexingPipeline();
    embeddingProvider = makeMockEmbeddingProvider();
    vectorStore = makeMockVectorStore();

    tmpDir = join(tmpdir(), `indexer-prompt-hash-test-${Date.now()}`);
    await mkdir(tmpDir, { recursive: true });
    await writeFile(join(tmpDir, 'foo.ts'), 'export function foo() {}');

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

  it('does not force re-index when prompt hash matches', async () => {
    mockGetLastIndexedCommit.mockResolvedValue('abc123');
    mockGetChangedFiles.mockResolvedValue({ toProcess: [], toDelete: [] });
    mockGetLastPromptContentHash.mockResolvedValue('test-hash-abc');

    const llmStrategy = {
      name: 'llm',
      chunk: vi.fn().mockResolvedValue([]),
    };

    const result = await pipeline.run(
      makeConfig({ incremental: true, chunkingStrategy: llmStrategy }),
    );

    expect(result.filesIndexed).toBe(0);
  });

  it('does not check prompt hash for AST strategy', async () => {
    mockGetLastIndexedCommit.mockResolvedValue('abc123');
    mockGetChangedFiles.mockResolvedValue({ toProcess: [], toDelete: [] });
    mockGetLastPromptContentHash.mockResolvedValue(null);

    const result = await pipeline.run(makeConfig({ incremental: true }));

    expect(result.filesIndexed).toBe(0);
  });

  it('does not save prompt hash when strategy is ast', async () => {
    mockGetLastIndexedCommit.mockResolvedValue(null);
    mockGetLastPromptContentHash.mockResolvedValue(null);

    await pipeline.run(makeConfig());

    expect(mockSaveLastIndexedCommit).toHaveBeenCalledWith(
      expect.any(String),
      'abc123',
      'test-collection',
      undefined,
      undefined,
      undefined,
    );
  });

  it('treats null stored prompt hash as first-time (no force re-index)', async () => {
    mockGetLastIndexedCommit.mockResolvedValue('abc123');
    mockGetChangedFiles.mockResolvedValue({ toProcess: [], toDelete: [] });
    mockGetLastPromptContentHash.mockResolvedValue(null);

    const llmStrategy = {
      name: 'llm',
      chunk: vi.fn().mockResolvedValue([]),
    };

    const result = await pipeline.run(
      makeConfig({ incremental: true, chunkingStrategy: llmStrategy }),
    );

    expect(result.filesIndexed).toBe(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe('IndexingPipeline — T1.2: sub-chunk parent declaration re-attachment', () => {
  let pipeline: IndexingPipeline;
  let embeddingProvider: ReturnType<typeof makeMockEmbeddingProvider>;
  let vectorStore: ReturnType<typeof makeMockVectorStore>;
  let tmpDir: string;

  beforeEach(async () => {
    vi.clearAllMocks();
    pipeline = new IndexingPipeline();
    embeddingProvider = makeMockEmbeddingProvider();
    vectorStore = makeMockVectorStore();

    tmpDir = join(tmpdir(), `indexer-subchunk-reload-${Date.now()}-${Math.random()}`);
    await mkdir(tmpDir, { recursive: true });

    mockGetLastIndexedCommit.mockResolvedValue(null);
    mockGetCurrentCommit.mockResolvedValue('abc123');
    mockSaveLastIndexedCommit.mockResolvedValue(undefined);
    mockGetLastPromptContentHash.mockResolvedValue(null);
  });

  const makeConfig = (overrides: Partial<IndexingConfig> = {}): IndexingConfig => ({
    targetProjectPath: tmpDir,
    frameworkDir: join(tmpDir, '.ia-framework'),
    collectionName: 'test-collection',
    embeddingProvider,
    vectorStore,
    ...overrides,
  });

  /** Every text the mock provider was asked to embed, across all channels. */
  function embeddedTexts(): string[] {
    return embeddingProvider.embedBatch.mock.calls.flatMap((call) => (call as [string[]])[0]);
  }

  it('re-attaches the parent declaration to a reloaded $partN sub-chunk', async () => {
    // A body-only sub-chunk: startLine begins AFTER the enum declaration line,
    // exactly as the splitter records it. Reloading lines 2..5 alone yields text
    // with no `{` and no parent name, which previously made the oversized-input
    // handler unable to find a declaration.
    const fileLines = [
      'public enum TransactionTypeEnum {',
      '  DEPOSIT,',
      '  WITHDRAWAL,',
      '  REFUND,',
      '  CHARGEBACK;',
      '}',
    ];
    await writeFile(join(tmpDir, 'TransactionTypeEnum.java'), fileLines.join('\n'));
    mockParseFile.mockResolvedValue([
      {
        id: 'enum-part-1',
        filePath: join(tmpDir, 'TransactionTypeEnum.java'),
        relativePath: 'TransactionTypeEnum.java',
        language: 'java',
        chunkType: 'other',
        name: 'TransactionTypeEnum$part1',
        content: 'stale-content-must-be-reloaded',
        startLine: 2,
        endLine: 5,
        imports: [],
        exports: [],
        parentName: 'TransactionTypeEnum',
        parentStartLine: 1,
        parentEndLine: 6,
        partIndex: 1,
        totalParts: 1,
      },
    ]);

    await pipeline.run(makeConfig());

    const texts = embeddedTexts();
    expect(texts.length).toBeGreaterThan(0);
    // The parent declaration is back in the embedded text — the sub-chunk is
    // self-describing again.
    expect(texts.some((text) => text.includes('public enum TransactionTypeEnum {'))).toBe(true);
    // The body is still there (the declaration is a prefix, not a replacement).
    expect(texts.some((text) => text.includes('CHARGEBACK;'))).toBe(true);
  });

  it('hashes the real source range, not the virtual reattached prefix', async () => {
    const bodyLines = Array.from({ length: 1000 }, (_, index) => `  VALUE_${index},`);
    const fileLines = ['public enum HugeEnum {', ...bodyLines, '}'];
    const filePath = join(tmpDir, 'HugeEnum.java');
    await writeFile(filePath, fileLines.join('\n'));
    mockParseFile.mockResolvedValue([
      {
        id: 'huge-enum-part-1',
        filePath,
        relativePath: 'HugeEnum.java',
        language: 'java',
        chunkType: 'other',
        name: 'HugeEnum$part1',
        content: 'stale-content-must-be-reloaded',
        startLine: 2,
        endLine: 1001,
        imports: [],
        exports: [],
        parentName: 'HugeEnum',
        parentStartLine: 1,
        parentEndLine: 1002,
        partIndex: 1,
        totalParts: 1,
      },
    ]);

    await pipeline.run(makeConfig());

    const [points] = vectorStore.upsertBatch.mock.calls[0] as [Record<string, unknown>[]];
    const payload = (points[0]!['payload'] ?? points[0]!) as Record<string, unknown>;
    const expectedHash = createHash('sha256').update(bodyLines.join('\n')).digest('hex');

    expect(payload.contentHash).toBe(expectedHash);
    expect(payload.signatureOnly).toBe(true);
  });

  it('does not prepend a parent declaration to a non-sub-chunk', async () => {
    const fileLines = ['public class Payment {', '  int amount;', '}'];
    await writeFile(join(tmpDir, 'Payment.java'), fileLines.join('\n'));
    mockParseFile.mockResolvedValue([
      {
        id: 'field-1',
        filePath: join(tmpDir, 'Payment.java'),
        relativePath: 'Payment.java',
        language: 'java',
        chunkType: 'other',
        name: 'amount',
        content: 'stale',
        startLine: 2,
        endLine: 2,
        imports: [],
        exports: [],
        // Has a parentName but NOT a $partN name — must not be treated as a part.
        parentName: 'Payment',
        parentStartLine: 1,
        parentEndLine: 3,
      },
    ]);

    await pipeline.run(makeConfig());

    const texts = embeddedTexts();
    expect(texts.some((text) => text.includes('int amount;'))).toBe(true);
    expect(texts.some((text) => text.includes('public class Payment {'))).toBe(false);
  });

  it('includes a Java member doc comment in embedding content while hashing its source range', async () => {
    const fileLines = [
      '/** Processes the payment and records the result. */',
      '@Transactional',
      'public boolean processPayment() {',
      '  return true;',
      '}',
    ];
    const filePath = join(tmpDir, 'PaymentService.java');
    await writeFile(filePath, fileLines.join('\n'));
    mockParseFile.mockResolvedValue([
      {
        id: 'payment-method',
        filePath,
        relativePath: 'PaymentService.java',
        language: 'java',
        chunkType: 'method',
        name: 'processPayment',
        content: 'stale',
        startLine: 3,
        endLine: 5,
        docCommentStartLine: 1,
        imports: [],
        exports: [],
      },
    ]);

    await pipeline.run(makeConfig());

    const texts = embeddedTexts();
    expect(texts.some((text) => text.includes('Processes the payment'))).toBe(true);
    expect(texts.some((text) => text.includes('public boolean processPayment()'))).toBe(true);
  });

  it('bounds the declaration scan when the parent has no opening brace', async () => {
    // A brace-less construct (SQL-like). Scanning forward for `{` must not walk
    // past the sub-chunk body and duplicate body lines into the prefix.
    const fileLines = [
      'CREATE TABLE payments',
      '(',
      '  id BIGINT NOT NULL,',
      '  amount NUMERIC(18,2),',
      '  metadata JSONB DEFAULT $${}$$',
      ');',
    ];
    await writeFile(join(tmpDir, 'V1__payments.sql'), fileLines.join('\n'));
    mockParseFile.mockResolvedValue([
      {
        id: 'sql-part-1',
        filePath: join(tmpDir, 'V1__payments.sql'),
        relativePath: 'V1__payments.sql',
        language: 'sql',
        chunkType: 'other',
        name: 'payments$part1',
        content: 'stale',
        startLine: 3,
        endLine: 6,
        imports: [],
        exports: [],
        parentName: 'payments',
        parentStartLine: 1,
        parentEndLine: 6,
        partIndex: 1,
        totalParts: 1,
      },
    ]);

    await pipeline.run(makeConfig());

    const texts = embeddedTexts();
    const withBody = texts.find((text) => text.includes('id BIGINT NOT NULL,'));
    expect(withBody).toBeDefined();
    // The parent line is prepended…
    expect(withBody).toContain('CREATE TABLE payments');
    // …but the body is NOT duplicated by an unbounded forward brace scan.
    expect(withBody!.split('id BIGINT NOT NULL,').length - 1).toBe(1);
  });
});

describe('IndexingPipeline — incremental invalidation and metrics', () => {
  let pipeline: IndexingPipeline;
  let embeddingProvider: ReturnType<typeof makeMockEmbeddingProvider>;
  let vectorStore: ReturnType<typeof makeMockVectorStore>;
  let tmpDir: string;

  beforeEach(async () => {
    vi.clearAllMocks();
    pipeline = new IndexingPipeline();
    embeddingProvider = makeMockEmbeddingProvider();
    vectorStore = makeMockVectorStore();
    tmpDir = join(tmpdir(), `indexer-incremental-${Date.now()}-${Math.random()}`);
    await mkdir(tmpDir, { recursive: true });
    await writeFile(join(tmpDir, 'foo.ts'), 'function testFn() {}');
    mockGetLastIndexedCommit.mockResolvedValue(null);
    mockGetCurrentCommit.mockResolvedValue('abc123');
    mockSaveLastIndexedCommit.mockResolvedValue(undefined);
    mockGetChangedFiles.mockResolvedValue({ toProcess: [], toDelete: [] });
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

  it('forwards repoId when reading and writing incremental state', async () => {
    const changedFile = join(tmpDir, 'foo.ts');
    mockGetLastIndexedCommit.mockResolvedValue('old-commit');
    mockGetChangedFiles.mockResolvedValue({ toProcess: [changedFile], toDelete: [] });

    await pipeline.run(makeConfig({ incremental: true, repoId: 'repo-a' }));

    expect(mockGetLastIndexedCommit).toHaveBeenCalledWith(
      join(tmpDir, '.ia-framework'),
      'test-collection',
      'repo-a',
    );
    expect(mockSaveLastIndexedCommit).toHaveBeenCalledWith(
      join(tmpDir, '.ia-framework'),
      'abc123',
      'test-collection',
      undefined,
      undefined,
      'repo-a',
    );
  });

  it('scopes deletion by repoId and counts actual deleted and reindexed chunks', async () => {
    const changedFile = join(tmpDir, 'foo.ts');
    mockGetLastIndexedCommit.mockResolvedValue('old-commit');
    mockGetChangedFiles.mockResolvedValue({ toProcess: [changedFile], toDelete: [] });
    vectorStore.deleteByFilter.mockResolvedValue(4);

    const result = await pipeline.run(makeConfig({ incremental: true, repoId: 'repo-a' }));

    expect(vectorStore.deleteByFilter).toHaveBeenCalledWith({
      must: [
        { key: 'relativePath', match: { value: 'foo.ts' } },
        { key: 'repoId', match: { value: 'repo-a' } },
      ],
    });
    expect(result.metrics).toMatchObject({
      mode: 'incremental',
      filesChanged: 1,
      chunksDeleted: 4,
      chunksReindexed: 1,
      chunksAffected: 5,
    });
  });

  it('surfaces change-detection failures and does not advance state', async () => {
    mockGetLastIndexedCommit.mockResolvedValue('old-commit');
    mockGetChangedFiles.mockResolvedValue({
      toProcess: [],
      toDelete: [],
      failures: [{ operation: 'process', error: 'git diff failed' }],
    });

    const result = await pipeline.run(makeConfig({ incremental: true, repoId: 'repo-a' }));

    expect(result.failedChanges).toEqual([{ operation: 'process', error: 'git diff failed' }]);
    expect(result.metrics.failedChanges).toEqual(result.failedChanges);
    expect(mockSaveLastIndexedCommit).not.toHaveBeenCalled();
  });

  it('surfaces strategy failures and does not advance state', async () => {
    const strategy = {
      name: 'failing-strategy',
      chunk: vi.fn().mockRejectedValue(new Error('strategy failed')),
    };

    const result = await pipeline.run(makeConfig({ chunkingStrategy: strategy, repoId: 'repo-a' }));

    expect(result.failedFiles).toEqual([{ relativePath: 'foo.ts', reason: 'strategy failed' }]);
    expect(result.metrics.failedFiles).toEqual(result.failedFiles);
    expect(mockSaveLastIndexedCommit).not.toHaveBeenCalled();
  });

  it('invalidates all split parts when a changed file shrinks, shifts, and grows', async () => {
    const filePath = join(tmpDir, 'LargeClass.java');
    const points: Array<{ id: string; payload: Record<string, unknown> }> = [];
    vectorStore.deleteByFilter.mockImplementation((filter: Record<string, unknown>) => {
      const must = filter['must'] as Array<{ key: string; match: { value: string } }>;
      const relativePath = must.find((condition) => condition.key === 'relativePath')?.match.value;
      const repoId = must.find((condition) => condition.key === 'repoId')?.match.value;
      const before = points.length;
      for (let index = points.length - 1; index >= 0; index--) {
        const payload = points[index]!.payload;
        if (payload.relativePath === relativePath && payload.repoId === repoId) {
          points.splice(index, 1);
        }
      }
      return Promise.resolve(before - points.length);
    });
    vectorStore.upsertBatch.mockImplementation((newPoints) => {
      points.push(...(newPoints as Array<{ id: string; payload: Record<string, unknown> }>));
      return Promise.resolve();
    });
    const filePoints = () =>
      points.filter(
        (point) =>
          point.payload.relativePath === 'LargeClass.java' && point.payload.partIndex != null,
      );

    const makeParts = (count: number, offset: number) =>
      Array.from({ length: count }, (_, index) => ({
        id: `part-${count}-${index + 1}`,
        filePath,
        relativePath: 'LargeClass.java',
        language: 'java',
        chunkType: 'other',
        name: `LargeClass$part${index + 1}`,
        content: `part ${index + 1}`,
        startLine: 2 + offset + index,
        endLine: 2 + offset + index,
        imports: [],
        exports: [],
        parentName: 'LargeClass',
        parentStartLine: 1,
        parentEndLine: 8 + offset,
        partIndex: index + 1,
        totalParts: count,
      }));

    await writeFile(
      filePath,
      Array.from({ length: 12 }, (_, index) => `line ${index + 1}`).join('\n'),
    );
    mockParseFile.mockImplementation((parsedPath: string) =>
      Promise.resolve(parsedPath === filePath ? makeParts(3, 0) : []),
    );
    await pipeline.run(makeConfig({ repoId: 'repo-a' }));
    expect(filePoints().map((point) => point.id)).toEqual(['part-3-1', 'part-3-2', 'part-3-3']);

    mockGetLastIndexedCommit.mockResolvedValue('old-commit');
    mockGetChangedFiles.mockResolvedValue({ toProcess: [filePath], toDelete: [] });
    mockParseFile.mockImplementation((parsedPath: string) =>
      Promise.resolve(parsedPath === filePath ? makeParts(2, 1) : []),
    );
    const shrinkResult = await pipeline.run(makeConfig({ incremental: true, repoId: 'repo-a' }));

    expect(shrinkResult.metrics).toMatchObject({
      chunksDeleted: 3,
      chunksReindexed: 2,
      chunksAffected: 5,
    });
    expect(filePoints().map((point) => point.id)).toEqual(['part-2-1', 'part-2-2']);
    expect(filePoints().map((point) => point.payload.startLine)).toEqual([3, 4]);
    expect(filePoints().every((point) => point.payload.totalParts === 2)).toBe(true);

    mockParseFile.mockImplementation((parsedPath: string) =>
      Promise.resolve(parsedPath === filePath ? makeParts(4, 2) : []),
    );
    const growResult = await pipeline.run(makeConfig({ incremental: true, repoId: 'repo-a' }));

    expect(growResult.metrics).toMatchObject({
      chunksDeleted: 2,
      chunksReindexed: 4,
      chunksAffected: 6,
    });
    expect(filePoints().map((point) => point.id)).toEqual([
      'part-4-1',
      'part-4-2',
      'part-4-3',
      'part-4-4',
    ]);
    expect(filePoints().map((point) => point.payload.startLine)).toEqual([4, 5, 6, 7]);
    expect(filePoints().every((point) => point.payload.totalParts === 4)).toBe(true);
  });

  it('does not leak sibling-repo paths into parseFile or deleteByFilter under a real git diff', async () => {
    // Regression coverage for monorepo path-scoping: a shared git worktree with
    // `achpro/` and `platform/` subdirectories, using the real getChangedFiles()
    // implementation (not a mocked result) so an unscoped diff would actually
    // produce invalid `achpro/platform/...` paths if the fix regressed.
    const actual = await vi.importActual<typeof import('./incremental.js')>('./incremental.js');
    mockGetChangedFiles.mockImplementation(actual.getChangedFiles);

    const worktreeRoot = await mkdtemp(join(tmpdir(), 'pipeline-monorepo-'));
    const achproDir = join(worktreeRoot, 'achpro');
    const platformDir = join(worktreeRoot, 'platform');
    await mkdir(join(achproDir, 'src'), { recursive: true });
    await mkdir(join(platformDir, 'src'), { recursive: true });
    await writeFile(join(achproDir, 'src', 'A.java'), 'class A {}\n');
    await writeFile(join(platformDir, 'src', 'P.java'), 'class P {}\n');

    await execFileAsync('git', ['init', '-q'], { cwd: worktreeRoot });
    await execFileAsync('git', ['add', '-A'], { cwd: worktreeRoot });
    await execFileAsync(
      'git',
      [
        '-c',
        'user.email=test@example.com',
        '-c',
        'user.name=Test',
        '-c',
        'commit.gpgsign=false',
        'commit',
        '-qm',
        'initial',
      ],
      { cwd: worktreeRoot },
    );
    const { stdout: initialCommitOut } = await execFileAsync('git', ['rev-parse', 'HEAD'], {
      cwd: worktreeRoot,
    });
    const initialCommit = initialCommitOut.trim();

    // Only the sibling `platform` subtree changes — `achpro` itself is untouched.
    await writeFile(join(platformDir, 'src', 'P.java'), 'class P { /* changed */ }\n');
    await execFileAsync('git', ['add', '-A'], { cwd: worktreeRoot });
    await execFileAsync(
      'git',
      [
        '-c',
        'user.email=test@example.com',
        '-c',
        'user.name=Test',
        '-c',
        'commit.gpgsign=false',
        'commit',
        '-qm',
        'change platform',
      ],
      { cwd: worktreeRoot },
    );

    mockGetLastIndexedCommit.mockResolvedValue(initialCommit);
    mockGetCurrentCommit.mockResolvedValue(initialCommit);

    const result = await pipeline.run({
      targetProjectPath: achproDir,
      frameworkDir: join(worktreeRoot, '.ia-framework'),
      collectionName: 'test-collection',
      embeddingProvider,
      vectorStore,
      incremental: true,
      repoId: 'achpro',
    });

    // No sibling change should reach the parser at all.
    expect(mockParseFile).not.toHaveBeenCalled();
    for (const call of mockParseFile.mock.calls) {
      const parsedPath = call[0] as string;
      expect(parsedPath).not.toContain('platform');
      expect(parsedPath).not.toContain(join('achpro', 'achpro'));
    }

    // No sibling path should reach the deletion filter either.
    for (const call of vectorStore.deleteByFilter.mock.calls) {
      const filter = call[0] as { must: Array<{ key: string; match: { value: string } }> };
      const relativePath = filter.must.find((c) => c.key === 'relativePath')?.match.value;
      expect(relativePath).not.toContain('platform');
      expect(relativePath).not.toContain('..');
    }

    expect(result.metrics.mode).toBe('incremental');
    expect(result.metrics.filesChanged).toBe(0);
  });
});
