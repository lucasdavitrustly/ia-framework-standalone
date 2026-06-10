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
const { mockWarn, mockInfo, mockDebug, mockError, testFile, fileContent } = vi.hoisted(() => {
  const dir = '/tmp/pipeline-embed-test';
  return {
    mockWarn: vi.fn(),
    mockInfo: vi.fn(),
    mockDebug: vi.fn(),
    mockError: vi.fn(),
    testFile: `${dir}/src/file.ts`,
    fileContent: 'function hello() { return "world"; }\n',
  };
});

vi.mock('@ia-framework/core', () => ({
  createLogger: () => ({
    info: mockInfo,
    warn: mockWarn,
    debug: mockDebug,
    error: mockError,
  }),
}));

// Mock ast-parser to return actual chunks pointing to our temp file
vi.mock('@ia-framework/ast-parser', () => ({
  parseFile: vi.fn().mockResolvedValue([
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
  ]),
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

// Mock the embedder module — ThreeVectorEmbedder must be a class (used with `new`)
vi.mock('../embedder.js', () => ({
  ThreeVectorEmbedder: class MockThreeVectorEmbedder {
    private provider: { embedBatch: (texts: string[]) => Promise<number[][]> };
    constructor(provider: { embedBatch: (texts: string[]) => Promise<number[][]> }) {
      this.provider = provider;
    }
    async embedBatch(chunks: { content: string }[]) {
      const texts = chunks.map((c) => c.content);
      const results = await this.provider.embedBatch(texts);
      return chunks.map((_c, i) => ({
        semantic: results[i] ?? [0.1],
        signature: results[i] ?? [0.1],
        sparse: results[i] ?? [0.1],
      }));
    }
  },
}));

import { IndexingPipeline } from '../pipeline.js';
import type { EmbeddingProvider } from '@ia-framework/embedding';
import type { VectorStore } from '@ia-framework/vector-store';

function createMockEmbeddingProvider(error: Error): EmbeddingProvider {
  return {
    name: 'ollama',
    model: 'nomic-embed-text',
    dimensions: 768,
    embedBatch: vi.fn().mockRejectedValue(error),
    embed: vi.fn().mockRejectedValue(error),
    estimateTokens: vi.fn().mockReturnValue(10),
  };
}

function createMockVectorStore(): VectorStore {
  return {
    initialize: vi.fn().mockResolvedValue(undefined),
    upsert: vi.fn().mockResolvedValue(undefined),
    search: vi.fn().mockResolvedValue([]),
    delete: vi.fn().mockResolvedValue(undefined),
    count: vi.fn().mockResolvedValue(0),
  } as unknown as VectorStore;
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

    const [metadata] = skipWarnCalls[0]!;
    // The metadata object should include an 'error' property with the error message
    expect(metadata).toHaveProperty('error');
    expect(metadata.error).toContain('model not found');
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
    const [metadata] = skipWarnCalls[0]!;
    expect(metadata).toHaveProperty('batchSize');
    expect(typeof metadata.batchSize).toBe('number');
    // Also verify error is present
    expect(metadata).toHaveProperty('error');
  }, 10000);
});
