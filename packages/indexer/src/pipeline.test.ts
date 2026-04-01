import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest';
import { mkdir, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

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
    dimensions: dim,
    embed: vi.fn().mockResolvedValue([0.1, 0.2, 0.3]),
    embedBatch: vi.fn().mockImplementation((texts: string[]) =>
      Promise.resolve(texts.map(() => [0.1, 0.2, 0.3])),
    ),
    estimateTokens: vi.fn().mockReturnValue(10),
  };
}

function makeMockVectorStore() {
  return {
    initialize: vi.fn().mockResolvedValue(undefined),
    upsertBatch: vi.fn().mockResolvedValue(undefined),
    search: vi.fn().mockResolvedValue([]),
    getCollectionInfo: vi.fn().mockResolvedValue({ name: 'test', pointCount: 0, vectorDimensions: { text: 3, code: 3 }, status: 'green' }),
    deleteByFilter: vi.fn().mockResolvedValue(0),
    deleteByIds: vi.fn().mockResolvedValue(undefined),
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
    const [points] = vectorStore.upsertBatch.mock.calls[0] as [{ textVector: number[]; codeVector: number[] }[]];
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
    vectorStore.initialize.mockImplementation(async () => { callOrder.push('initialize'); });
    vectorStore.upsertBatch.mockImplementation(async () => { callOrder.push('upsertBatch'); });

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

// Cleanup after all tests
afterAll(async () => {
  try {
    await rm(tmpDir, { recursive: true, force: true });
  } catch {
    // ignore cleanup errors
  }
});
