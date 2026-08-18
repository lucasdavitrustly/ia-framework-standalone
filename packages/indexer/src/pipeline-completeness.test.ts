/**
 * T078–T082: Pipeline completeness tests
 *
 * These tests verify all the wiring gaps discovered during live testing:
 *   T078 — filePath NOT stored in payload; reconstructed at retrieval time
 *   T079 — classify() called; stereotype/archLayer in payload
 *   T080 — missing CodeChunk fields wired (annotations, visibility, contextHeader,
 *           classSignature, dependencyEdges, moduleInfo, contentHash)
 *   T081 — LLM enricher wired between parsing and embedding
 *   T082 — 'enriching' progress stage emitted between parsing and embedding
 *
 * Tests are written first and MUST FAIL until implementations are in place.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';

// ── Hoist mock variables so they are accessible in vi.mock factories ──────────

const { mockParseFile, mockClassify } = vi.hoisted(() => ({
  mockParseFile: vi.fn(),
  mockClassify: vi.fn(),
}));

const { mockGetLastIndexedCommit, mockGetCurrentCommit, mockSaveLastIndexedCommit } = vi.hoisted(
  () => ({
    mockGetLastIndexedCommit: vi.fn(),
    mockGetCurrentCommit: vi.fn(),
    mockSaveLastIndexedCommit: vi.fn(),
  }),
);

const { mockLlmEnricherEnrich } = vi.hoisted(() => ({
  mockLlmEnricherEnrich: vi.fn(),
}));

// ── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock('@ia-framework/core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@ia-framework/core')>();
  return {
    ...actual,
    createLogger: () => ({
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
      child: vi.fn().mockReturnThis(),
    }),
  };
});

vi.mock('@ia-framework/ast-parser', () => ({
  parseFile: mockParseFile,
  extractCalls: () => undefined,
  buildCalledByIndex: () => new Map(),
  classify: mockClassify,
}));

vi.mock('./incremental.js', () => ({
  getLastIndexedCommit: mockGetLastIndexedCommit,
  getChangedFiles: vi.fn().mockResolvedValue({ toProcess: [], toDelete: [] }),
  getCurrentCommit: mockGetCurrentCommit,
  saveLastIndexedCommit: mockSaveLastIndexedCommit,
  getLastPromptContentHash: vi.fn().mockResolvedValue(null),
}));

vi.mock('./enrichment/enricher.js', () => ({
  // Use a regular function (not arrow) so it can be called with `new`
  LlmEnricher: vi.fn().mockImplementation(function () {
    return { enrich: mockLlmEnricherEnrich };
  }),
}));

// ── Import pipeline after mocks ───────────────────────────────────────────────

import { IndexingPipeline } from './pipeline.js';
import type { IndexingConfig, IndexingProgress } from './pipeline.js';
import type { VectorStore } from '@ia-framework/vector-store';
import type { EmbeddingContract } from '@ia-framework/core';

// ── Factory helpers ───────────────────────────────────────────────────────────

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
    embedBatch: vi
      .fn()
      .mockImplementation((texts: string[]) =>
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

/** Build a chunk with all new fields populated. */
function makeRichChunk(tmpDir: string) {
  const filePath = join(tmpDir, 'Payment.java');
  return {
    id: 'chunk-1',
    filePath,
    relativePath: 'Payment.java',
    language: 'java',
    chunkType: 'class',
    name: 'Payment',
    content: 'public class Payment {}',
    startLine: 1,
    endLine: 1,
    imports: [],
    exports: ['Payment'],
    // New fields wired by T079/T080
    annotations: ['@Entity', '@Table'],
    visibility: 'public' as const,
    contextHeader: '// Payment entity\npublic class Payment',
    classSignature: 'class Payment implements Serializable',
    dependencyEdges: [{ targetPath: 'src/Serializable.java', relation: 'implements' as const }],
    moduleInfo: { group: 'com.acme', module: 'payments', submodule: 'domain' },
  };
}

/** Extract the first VectorPoint payload from upsertBatch calls. */
function getFirstPayload(
  vectorStore: ReturnType<typeof makeMockVectorStore>,
): Record<string, unknown> {
  const [points] = vectorStore.upsertBatch.mock.calls[0] as [Record<string, unknown>[]];
  expect(points).toBeDefined();
  expect(points.length).toBeGreaterThan(0);
  const point = points[0] as Record<string, unknown>;
  return (point['payload'] ?? point) as Record<string, unknown>;
}

