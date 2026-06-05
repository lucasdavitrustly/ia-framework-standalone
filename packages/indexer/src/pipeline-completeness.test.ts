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
  getChangedFiles: vi.fn().mockResolvedValue([]),
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

// ── Factory helpers ───────────────────────────────────────────────────────────

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
    scroll: vi.fn().mockResolvedValue({ points: [], nextOffset: undefined }),
    countPoints: vi.fn().mockResolvedValue(0),
    deleteCollection: vi.fn().mockResolvedValue(undefined),
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
    mockLlmEnricherEnrich.mockImplementation(async (chunks: unknown[]) => chunks);
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
    mockLlmEnricherEnrich.mockImplementation(async (chunks: unknown[]) => chunks);
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
    mockLlmEnricherEnrich.mockImplementation(async (chunks: unknown[]) => chunks);
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
    mockLlmEnricherEnrich.mockImplementation(async (chunks: unknown[]) => chunks);

    await pipeline.run(makeConfig({ enrichmentConfig: makeEnrichmentConfig() }));

    expect(mockLlmEnricherEnrich).toHaveBeenCalled();
  });

  it('T081: LlmEnricher.enrich() is NOT called when skipEnrichment=true', async () => {
    mockLlmEnricherEnrich.mockImplementation(async (chunks: unknown[]) => chunks);

    await pipeline.run(
      makeConfig({ enrichmentConfig: makeEnrichmentConfig(), skipEnrichment: true }),
    );

    expect(mockLlmEnricherEnrich).not.toHaveBeenCalled();
  });

  it('T081: LlmEnricher.enrich() is NOT called when enrichmentConfig is absent', async () => {
    mockLlmEnricherEnrich.mockImplementation(async (chunks: unknown[]) => chunks);

    await pipeline.run(makeConfig()); // no enrichmentConfig

    expect(mockLlmEnricherEnrich).not.toHaveBeenCalled();
  });

  it('T081: enrichment fields (description, businessContext, semanticTags) are in payload after enrich()', async () => {
    mockLlmEnricherEnrich.mockImplementation(async (chunks: unknown[]) =>
      (chunks as Record<string, unknown>[]).map((c) => ({
        ...c,
        description: 'Handles payment records',
        businessContext: 'Payments domain',
        semanticTags: ['payment', 'entity', 'domain'],
        enrichedAt: '2026-06-05T00:00:00Z',
        enrichmentModel: 'qwen2.5-coder:7b',
      })),
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
    mockLlmEnricherEnrich.mockImplementation(async (chunks: unknown[]) =>
      (chunks as Record<string, unknown>[]).map((c) => ({
        ...c,
        relationships: [{ target: 'PaymentService', type: 'uses', label: 'persisted by' }],
      })),
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
    mockLlmEnricherEnrich.mockImplementation(async (chunks: unknown[]) => chunks);

    const stages: string[] = [];
    const onProgress = vi.fn((p: IndexingProgress) => {
      stages.push(p.stage);
    });

    await pipeline.run(makeConfig({ enrichmentConfig: makeEnrichmentConfig() }), onProgress);

    expect(stages).toContain('enriching');
  });

  it('T082: enriching stage appears between parsing and embedding in progress sequence', async () => {
    mockLlmEnricherEnrich.mockImplementation(async (chunks: unknown[]) => chunks);

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
      async (
        chunks: unknown[],
        onProgress?: (p: { batchesCompleted: number; batchesTotal: number }) => void,
      ) => {
        onProgress?.({ batchesCompleted: 1, batchesTotal: 1 });
        return chunks;
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
      async (
        chunks: unknown[],
        onProgress?: (p: { batchesCompleted: number; batchesTotal: number }) => void,
      ) => {
        onProgress?.({ batchesCompleted: 1, batchesTotal: 3 });
        onProgress?.({ batchesCompleted: 2, batchesTotal: 3 });
        onProgress?.({ batchesCompleted: 3, batchesTotal: 3 });
        return chunks;
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
        return chunks;
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
      async (
        chunks: unknown[],
        onProgress?: (p: { batchesCompleted: number; batchesTotal: number }) => void,
      ) => {
        onProgress?.({ batchesCompleted: 1, batchesTotal: 1 });
        return chunks;
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