// ── Shared beforeEach ─────────────────────────────────────────────────────────

describe('T078: filePath not stored in payload', () => {
  let pipeline: IndexingPipeline;
  let embeddingProvider: ReturnType<typeof makeMockEmbeddingProvider>;
  let vectorStore: ReturnType<typeof makeMockVectorStore>;
  let tmpDir: string;

  beforeEach(async () => {
    vi.clearAllMocks();
    pipeline = new IndexingPipeline();
    embeddingProvider = makeMockEmbeddingProvider();
    vectorStore = makeMockVectorStore();

    tmpDir = join(tmpdir(), `pipeline-t078-${Date.now()}`);
    await mkdir(tmpDir, { recursive: true });
    await writeFile(join(tmpDir, 'Payment.java'), 'public class Payment {}');

    mockGetLastIndexedCommit.mockResolvedValue(null);
    mockGetCurrentCommit.mockResolvedValue('abc123');
    mockSaveLastIndexedCommit.mockResolvedValue(undefined);
    mockClassify.mockReturnValue({ stereotype: 'unknown' });
    mockLlmEnricherEnrich.mockImplementation((chunks: unknown[]) => Promise.resolve(chunks));
    mockParseFile.mockResolvedValue([makeRichChunk(tmpDir)]);
  });

  const makeConfig = (overrides: Partial<IndexingConfig> = {}): IndexingConfig => ({
    targetProjectPath: tmpDir,
    frameworkDir: join(tmpDir, '.ia-framework'),
    collectionName: 'test',
    embeddingProvider,
    vectorStore,
    ...overrides,
  });

  it('T078: payload does NOT contain filePath field', async () => {
    await pipeline.run(makeConfig());

    expect(vectorStore.upsertBatch).toHaveBeenCalled();
    const payload = getFirstPayload(vectorStore);

    // filePath must NOT be stored — it is an absolute host path that leaks machine paths
    expect(payload).not.toHaveProperty('filePath');
  });

  it('T078: payload still contains relativePath', async () => {
    await pipeline.run(makeConfig());

    const payload = getFirstPayload(vectorStore);
    expect(payload['relativePath']).toBe('Payment.java');
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe('T079: classifier wired into parsing loop', () => {
  let pipeline: IndexingPipeline;
  let embeddingProvider: ReturnType<typeof makeMockEmbeddingProvider>;
  let vectorStore: ReturnType<typeof makeMockVectorStore>;
  let tmpDir: string;

  beforeEach(async () => {
    vi.clearAllMocks();
    pipeline = new IndexingPipeline();
    embeddingProvider = makeMockEmbeddingProvider();
    vectorStore = makeMockVectorStore();

    tmpDir = join(tmpdir(), `pipeline-t079-${Date.now()}`);
    await mkdir(tmpDir, { recursive: true });
    await writeFile(join(tmpDir, 'Payment.java'), 'public class Payment {}');

    mockGetLastIndexedCommit.mockResolvedValue(null);
    mockGetCurrentCommit.mockResolvedValue('abc123');
    mockSaveLastIndexedCommit.mockResolvedValue(undefined);
    mockLlmEnricherEnrich.mockImplementation((chunks: unknown[]) => Promise.resolve(chunks));
    mockParseFile.mockResolvedValue([makeRichChunk(tmpDir)]);
  });

  const makeConfig = (overrides: Partial<IndexingConfig> = {}): IndexingConfig => ({
    targetProjectPath: tmpDir,
    frameworkDir: join(tmpDir, '.ia-framework'),
    collectionName: 'test',
    embeddingProvider,
    vectorStore,
    ...overrides,
  });

  it('T079: classify() is called for each parsed chunk', async () => {
    mockClassify.mockReturnValue({ stereotype: 'entity', archLayer: 'domain' });

    await pipeline.run(makeConfig());

    expect(mockClassify).toHaveBeenCalled();
  });

  it('T079: stereotype from classifier is written to upserted payload', async () => {
    mockClassify.mockReturnValue({ stereotype: 'repository', archLayer: 'persistence' });

    await pipeline.run(makeConfig());

    const payload = getFirstPayload(vectorStore);
    expect(payload['stereotype']).toBe('repository');
  });

  it('T079: archLayer from classifier is written to upserted payload', async () => {
    mockClassify.mockReturnValue({ stereotype: 'controller', archLayer: 'presentation' });

    await pipeline.run(makeConfig());

    const payload = getFirstPayload(vectorStore);
    expect(payload['archLayer']).toBe('presentation');
  });

  it('T079: stereotype=unknown is NOT written to payload (skip noise)', async () => {
    mockClassify.mockReturnValue({ stereotype: 'unknown' });

    await pipeline.run(makeConfig());

    const payload = getFirstPayload(vectorStore);
    // 'unknown' stereotype adds no value; should be omitted
    expect(payload['stereotype']).toBeUndefined();
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe('T080: missing CodeChunk fields wired to payload', () => {
  let pipeline: IndexingPipeline;
  let embeddingProvider: ReturnType<typeof makeMockEmbeddingProvider>;
  let vectorStore: ReturnType<typeof makeMockVectorStore>;
  let tmpDir: string;
  let fileContent: string;

  beforeEach(async () => {
    vi.clearAllMocks();
    pipeline = new IndexingPipeline();
    embeddingProvider = makeMockEmbeddingProvider();
    vectorStore = makeMockVectorStore();

    tmpDir = join(tmpdir(), `pipeline-t080-${Date.now()}`);
    await mkdir(tmpDir, { recursive: true });
    fileContent = 'public class Payment {}';
    await writeFile(join(tmpDir, 'Payment.java'), fileContent);

    mockGetLastIndexedCommit.mockResolvedValue(null);
    mockGetCurrentCommit.mockResolvedValue('abc123');
    mockSaveLastIndexedCommit.mockResolvedValue(undefined);
    mockClassify.mockReturnValue({ stereotype: 'entity', archLayer: 'domain' });
    mockLlmEnricherEnrich.mockImplementation((chunks: unknown[]) => Promise.resolve(chunks));
    mockParseFile.mockResolvedValue([makeRichChunk(tmpDir)]);
  });

  const makeConfig = (overrides: Partial<IndexingConfig> = {}): IndexingConfig => ({
    targetProjectPath: tmpDir,
    frameworkDir: join(tmpDir, '.ia-framework'),
    collectionName: 'test',
    embeddingProvider,
    vectorStore,
    ...overrides,
  });

  it('T080: annotations are written to payload', async () => {
    await pipeline.run(makeConfig());

    const payload = getFirstPayload(vectorStore);
    expect(payload['annotations']).toEqual(['@Entity', '@Table']);
  });

  it('T080: visibility is written to payload', async () => {
    await pipeline.run(makeConfig());

    const payload = getFirstPayload(vectorStore);
    expect(payload['visibility']).toBe('public');
  });

  it('T080: contextHeader is written to payload', async () => {
    await pipeline.run(makeConfig());

    const payload = getFirstPayload(vectorStore);
    expect(payload['contextHeader']).toBe('// Payment entity\npublic class Payment');
  });

  it('T080: classSignature is written to payload', async () => {
    await pipeline.run(makeConfig());

    const payload = getFirstPayload(vectorStore);
    expect(payload['classSignature']).toBe('class Payment implements Serializable');
  });

  it('T080: dependencyEdges are written to payload', async () => {
    await pipeline.run(makeConfig());

    const payload = getFirstPayload(vectorStore);
    expect(payload['dependencyEdges']).toEqual([
      { targetPath: 'src/Serializable.java', relation: 'implements' },
    ]);
  });

  it('T080: moduleInfo structured block is written to payload', async () => {
    await pipeline.run(makeConfig());

    const payload = getFirstPayload(vectorStore);
    expect(payload['moduleInfo']).toEqual({
      group: 'com.acme',
      module: 'payments',
      submodule: 'domain',
    });
  });

  it('T080: contentHash (SHA256 of reloaded content) is written to payload', async () => {
    await pipeline.run(makeConfig());

    const payload = getFirstPayload(vectorStore);
    const expectedHash = createHash('sha256').update(fileContent).digest('hex');
    expect(payload['contentHash']).toBe(expectedHash);
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe('T081: LLM enricher wired into pipeline', () => {
  let pipeline: IndexingPipeline;
  let embeddingProvider: ReturnType<typeof makeMockEmbeddingProvider>;
  let vectorStore: ReturnType<typeof makeMockVectorStore>;
  let tmpDir: string;

  beforeEach(async () => {
    vi.clearAllMocks();
    pipeline = new IndexingPipeline();
    embeddingProvider = makeMockEmbeddingProvider();
    vectorStore = makeMockVectorStore();

    tmpDir = join(tmpdir(), `pipeline-t081-${Date.now()}`);
    await mkdir(tmpDir, { recursive: true });
    await writeFile(join(tmpDir, 'Payment.java'), 'public class Payment {}');

    mockGetLastIndexedCommit.mockResolvedValue(null);
    mockGetCurrentCommit.mockResolvedValue('abc123');
    mockSaveLastIndexedCommit.mockResolvedValue(undefined);
    mockClassify.mockReturnValue({ stereotype: 'unknown' });
    mockParseFile.mockResolvedValue([makeRichChunk(tmpDir)]);
  });

  const makeEnrichmentConfig = () => ({
    provider: 'ollama' as const,
    model: 'qwen2.5-coder:7b',
    baseUrl: 'http://localhost:11434',
  });

  const makeConfig = (overrides: Partial<IndexingConfig> = {}): IndexingConfig => ({
    targetProjectPath: tmpDir,
    frameworkDir: join(tmpDir, '.ia-framework'),
    collectionName: 'test',
    embeddingProvider,
    vectorStore,
    ...overrides,
  });

  it('T081: LlmEnricher.enrich() is called when enrichmentConfig is set', async () => {
    // Default: pass-through
    mockLlmEnricherEnrich.mockImplementation((chunks: unknown[]) => Promise.resolve(chunks));

    await pipeline.run(makeConfig({ enrichmentConfig: makeEnrichmentConfig() }));

    expect(mockLlmEnricherEnrich).toHaveBeenCalled();
  });

  it('T081: LlmEnricher.enrich() is NOT called when skipEnrichment=true', async () => {
    mockLlmEnricherEnrich.mockImplementation((chunks: unknown[]) => Promise.resolve(chunks));

    await pipeline.run(
      makeConfig({ enrichmentConfig: makeEnrichmentConfig(), skipEnrichment: true }),
    );

    expect(mockLlmEnricherEnrich).not.toHaveBeenCalled();
  });

  it('T081: LlmEnricher.enrich() is NOT called when enrichmentConfig is absent', async () => {
    mockLlmEnricherEnrich.mockImplementation((chunks: unknown[]) => Promise.resolve(chunks));

    await pipeline.run(makeConfig()); // no enrichmentConfig

    expect(mockLlmEnricherEnrich).not.toHaveBeenCalled();
  });

  it('T081: enrichment fields (description, businessContext, semanticTags) are in payload after enrich()', async () => {
    mockLlmEnricherEnrich.mockImplementation((chunks: unknown[]) =>
      Promise.resolve(
        (chunks as Record<string, unknown>[]).map((c) => ({
          ...c,
          description: 'Handles payment records',
          businessContext: 'Payments domain',
          semanticTags: ['payment', 'entity', 'domain'],
          enrichedAt: '2026-06-05T00:00:00Z',
          enrichmentModel: 'qwen2.5-coder:7b',
        })),
      ),
    );

    await pipeline.run(makeConfig({ enrichmentConfig: makeEnrichmentConfig() }));

    const payload = getFirstPayload(vectorStore);
    expect(payload['description']).toBe('Handles payment records');
    expect(payload['businessContext']).toBe('Payments domain');
    expect(payload['semanticTags']).toEqual(['payment', 'entity', 'domain']);
    expect(payload['enrichedAt']).toBe('2026-06-05T00:00:00Z');
    expect(payload['enrichmentModel']).toBe('qwen2.5-coder:7b');
  });

  it('T081: relationships from enricher are in payload', async () => {
    mockLlmEnricherEnrich.mockImplementation((chunks: unknown[]) =>
      Promise.resolve(
        (chunks as Record<string, unknown>[]).map((c) => ({
          ...c,
          relationships: [{ target: 'PaymentService', type: 'uses', label: 'persisted by' }],
        })),
      ),
    );

    await pipeline.run(makeConfig({ enrichmentConfig: makeEnrichmentConfig() }));

    const payload = getFirstPayload(vectorStore);
    expect(payload['relationships']).toEqual([
      { target: 'PaymentService', type: 'uses', label: 'persisted by' },
    ]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe('T082: enriching progress stage', () => {
  let pipeline: IndexingPipeline;
  let embeddingProvider: ReturnType<typeof makeMockEmbeddingProvider>;
  let vectorStore: ReturnType<typeof makeMockVectorStore>;
  let tmpDir: string;

  beforeEach(async () => {
    vi.clearAllMocks();
    pipeline = new IndexingPipeline();
    embeddingProvider = makeMockEmbeddingProvider();
    vectorStore = makeMockVectorStore();

    tmpDir = join(tmpdir(), `pipeline-t082-${Date.now()}`);
    await mkdir(tmpDir, { recursive: true });
    await writeFile(join(tmpDir, 'Payment.java'), 'public class Payment {}');

    mockGetLastIndexedCommit.mockResolvedValue(null);
    mockGetCurrentCommit.mockResolvedValue('abc123');
    mockSaveLastIndexedCommit.mockResolvedValue(undefined);
    mockClassify.mockReturnValue({ stereotype: 'unknown' });
    mockParseFile.mockResolvedValue([makeRichChunk(tmpDir)]);
  });

  const makeEnrichmentConfig = () => ({
    provider: 'ollama' as const,
    model: 'qwen2.5-coder:7b',
    baseUrl: 'http://localhost:11434',
  });

  const makeConfig = (overrides: Partial<IndexingConfig> = {}): IndexingConfig => ({
    targetProjectPath: tmpDir,
    frameworkDir: join(tmpDir, '.ia-framework'),
    collectionName: 'test',
    embeddingProvider,
    vectorStore,
    ...overrides,
  });

  it('T082: onProgress is called with stage=enriching when enrichmentConfig is set', async () => {
    mockLlmEnricherEnrich.mockImplementation((chunks: unknown[]) => Promise.resolve(chunks));

    const stages: string[] = [];
    const onProgress = vi.fn((p: IndexingProgress) => {
      stages.push(p.stage);
    });

    await pipeline.run(makeConfig({ enrichmentConfig: makeEnrichmentConfig() }), onProgress);

    expect(stages).toContain('enriching');
  });

  it('T082: enriching stage appears between parsing and embedding in progress sequence', async () => {
    mockLlmEnricherEnrich.mockImplementation((chunks: unknown[]) => Promise.resolve(chunks));

    const stages: string[] = [];
    const onProgress = vi.fn((p: IndexingProgress) => {
      stages.push(p.stage);
    });

    await pipeline.run(makeConfig({ enrichmentConfig: makeEnrichmentConfig() }), onProgress);

    const parsingIdx = stages.lastIndexOf('parsing');
    const enrichingIdx = stages.indexOf('enriching');
    const embeddingIdx = stages.indexOf('embedding');

    expect(enrichingIdx).toBeGreaterThan(parsingIdx);
    expect(enrichingIdx).toBeLessThan(embeddingIdx);
  });

  it('T082: enriching stage is NOT emitted when enrichmentConfig is absent', async () => {
    const stages: string[] = [];
    const onProgress = vi.fn((p: IndexingProgress) => {
      stages.push(p.stage);
    });

    await pipeline.run(makeConfig(), onProgress); // no enrichmentConfig

    expect(stages).not.toContain('enriching');
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe('T084: enrichment progress bar — batchesTotal/batchesCompleted during enriching', () => {
  let pipeline: IndexingPipeline;
  let embeddingProvider: ReturnType<typeof makeMockEmbeddingProvider>;
  let vectorStore: ReturnType<typeof makeMockVectorStore>;
  let tmpDir: string;

  beforeEach(async () => {
    vi.clearAllMocks();
    pipeline = new IndexingPipeline();
    embeddingProvider = makeMockEmbeddingProvider();
    vectorStore = makeMockVectorStore();

    tmpDir = join(tmpdir(), `pipeline-t084-${Date.now()}`);
    await mkdir(tmpDir, { recursive: true });
    await writeFile(join(tmpDir, 'Payment.java'), 'public class Payment {}');

    mockGetLastIndexedCommit.mockResolvedValue(null);
    mockGetCurrentCommit.mockResolvedValue('abc123');
    mockSaveLastIndexedCommit.mockResolvedValue(undefined);
    mockClassify.mockReturnValue({ stereotype: 'unknown' });
    mockParseFile.mockResolvedValue([makeRichChunk(tmpDir)]);
  });

  const makeEnrichmentConfig = () => ({
    provider: 'ollama' as const,
    model: 'qwen2.5-coder:0.5b',
    baseUrl: 'http://localhost:11434',
  });

  const makeConfig = (overrides: Partial<IndexingConfig> = {}): IndexingConfig => ({
    targetProjectPath: tmpDir,
    frameworkDir: join(tmpDir, '.ia-framework'),
    collectionName: 'test',
    embeddingProvider,
    vectorStore,
    ...overrides,
  });

  it('T084: batchesTotal is set on enriching progress events', async () => {
    mockLlmEnricherEnrich.mockImplementation(
      (
        chunks: unknown[],
        onProgress?: (p: { batchesCompleted: number; batchesTotal: number }) => void,
      ) => {
        onProgress?.({ batchesCompleted: 1, batchesTotal: 1 });
        return Promise.resolve(chunks);
      },
    );

    const enrichingEvents: IndexingProgress[] = [];
    await pipeline.run(makeConfig({ enrichmentConfig: makeEnrichmentConfig() }), (p) => {
      if (p.stage === 'enriching') enrichingEvents.push({ ...p });
    });

    const withBatches = enrichingEvents.filter((e) => e.batchesTotal != null);
    expect(withBatches.length).toBeGreaterThan(0);
    expect(withBatches[0]!.batchesTotal).toBe(1);
  });

  it('T084: batchesCompleted increments in enriching progress events', async () => {
    mockLlmEnricherEnrich.mockImplementation(
      (
        chunks: unknown[],
        onProgress?: (p: { batchesCompleted: number; batchesTotal: number }) => void,
      ) => {
        onProgress?.({ batchesCompleted: 1, batchesTotal: 3 });
        onProgress?.({ batchesCompleted: 2, batchesTotal: 3 });
        onProgress?.({ batchesCompleted: 3, batchesTotal: 3 });
        return Promise.resolve(chunks);
      },
    );

    const completedValues: number[] = [];
    await pipeline.run(makeConfig({ enrichmentConfig: makeEnrichmentConfig() }), (p) => {
      if (p.stage === 'enriching' && p.batchesCompleted != null) {
        completedValues.push(p.batchesCompleted);
      }
    });

    expect(completedValues).toEqual([1, 2, 3]);
  });

  it('T084: currentFile is set on enriching progress events', async () => {
    const expectedFile = join(tmpDir, 'Payment.java');
    mockLlmEnricherEnrich.mockImplementation(
      async (
        chunks: unknown[],
        onProgress?: (p: {
          batchesCompleted: number;
          batchesTotal: number;
          currentFile?: string;
        }) => void,
      ) => {
        onProgress?.({ batchesCompleted: 1, batchesTotal: 1, currentFile: expectedFile });
        return Promise.resolve(chunks);
      },
    );

    const enrichingEvents: IndexingProgress[] = [];
    await pipeline.run(makeConfig({ enrichmentConfig: makeEnrichmentConfig() }), (p) => {
      if (p.stage === 'enriching') enrichingEvents.push({ ...p });
    });

    const withFile = enrichingEvents.filter((e) => e.currentFile != null);
    expect(withFile.length).toBeGreaterThan(0);
    expect(withFile[0]!.currentFile).toBe(expectedFile);
  });

  it('T084: batchesTotal and batchesCompleted are reset (undefined) when transitioning to embedding', async () => {
    mockLlmEnricherEnrich.mockImplementation(
      (
        chunks: unknown[],
        onProgress?: (p: { batchesCompleted: number; batchesTotal: number }) => void,
      ) => {
        onProgress?.({ batchesCompleted: 1, batchesTotal: 1 });
        return Promise.resolve(chunks);
      },
    );

    // Capture the first embedding progress event
    let firstEmbeddingEvent: IndexingProgress | undefined;
    await pipeline.run(makeConfig({ enrichmentConfig: makeEnrichmentConfig() }), (p) => {
      if (p.stage === 'embedding' && firstEmbeddingEvent === undefined) {
        firstEmbeddingEvent = { ...p };
      }
    });

    // When embedding starts, enrichment batch counts should be cleared
    expect(firstEmbeddingEvent).toBeDefined();
    expect(firstEmbeddingEvent!.batchesCompleted).toBeUndefined();
    expect(firstEmbeddingEvent!.batchesTotal).toBeUndefined();
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe('T21: indexing run summary completeness', () => {
  let pipeline: IndexingPipeline;
  let embeddingProvider: ReturnType<typeof makeMockEmbeddingProvider>;
  let vectorStore: ReturnType<typeof makeMockVectorStore>;
  let tmpDir: string;

  beforeEach(async () => {
    vi.clearAllMocks();
    pipeline = new IndexingPipeline();
    embeddingProvider = makeMockEmbeddingProvider();
    vectorStore = makeMockVectorStore();

    tmpDir = join(tmpdir(), `pipeline-t021-${Date.now()}`);
    await mkdir(tmpDir, { recursive: true });
    mockGetLastIndexedCommit.mockResolvedValue(null);
    mockGetCurrentCommit.mockResolvedValue('abc123');
    mockSaveLastIndexedCommit.mockResolvedValue(undefined);
    mockClassify.mockReturnValue({ stereotype: 'unknown' });
  });

  const makeConfig = (overrides: Partial<IndexingConfig> = {}): IndexingConfig => ({
    targetProjectPath: tmpDir,
    frameworkDir: join(tmpDir, '.ia-framework'),
    collectionName: 'test',
    embeddingProvider,
    vectorStore,
    embeddingConcurrency: 1,
    repoId: 'repo-a',
    ...overrides,
  });

  it('reports each skipped chunk with re-index identity and reason', async () => {
    const content = 'function rejected() {}';
    await writeFile(join(tmpDir, 'Payment.java'), content);
    mockParseFile.mockResolvedValue([
      {
        ...makeRichChunk(tmpDir),
        id: 'rejected-1',
        chunkType: 'function',
        name: 'rejected',
        content,
        endLine: 1,
      },
    ]);
    embeddingProvider.embedBatch.mockResolvedValue({
      vectors: [null],
      failures: [{ index: 0, reason: 'provider rejected input', retryable: false }],
    });

    const result = await pipeline.run(makeConfig());

    expect(result.skippedChunks).toBe(1);
    expect(result.skipped).toEqual([
      {
        repoId: 'repo-a',
        relativePath: 'Payment.java',
        name: 'rejected',
        startLine: 1,
        endLine: 1,
        reason: 'provider rejected input',
      },
    ]);
  });

  it('reports signature-only chunks with count and identity', async () => {
    const content = `function huge() { ${'x'.repeat(40_000)} }`;
    await writeFile(join(tmpDir, 'huge.ts'), content);
    mockParseFile.mockResolvedValue([
      {
        ...makeRichChunk(tmpDir),
        id: 'huge-1',
        filePath: join(tmpDir, 'huge.ts'),
        relativePath: 'huge.ts',
        language: 'typescript',
        chunkType: 'function',
        name: 'huge',
        content,
        endLine: 1,
      },
    ]);

    const result = await pipeline.run(makeConfig());

    expect(result.signatureOnlyCount).toBe(1);
    expect(result.signatureOnly).toEqual([
      {
        repoId: 'repo-a',
        relativePath: 'huge.ts',
        name: 'huge',
        startLine: 1,
        endLine: 1,
      },
    ]);
    expect(result.skipped).toEqual([]);
  });

  it('retains an undeclarable oversized chunk as a reported signature-only degradation', async () => {
    // T1.4: content with no extractable declaration (minified/generated blob)
    // used to throw OversizedInputError and disappear from the index. It is now
    // retained as a flagged head truncation, so it stays searchable and the
    // degradation is reported via signatureOnly instead of being a silent loss.
    const content = 'x'.repeat(40_000);
    await writeFile(join(tmpDir, 'unhandleable.ts'), content);
    mockParseFile.mockResolvedValue([
      {
        ...makeRichChunk(tmpDir),
        id: 'unhandleable-1',
        filePath: join(tmpDir, 'unhandleable.ts'),
        relativePath: 'unhandleable.ts',
        chunkType: 'method',
        name: 'unhandleable',
        content,
        endLine: 1,
      },
    ]);

    const result = await pipeline.run(makeConfig());

    // No silent chunk loss.
    expect(result.skipped).toEqual([]);
    expect(result.signatureOnlyCount).toBe(1);
    expect(result.signatureOnly).toEqual([
      {
        repoId: 'repo-a',
        relativePath: 'unhandleable.ts',
        name: 'unhandleable',
        startLine: 1,
        endLine: 1,
      },
    ]);
  });

  it('reports every chunk cancelled before upsert', async () => {
    const controller = new AbortController();
    const content = 'function cancelled() {}';
    await writeFile(join(tmpDir, 'cancelled.ts'), content);
    mockParseFile.mockResolvedValue([
      {
        ...makeRichChunk(tmpDir),
        id: 'cancelled-1',
        filePath: join(tmpDir, 'cancelled.ts'),
        relativePath: 'cancelled.ts',
        chunkType: 'function',
        name: 'cancelled',
        content,
        endLine: 1,
      },
    ]);
    embeddingProvider.embedBatch.mockImplementation((texts: string[]) => {
      controller.abort();
      return Promise.resolve({
        vectors: texts.map(() => [0.1, 0.2, 0.3]),
        failures: [],
      });
    });

    const result = await pipeline.run(makeConfig(), undefined, controller.signal);

    expect(result.skipped).toEqual([
      expect.objectContaining({
        relativePath: 'cancelled.ts',
        name: 'cancelled',
        reason: 'indexing cancelled before upsert',
      }),
    ]);
  });

  it('accounts for a context source failure with an identity record', async () => {
    mockParseFile.mockResolvedValue([]);
    const result = await pipeline.run(
      makeConfig({
        contextSources: [
          {
            name: 'broken-schema',
            getChunks: vi.fn().mockRejectedValue(new Error('schema unavailable')),
          },
        ],
      }),
    );

    expect(result.skipped).toEqual([
      {
        repoId: 'repo-a',
        relativePath: '__context_source__/broken-schema',
        name: 'broken-schema',
        startLine: 0,
        endLine: 0,
        reason: 'schema unavailable',
      },
    ]);
  });

  it('reports an oversized context source chunk before provider request', async () => {
    mockParseFile.mockResolvedValue([]);
    const contextChunk = {
      id: 'large-context',
      filePath: '__db__',
      relativePath: 'users',
      language: 'sql',
      chunkType: 'table' as const,
      name: 'users',
      content: 'x'.repeat(40_000),
      startLine: 1,
      endLine: 1,
      imports: [],
      exports: [],
      indexedAt: new Date().toISOString(),
    };

    const result = await pipeline.run(
      makeConfig({
        contextSources: [{ name: 'postgres', getChunks: vi.fn().mockResolvedValue([contextChunk]) }],
      }),
    );

    expect(result.skipped).toEqual([
      expect.objectContaining({
        relativePath: 'users',
        name: 'users',
        reason: 'input remained oversized after handling',
      }),
    ]);
  });

  it('reports context source provider failures per input', async () => {
    mockParseFile.mockResolvedValue([]);
    const contextChunk = {
      id: 'failed-context',
      filePath: '__db__',
      relativePath: 'orders',
      language: 'sql',
      chunkType: 'table' as const,
      name: 'orders',
      content: 'Table orders',
      startLine: 0,
      endLine: 0,
      imports: [],
      exports: [],
      indexedAt: new Date().toISOString(),
    };
    embeddingProvider.embedBatch.mockResolvedValue({
      vectors: [null],
      failures: [{ index: 0, reason: 'context provider rejected input', retryable: false }],
    });

    const result = await pipeline.run(
      makeConfig({
        contextSources: [{ name: 'postgres', getChunks: vi.fn().mockResolvedValue([contextChunk]) }],
      }),
    );

    expect(result.skipped).toEqual([
      expect.objectContaining({
        relativePath: 'orders',
        name: 'orders',
        reason: 'context provider rejected input',
      }),
    ]);
  });

  it('returns an empty skip and signature-only list for a clean run', async () => {
    mockParseFile.mockResolvedValue([]);

    const result = await pipeline.run(makeConfig());

    expect(result.skippedChunks).toBe(0);
    expect(result.skipped).toEqual([]);
    expect(result.signatureOnlyCount).toBe(0);
    expect(result.signatureOnly).toEqual([]);
  });
});
