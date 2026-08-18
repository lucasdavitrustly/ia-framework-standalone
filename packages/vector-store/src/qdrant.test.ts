import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CollectionSchemaError, PayloadIndexError } from '@ia-framework/core';
import type { EmbeddingContract } from '@ia-framework/core';
import { QdrantVectorStore } from './qdrant.js';
import { CONTRACT_POINT_ID, type StoredContract } from './contract-store.js';
import type { VectorPoint, VectorStore } from './interface.js';

// Mock method references — defined outside so they can be referenced in tests
const mockCollectionExists = vi.fn();
const mockCreateCollection = vi.fn();
const mockDeleteCollection = vi.fn();
const mockUpsert = vi.fn();
const mockSearch =
  vi.fn<(collectionName: string, args: Record<string, unknown>) => Promise<unknown[]>>();
const mockGetCollection = vi.fn();
const mockDelete = vi.fn();
const mockQuery =
  vi.fn<(collectionName: string, args: Record<string, unknown>) => Promise<unknown>>();
const mockScroll = vi.fn();
const mockCount = vi.fn();
const mockCreatePayloadIndex = vi.fn();
const mockRetrieve = vi.fn();

const ACTIVE_CONTRACT: EmbeddingContract = {
  provider: 'openai',
  model: 'text-embedding-3-small',
  dimension: 3,
  tokenizerVersion: 1,
  sparseHashVersion: 1,
};

const FILTER_INDEX_SURFACE = {
  must: [
    { key: 'repoId' },
    { key: 'stereotype' },
    { key: 'archLayer' },
    { key: 'moduleInfo.module' },
    { key: 'language' },
    { key: 'relativePath' },
    { key: 'chunkIndex' },
    { key: 'defines' },
    {
      nested: {
        key: 'dependencyEdges',
        filter: {
          must: [{ key: 'targetPath' }, { key: 'relation' }],
        },
      },
    },
  ],
  must_not: [{ key: 'stereotype' }, { key: 'kind' }],
};

function collectFilterIndexKeys(filter: unknown, prefix = ''): string[] {
  if (typeof filter !== 'object' || filter === null) return [];
  const record = filter as Record<string, unknown>;
  const clauses: unknown[] = ['must', 'should', 'must_not'].flatMap((name) => {
    const clause = record[name];
    return Array.isArray(clause) ? (clause as unknown[]) : [];
  });

  return clauses.flatMap((clause) => {
    if (typeof clause !== 'object' || clause === null) return [];
    const condition = clause as Record<string, unknown>;
    if (typeof condition.key === 'string') {
      return [prefix ? `${prefix}.${condition.key}` : condition.key];
    }
    if (typeof condition.nested !== 'object' || condition.nested === null) return [];
    const nested = condition.nested as Record<string, unknown>;
    if (typeof nested.key !== 'string') return [];
    const nestedPrefix = `${prefix ? `${prefix}.` : ''}${nested.key}[]`;
    return collectFilterIndexKeys(nested.filter, nestedPrefix);
  });
}

// Mock the QdrantClient module with a proper class constructor
vi.mock('@qdrant/js-client-rest', () => {
  class MockQdrantClient {
    collectionExists = mockCollectionExists;
    createCollection = mockCreateCollection;
    deleteCollection = mockDeleteCollection;
    upsert = mockUpsert;
    search = mockSearch;
    getCollection = mockGetCollection;
    delete = mockDelete;
    query = async (collectionName: string, args: Record<string, unknown>): Promise<unknown> => {
      if ('prefetch' in args) return mockQuery(collectionName, args);
      const points = await mockSearch(collectionName, args);
      return { points };
    };
    scroll = mockScroll;
    count = mockCount;
    createPayloadIndex = mockCreatePayloadIndex;
    retrieve = mockRetrieve;
  }
  return { QdrantClient: MockQdrantClient };
});

const makePoint = (id: string): VectorPoint => ({
  id,
  semantic: [0.1, 0.2, 0.3],
  signature: [0.4, 0.5, 0.6],
  sparse: { indices: [1, 5, 10], values: [1, 2, 1] },
  payload: {
    chunkId: id,
    filePath: '/src/foo.ts',
    relativePath: 'src/foo.ts',
    language: 'typescript',
    chunkType: 'function',
    name: 'myFunc',
    startLine: 1,
    endLine: 3,
    imports: [],
    exports: ['myFunc'],
    indexedAt: '2026-04-01T00:00:00Z',
  },
});

describe('QdrantVectorStore', () => {
  let store: QdrantVectorStore;

  beforeEach(() => {
    vi.clearAllMocks();
    mockCount.mockResolvedValue({ count: 0 });
    store = new QdrantVectorStore({
      host: 'localhost',
      port: 6333,
      collectionName: 'test-collection',
    });
  });

  it('Test 1: initialize() creates collection when it does not exist', async () => {
    mockCollectionExists.mockResolvedValue({ exists: false });
    mockCreateCollection.mockResolvedValue(true);

    await store.initialize({ textDimensions: 1536, codeDimensions: 1536 });

    expect(mockCollectionExists).toHaveBeenCalledWith('test-collection');
    expect(mockCreateCollection).toHaveBeenCalledWith('test-collection', {
      vectors: {
        semantic: { size: 1536, distance: 'Cosine' },
        signature: { size: 1536, distance: 'Cosine' },
      },
      sparse_vectors: {
        sparse: {
          modifier: 'idf',
        },
      },
    });
  });

  it('Test 2: initialize() is idempotent — skips createCollection if new-schema collection exists with matching dimensions', async () => {
    mockCollectionExists.mockResolvedValue({ exists: true });
    // Return collection info with NEW schema matching dimensions so no recreation is triggered
    mockGetCollection.mockResolvedValue({
      points_count: 0,
      status: 'green',
      config: {
        params: {
          vectors: {
            semantic: { size: 1536, distance: 'Cosine' },
            signature: { size: 1536, distance: 'Cosine' },
          },
        },
      },
    });

    await store.initialize({ textDimensions: 1536, codeDimensions: 1536 });

    expect(mockCollectionExists).toHaveBeenCalledWith('test-collection');
    expect(mockCreateCollection).not.toHaveBeenCalled();
  });

  it('Test 3: upsertBatch() calls client.upsert() with semantic/signature named vectors and lean payload', async () => {
    mockUpsert.mockResolvedValue({ status: 'completed', operation_id: 1 });

    const point = makePoint('chunk-abc');
    await store.upsertBatch([point]);

    expect(mockUpsert).toHaveBeenCalledOnce();
    const [collName, args] = mockUpsert.mock.calls[0] as [
      string,
      { wait: boolean; points: unknown[] },
    ];
    expect(collName).toBe('test-collection');
    expect(args.wait).toBe(true);
    expect(args.points).toHaveLength(1);

    const pt = args.points[0] as {
      id: string;
      vector: { semantic: number[]; signature: number[] };
      payload: Record<string, unknown>;
    };
    // ID must be UUID format (8-4-4-4-12 hex chars)
    expect(pt.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
    expect(pt.vector.semantic).toEqual([0.1, 0.2, 0.3]);
    expect(pt.vector.signature).toEqual([0.4, 0.5, 0.6]);
    expect(pt.payload['chunkId']).toBe('chunk-abc');
    // Lean payload: no raw code content stored in Qdrant (T031)
    expect(pt.payload).not.toHaveProperty('content');
  });

  it('Test 4: search() maps legacy vectorName "text" to "semantic" and returns SearchResult[]', async () => {
    const mockHit = {
      id: 'some-uuid',
      score: 0.92,
      payload: {
        chunkId: 'chunk-abc',
        filePath: '/src/foo.ts',
        relativePath: 'src/foo.ts',
        language: 'typescript',
        chunkType: 'function',
        startLine: 1,
        endLine: 3,
        imports: [],
        exports: ['myFunc'],
        indexedAt: '2026-04-01T00:00:00Z',
      },
    };
    mockSearch.mockResolvedValue([mockHit]);

    const queryVec = [0.1, 0.2, 0.3];
    const results = await store.search(queryVec, { vectorName: 'text', limit: 5 });

    // 'text' is mapped to 'semantic' in the search call
    expect(mockSearch).toHaveBeenCalledWith('test-collection', {
      query: queryVec,
      using: 'semantic',
      limit: 5,
      filter: { must_not: [{ key: 'kind', match: { value: '__ia_contract__' } }] },
      with_payload: true,
    });
    expect(results).toHaveLength(1);
    expect(results[0]!.id).toBe('chunk-abc');
    expect(results[0]!.score).toBe(0.92);
    // Result vectorName reflects the actual vector used in Qdrant
    expect(results[0]!.vectorName).toBe('semantic');
    expect(results[0]!.payload.filePath).toBe('/src/foo.ts');
  });

  it('T23: searchSparse() issues a named sparse query with filter and limit', async () => {
    mockSearch.mockResolvedValue([
      {
        id: 'sparse-hit',
        score: 0.91,
        payload: { ...makePoint('sparse-hit').payload },
      },
    ]);
    const sparse = { indices: [4, 10], values: [2, 1] };

    const results = await store.searchSparse(sparse, {
      limit: 7,
      filter: { must: [{ key: 'repoId', match: { value: 'repo-a' } }] },
    });

    expect(mockSearch).toHaveBeenCalledWith('test-collection', {
      query: sparse,
      using: 'sparse',
      limit: 7,
      filter: {
        must: [{ key: 'repoId', match: { value: 'repo-a' } }],
        must_not: [{ key: 'kind', match: { value: '__ia_contract__' } }],
      },
      with_payload: true,
    });
    expect(results[0]?.vectorName).toBe('sparse');
    expect(results[0]?.id).toBe('sparse-hit');
  });

  it('T23: searchSparse() returns deterministic score order and excludes reserved points', async () => {
    mockSearch.mockResolvedValue([
      { id: 'contract', score: 1, payload: { kind: '__ia_contract__', chunkId: '__contract__' } },
      { id: 'low', score: 0.2, payload: { ...makePoint('low').payload } },
      { id: 'high', score: 0.9, payload: { ...makePoint('high').payload } },
    ]);

    const first = await store.searchSparse({ indices: [1], values: [1] }, { limit: 10 });
    mockSearch.mockResolvedValue([
      { id: 'low', score: 0.2, payload: { ...makePoint('low').payload } },
      { id: 'high', score: 0.9, payload: { ...makePoint('high').payload } },
    ]);
    const second = await store.searchSparse({ indices: [1], values: [1] }, { limit: 10 });

    expect(first.map((result) => result.id)).toEqual(['high', 'low']);
    expect(second.map((result) => result.id)).toEqual(first.map((result) => result.id));
  });

  it('T23: searchSparse() distinguishes empty results from client failures', async () => {
    mockSearch.mockResolvedValueOnce([]).mockRejectedValueOnce(new Error('Qdrant unavailable'));

    await expect(store.searchSparse({ indices: [1], values: [1] }, { limit: 5 })).resolves.toEqual(
      [],
    );
    await expect(store.searchSparse({ indices: [1], values: [1] }, { limit: 5 })).rejects.toThrow(
      'Qdrant unavailable',
    );
  });

  it('T23: capabilities() reports sparse support and payload index state', () => {
    expect(store.capabilities()).toEqual({
      sparse: true,
      filterOnly: false,
      payloadIndexes: [],
    });
  });

  it('T23: searchSparse() always adds the reserved-point exclusion without a user filter', async () => {
    mockSearch.mockResolvedValue([]);

    await store.searchSparse({ indices: [8], values: [3] }, { limit: 2 });

    const [, args] = mockSearch.mock.calls[0] as [string, { filter: Record<string, unknown> }];
    expect(args.filter).toEqual({
      must_not: [{ key: 'kind', match: { value: '__ia_contract__' } }],
    });
  });

  it('T23: searchSparse() preserves decoded payload metadata', async () => {
    mockSearch.mockResolvedValue([
      {
        id: 'payload-id',
        score: 0.4,
        payload: {
          ...makePoint('payload-id').payload,
          repoId: 'repo-a',
          chunkIndex: 4,
        },
      },
    ]);

    const results = await store.searchSparse({ indices: [3], values: [1] }, { limit: 1 });

    expect(results[0]?.payload.repoId).toBe('repo-a');
    expect(results[0]?.payload.chunkIndex).toBe(4);
  });

  it('T23: searchSparse() falls back to the point id when chunkId is absent', async () => {
    mockSearch.mockResolvedValue([
      {
        id: 'point-id',
        score: 0.4,
        payload: { ...makePoint('fallback').payload, chunkId: undefined },
      },
    ]);

    const results = await store.searchSparse({ indices: [3], values: [1] }, { limit: 1 });

    expect(results[0]?.id).toBe('point-id');
  });

  it('T23: searchSparse() orders equal scores by stable point id', async () => {
    mockSearch.mockResolvedValue([
      { id: 'z-point', score: 0.5, payload: { ...makePoint('z').payload } },
      { id: 'a-point', score: 0.5, payload: { ...makePoint('a').payload } },
    ]);

    const results = await store.searchSparse({ indices: [3], values: [1] }, { limit: 2 });

    expect(results.map((result) => result.id)).toEqual(['a', 'z']);
  });

  it('T23: searchSparse() sends the requested limit unchanged', async () => {
    mockSearch.mockResolvedValue([]);

    await store.searchSparse({ indices: [3], values: [1] }, { limit: 13 });

    const [, args] = mockSearch.mock.calls[0] as [string, { limit: number }];
    expect(args.limit).toBe(13);
  });

  it('T23: searchSparse() preserves indices and values in the named query', async () => {
    mockSearch.mockResolvedValue([]);
    const vector = { indices: [2, 9, 15], values: [1, 4, 2] };

    await store.searchSparse(vector, { limit: 3 });

    const [, args] = mockSearch.mock.calls[0] as [string, { query: unknown; using: string }];
    expect(args.query).toEqual(vector);
    expect(args.using).toBe('sparse');
  });

  it('excludes reserved contract points from search with no caller filter', async () => {
    mockSearch.mockResolvedValue([
      {
        id: 'contract-id',
        score: 1,
        payload: { kind: '__ia_contract__', chunkId: '__contract__' },
      },
      {
        id: 'chunk-id',
        score: 0.9,
        payload: { ...makePoint('chunk-id').payload },
      },
    ]);

    const results = await store.search([0.1, 0.2, 0.3], { vectorName: 'semantic', limit: 5 });
    const [, args] = mockSearch.mock.calls[0] as [string, { filter: Record<string, unknown> }];

    expect(args.filter.must_not).toEqual([{ key: 'kind', match: { value: '__ia_contract__' } }]);
    expect(results.map((result) => result.id)).toEqual(['chunk-id']);
  });

  it('Test 5: getCollectionInfo() returns CollectionInfo with point count and dimensions', async () => {
    mockGetCollection.mockResolvedValue({
      points_count: 42,
      status: 'green',
      config: {
        params: {
          vectors: {
            text: { size: 1536, distance: 'Cosine' },
            code: { size: 768, distance: 'Cosine' },
          },
        },
      },
    });

    const info = await store.getCollectionInfo();

    expect(mockGetCollection).toHaveBeenCalledWith('test-collection');
    expect(info.name).toBe('test-collection');
    expect(info.pointCount).toBe(42);
    expect(info.status).toBe('green');
    expect(info.vectorDimensions.text).toBe(1536);
    expect(info.vectorDimensions.code).toBe(768);
    expect(info.hasSparseVector).toBe(false);
  });

  it('Test 6: deleteByFilter() calls client.delete() with filter', async () => {
    mockDelete.mockResolvedValue({ status: 'completed', operation_id: 2 });
    mockCount.mockResolvedValue({ count: 3 });

    const filter = { must: [{ key: 'filePath', match: { value: '/src/foo.ts' } }] };
    await expect(store.deleteByFilter(filter)).resolves.toBe(3);

    expect(mockCount).toHaveBeenCalledWith('test-collection', {
      filter: {
        ...filter,
        must_not: [{ key: 'kind', match: { value: '__ia_contract__' } }],
      },
      exact: true,
    });
    expect(mockDelete).toHaveBeenCalledWith('test-collection', {
      wait: true,
      filter,
    });
  });

  it('Test 7: deleteByIds() calls client.delete() with UUID-converted point IDs', async () => {
    mockDelete.mockResolvedValue({ status: 'completed', operation_id: 3 });

    await store.deleteByIds(['chunk-abc', 'chunk-def']);

    expect(mockDelete).toHaveBeenCalledOnce();
    const [collName, args] = mockDelete.mock.calls[0] as [
      string,
      { wait: boolean; points: string[] },
    ];
    expect(collName).toBe('test-collection');
    expect(args.wait).toBe(true);
    expect(args.points).toHaveLength(2);
    // Each ID should be UUID format
    for (const id of args.points) {
      expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
    }
  });

  it('Test 8: upsertBatch([]) is a no-op — does not call client.upsert()', async () => {
    await store.upsertBatch([]);
    expect(mockUpsert).not.toHaveBeenCalled();
  });

  it('Test 9: initialize() includes sparse_vectors.sparse.modifier=idf in createCollection call', async () => {
    mockCollectionExists.mockResolvedValue({ exists: false });
    mockCreateCollection.mockResolvedValue(true);

    await store.initialize({ textDimensions: 768, codeDimensions: 768 });

    const [, args] = mockCreateCollection.mock.calls[0] as [string, Record<string, unknown>];
    expect(args).toHaveProperty('sparse_vectors');
    expect(args['sparse_vectors']).toEqual({
      sparse: { modifier: 'idf' },
    });
  });

  it('Test 10: upsertBatch() includes sparse vector in Qdrant payload', async () => {
    mockUpsert.mockResolvedValue({ status: 'completed', operation_id: 1 });

    const point: VectorPoint = {
      ...makePoint('chunk-sparse'),
      sparse: { indices: [1, 2, 3], values: [0.5, 1.0, 0.5] },
    };
    await store.upsertBatch([point]);

    const [, args] = mockUpsert.mock.calls[0] as [
      string,
      { points: Array<{ vector: { semantic: number[]; signature: number[]; sparse?: unknown } }> },
    ];
    expect(args.points[0]!.vector).toHaveProperty('sparse');
    expect(args.points[0]!.vector.sparse).toEqual({ indices: [1, 2, 3], values: [0.5, 1.0, 0.5] });
  });

  it('Test 11: upsertBatch() does NOT store the content field in the Qdrant payload (lean payload — T031)', async () => {
    mockUpsert.mockResolvedValue({ status: 'completed', operation_id: 1 });

    // Even when the caller sets the deprecated content field, it must not be stored.
    const pointWithContent: VectorPoint = {
      ...makePoint('chunk-no-content'),
      payload: {
        ...makePoint('chunk-no-content').payload,
        content: 'function myFunc() {}', // @deprecated field — must not be stored
      },
    };
    await store.upsertBatch([pointWithContent]);

    const [, args] = mockUpsert.mock.calls[0] as [
      string,
      { points: Array<{ vector: unknown; payload: Record<string, unknown> }> },
    ];
    // The previous version's only assertion was `toHaveProperty('chunkId')`, which
    // proved nothing about content — while the comment claimed the opposite of the
    // adapter's real behavior. FLT-13 is genuinely enforced here, so assert it:
    expect(args.points[0]!.payload).not.toHaveProperty('content');
    expect(args.points[0]!.payload.content).toBeUndefined();
    // The rest of the payload still round-trips, so this is stripping, not dropping.
    expect(args.points[0]!.payload).toHaveProperty('chunkId', 'chunk-no-content');
    expect(args.points[0]!.payload).toHaveProperty('relativePath');
  });

  it('T17: round-trips every declared lean payload field through write and decode', async () => {
    const payloadValues: Record<string, unknown> = {
      chunkId: 'round-trip',
      filePath: '/src/round-trip.ts',
      relativePath: 'src/round-trip.ts',
      repoId: 'repo-a',
      startLine: 10,
      endLine: 20,
      contentHash: 'hash',
      signature: 'function roundTrip()',
      classSignature: 'class RoundTrip',
      contextHeader: 'class RoundTrip {}',
      language: 'typescript',
      chunkType: 'function',
      name: 'roundTrip',
      parentName: 'RoundTrip',
      parentStartLine: 5,
      parentEndLine: 40,
      partIndex: 2,
      totalParts: 3,
      packageName: 'com.example',
      moduleInfo: { group: 'com.example', module: 'core', submodule: 'api' },
      mavenCoordinates: { groupId: 'com.example', artifactId: 'core', version: '1.0.0' },
      mavenModule: { groupId: 'com.example', artifactId: 'core', version: '1.0.0' },
      visibility: 'public',
      annotations: ['@Transactional'],
      imports: ['node:fs'],
      exports: ['roundTrip'],
      defines: ['roundTrip'],
      calls: ['save'],
      calledBy: ['controller'],
      superclass: 'BaseRoundTrip',
      interfaces: ['Runnable'],
      isInnerClass: false,
      modulePath: 'core/api',
      layerHints: ['service'],
      stereotype: 'service',
      archLayer: 'service',
      complexity: 'low',
      annotationMeta: { operationSummaries: ['Round trip'] },
      description: 'Round-trip fixture',
      businessContext: 'Testing metadata persistence',
      serviceBoundary: 'internal',
      semanticTags: ['round-trip'],
      relationships: [{ target: 'controller', type: 'called-by', label: 'entry point' }],
      dependencyEdges: [{ targetPath: 'src/save.ts', relation: 'calls', symbols: ['save'] }],
      indexedAt: '2026-04-01T00:00:00Z',
      enrichedAt: '2026-04-01T00:00:01Z',
      enrichmentModel: 'model-1',
      qualityScore: 0.9,
      chunkIndex: 2,
      totalChunks: 5,
      docCommentStartLine: 7,
      annotationStartLine: 8,
      signatureOnly: true,
      tokenizerVersion: 1,
    };
    const point = makePoint('round-trip');
    point.payload = payloadValues as unknown as VectorPoint['payload'];
    mockUpsert.mockResolvedValue({ status: 'completed' });
    await store.upsertBatch([point]);
    const [, upsertArgs] = mockUpsert.mock.calls[0] as [
      string,
      { points: Array<{ payload: Record<string, unknown> }> },
    ];
    mockSearch.mockResolvedValue([
      { id: 'round-trip', score: 1, payload: upsertArgs.points[0]!.payload },
    ]);

    const result = await store.search([0.1, 0.2, 0.3], { vectorName: 'semantic', limit: 1 });
    const decoded = result[0]!.payload as unknown as Record<string, unknown>;
    const declaredFields = Object.keys(payloadValues);

    for (const field of declaredFields) {
      expect(decoded[field], `field ${field} should round-trip`).toEqual(payloadValues[field]);
    }
  });

  it('T17: decodes annotationMeta with its structured values', async () => {
    mockSearch.mockResolvedValue([
      {
        id: 'annotation-meta',
        score: 1,
        payload: {
          ...makePoint('annotation-meta').payload,
          annotationMeta: {
            operationSummaries: ['Create entry'],
            endpointPaths: ['/entries'],
            httpMethods: ['POST'],
            tagName: 'Entries',
          },
        },
      },
    ]);

    const result = await store.search([0.1, 0.2, 0.3], { vectorName: 'semantic', limit: 1 });

    expect(result[0]!.payload.annotationMeta).toEqual({
      operationSummaries: ['Create entry'],
      endpointPaths: ['/entries'],
      httpMethods: ['POST'],
      tagName: 'Entries',
    });
  });

  it('T17: decodes chunkIndex to its stored position instead of a constant fallback', async () => {
    mockSearch.mockResolvedValue([
      {
        id: 'indexed',
        score: 1,
        payload: { ...makePoint('indexed').payload, chunkIndex: 7, totalChunks: 12 },
      },
    ]);

    const result = await store.search([0.1, 0.2, 0.3], { vectorName: 'semantic', limit: 1 });

    expect(result[0]!.payload.chunkIndex).toBe(7);
    expect(result[0]!.payload.totalChunks).toBe(12);
  });

  it('T17: decodes calledBy call-chain metadata', async () => {
    mockSearch.mockResolvedValue([
      {
        id: 'called-by',
        score: 1,
        payload: { ...makePoint('called-by').payload, calledBy: ['controller.create'] },
      },
    ]);

    const result = await store.search([0.1, 0.2, 0.3], { vectorName: 'semantic', limit: 1 });

    expect(result[0]!.payload.calledBy).toEqual(['controller.create']);
  });

  it('T17: decodes all four additive context and embedding fields', async () => {
    mockSearch.mockResolvedValue([
      {
        id: 'additions',
        score: 1,
        payload: {
          ...makePoint('additions').payload,
          docCommentStartLine: 4,
          annotationStartLine: 5,
          signatureOnly: true,
          tokenizerVersion: 3,
        },
      },
    ]);

    const result = await store.search([0.1, 0.2, 0.3], { vectorName: 'semantic', limit: 1 });

    expect(result[0]!.payload.docCommentStartLine).toBe(4);
    expect(result[0]!.payload.annotationStartLine).toBe(5);
    expect(result[0]!.payload.signatureOnly).toBe(true);
    expect(result[0]!.payload.tokenizerVersion).toBe(3);
  });

  it('T17: leaves additive fields undefined when older payloads omit them', async () => {
    mockSearch.mockResolvedValue([
      { id: 'legacy', score: 1, payload: makePoint('legacy').payload },
    ]);

    const result = await store.search([0.1, 0.2, 0.3], { vectorName: 'semantic', limit: 1 });

    expect(result[0]!.payload.docCommentStartLine).toBeUndefined();
    expect(result[0]!.payload.annotationStartLine).toBeUndefined();
    expect(result[0]!.payload.signatureOnly).toBeUndefined();
    expect(result[0]!.payload.tokenizerVersion).toBeUndefined();
  });

  it('T17: keeps code payload writes lean without a raw content field', async () => {
    mockUpsert.mockResolvedValue({ status: 'completed' });
    await store.upsertBatch([
      {
        ...makePoint('lean-code'),
        payload: { ...makePoint('lean-code').payload, content: 'const rawCode = true;' },
      },
    ]);

    const [, args] = mockUpsert.mock.calls[0] as [
      string,
      { points: Array<{ payload: Record<string, unknown> }> },
    ];

    expect(args.points[0]!.payload).not.toHaveProperty('content');
  });

  it('T17: writes the additive context and signature-only fields to the payload', async () => {
    mockUpsert.mockResolvedValue({ status: 'completed' });
    await store.upsertBatch([
      {
        ...makePoint('additive-write'),
        payload: {
          ...makePoint('additive-write').payload,
          docCommentStartLine: 4,
          annotationStartLine: 5,
          signatureOnly: true,
          tokenizerVersion: 3,
        },
      },
    ]);

    const [, args] = mockUpsert.mock.calls[0] as [
      string,
      { points: Array<{ payload: Record<string, unknown> }> },
    ];

    expect(args.points[0]!.payload).toMatchObject({
      docCommentStartLine: 4,
      annotationStartLine: 5,
      signatureOnly: true,
      tokenizerVersion: 3,
    });
  });

  it('Test 12: searchHybrid() calls client.query() with 3 prefetch entries', async () => {
    const mockResult = {
      id: 'some-uuid',
      score: 0.85,
      payload: {
        chunkId: 'chunk-hybrid',
        filePath: '/src/foo.ts',
        relativePath: 'src/foo.ts',
        language: 'typescript',
        chunkType: 'function',
        content: 'function foo() {}',
        startLine: 1,
        endLine: 3,
        imports: [],
        exports: ['foo'],
        indexedAt: '2026-04-01T00:00:00Z',
      },
    };
    // client.query() returns { points: ScoredPoint[] } (Schemas['QueryResponse'])
    mockQuery.mockResolvedValue({ points: [mockResult] });

    const denseVector = [0.1, 0.2, 0.3];
    const sparseVector = { indices: [100, 200], values: [1, 2] };

    const results = await store.searchHybrid({
      semanticVector: denseVector,
      signatureVector: [0.4, 0.5, 0.6],
      sparseVector,
      limit: 10,
    });

    expect(mockQuery).toHaveBeenCalledOnce();
    const [collName, args] = mockQuery.mock.calls[0] as [
      string,
      { prefetch: unknown[]; query: unknown; limit: number; with_payload: boolean },
    ];
    expect(collName).toBe('test-collection');
    expect(args.prefetch).toHaveLength(3);
    expect(args.limit).toBe(10);
    expect(args.with_payload).toBe(true);

    expect(results).toHaveLength(1);
    expect(results[0]!.id).toBe('chunk-hybrid');
    expect(results[0]!.score).toBe(0.85);
    expect(results[0]!.vectorName).toBe('semantic');
  });

  it('excludes reserved contract points from hybrid search and preserves caller filters', async () => {
    mockQuery.mockResolvedValue({
      points: [
        {
          id: 'contract-id',
          score: 1,
          payload: { kind: '__ia_contract__', chunkId: '__contract__' },
        },
        { id: 'chunk-id', score: 0.9, payload: { ...makePoint('chunk-id').payload } },
      ],
    });

    const results = await store.searchHybrid({
      semanticVector: [0.1, 0.2, 0.3],
      signatureVector: [0.4, 0.5, 0.6],
      sparseVector: { indices: [1], values: [1] },
      limit: 5,
      filter: { must: [{ key: 'repoId', match: { value: 'repo-a' } }] },
    });
    const [, args] = mockQuery.mock.calls[0] as [string, { filter: Record<string, unknown> }];

    expect(args.filter).toEqual({
      must: [{ key: 'repoId', match: { value: 'repo-a' } }],
      must_not: [{ key: 'kind', match: { value: '__ia_contract__' } }],
    });
    expect(results.map((result) => result.id)).toEqual(['chunk-id']);
  });

  it('excludes reserved contract points from scroll and count', async () => {
    mockScroll.mockResolvedValue({
      points: [
        { id: 'contract-id', payload: { kind: '__ia_contract__', chunkId: '__contract__' } },
        { id: 'chunk-id', payload: { ...makePoint('chunk-id').payload } },
      ],
    });
    mockCount.mockResolvedValue({ count: 1 });

    const scroll = await store.scroll({ limit: 10 });
    const count = await store.countPoints();
    const [, scrollArgs] = mockScroll.mock.calls[0] as [
      string,
      { filter: Record<string, unknown> },
    ];
    const [, countArgs] = mockCount.mock.calls[0] as [string, { filter: Record<string, unknown> }];

    expect(scrollArgs.filter.must_not).toEqual([
      { key: 'kind', match: { value: '__ia_contract__' } },
    ]);
    expect(countArgs.filter.must_not).toEqual([
      { key: 'kind', match: { value: '__ia_contract__' } },
    ]);
    expect(scroll.points.map((point) => point.payload.chunkId)).toEqual(['chunk-id']);
    expect(count).toBe(1);
  });

  it('Test 13: searchHybrid() passes { fusion: rrf } as the top-level query', async () => {
    mockQuery.mockResolvedValue({ points: [] });

    await store.searchHybrid({
      semanticVector: [0.1, 0.2, 0.3],
      signatureVector: [0.4, 0.5, 0.6],
      sparseVector: { indices: [1], values: [1] },
      limit: 5,
    });

    const [, args] = mockQuery.mock.calls[0] as [string, { query: { fusion: string } }];
    expect(args.query).toEqual({ fusion: 'rrf' });
  });

  it('T24: searchHybrid() sends distinct semantic and signature vectors', async () => {
    mockQuery.mockResolvedValue({ points: [] });

    await store.searchHybrid({
      semanticVector: [1, 2, 3],
      signatureVector: [4, 5, 6],
      sparseVector: { indices: [1], values: [1] },
      limit: 4,
    });

    const [, args] = mockQuery.mock.calls[0] as [
      string,
      { prefetch: Array<Record<string, unknown>> },
    ];
    expect(args.prefetch[0]?.query).toEqual({ nearest: [1, 2, 3] });
    expect(args.prefetch[1]?.query).toEqual({ nearest: [4, 5, 6] });
  });

  it('T24: searchHybrid() omits sparse prefetch when sparse input is absent', async () => {
    mockQuery.mockResolvedValue({ points: [] });

    await store.searchHybrid({
      semanticVector: [1, 2, 3],
      signatureVector: [4, 5, 6],
      limit: 4,
    });

    const [, args] = mockQuery.mock.calls[0] as [string, { prefetch: unknown[] }];
    expect(args.prefetch).toHaveLength(2);
  });

  it('T24: searchHybrid() preserves result branch provenance from the response', async () => {
    mockQuery.mockResolvedValue({
      points: [
        {
          id: 'signature-hit',
          score: 0.8,
          vector_name: 'signature',
          payload: makePoint('signature-hit').payload,
        },
      ],
    });

    const results = await store.searchHybrid({
      semanticVector: [1, 2, 3],
      signatureVector: [4, 5, 6],
      sparseVector: { indices: [1], values: [1] },
      limit: 4,
    });

    expect(results[0]?.vectorName).toBe('signature');
  });

  it('T24: searchHybrid() maps missing branch provenance to the selected semantic default', async () => {
    mockQuery.mockResolvedValue({
      points: [{ id: 'hit', score: 0.8, payload: makePoint('hit').payload }],
    });

    const results = await store.searchHybrid({
      semanticVector: [1, 2, 3],
      signatureVector: [4, 5, 6],
      sparseVector: { indices: [1], values: [1] },
      limit: 4,
    });

    expect(results[0]?.vectorName).toBe('semantic');
  });

  it('T24: searchHybrid() keeps filter and limit alongside all branches', async () => {
    mockQuery.mockResolvedValue({ points: [] });

    await store.searchHybrid({
      semanticVector: [1, 2, 3],
      signatureVector: [4, 5, 6],
      sparseVector: { indices: [1], values: [1] },
      limit: 6,
      filter: { must: [{ key: 'repoId', match: { value: 'repo-a' } }] },
    });

    const [, args] = mockQuery.mock.calls[0] as [
      string,
      { limit: number; filter: Record<string, unknown> },
    ];
    expect(args.limit).toBe(6);
    expect(args.filter).toMatchObject({ must: [{ key: 'repoId', match: { value: 'repo-a' } }] });
  });

  it('T24: searchHybrid() returns an empty list when Qdrant returns no points', async () => {
    mockQuery.mockResolvedValue({ points: [] });

    await expect(
      store.searchHybrid({
        semanticVector: [1, 2, 3],
        signatureVector: [4, 5, 6],
        limit: 4,
      }),
    ).resolves.toEqual([]);
  });

  it('Test 14: getCollectionInfo() returns hasSparseVector=true when sparse slot exists', async () => {
    mockGetCollection.mockResolvedValue({
      points_count: 10,
      status: 'green',
      config: {
        params: {
          vectors: {
            text: { size: 768, distance: 'Cosine' },
            code: { size: 768, distance: 'Cosine' },
          },
          sparse_vectors: {
            sparse: { modifier: 'idf' },
          },
        },
      },
    });

    const info = await store.getCollectionInfo();

    expect(info.hasSparseVector).toBe(true);
  });

  it('Test 15: initialize() with force=true deletes and recreates collection when old schema (text/code) detected', async () => {
    mockCollectionExists.mockResolvedValue({ exists: true });
    mockGetCollection.mockResolvedValue({
      points_count: 100,
      status: 'green',
      config: {
        params: {
          vectors: {
            text: { size: 768, distance: 'Cosine' },
            code: { size: 768, distance: 'Cosine' },
          },
        },
      },
    });
    mockDeleteCollection.mockResolvedValue(true);
    mockCreateCollection.mockResolvedValue(true);

    // Must NOT throw — force=true should delete and recreate
    await expect(
      store.initialize({ textDimensions: 768, codeDimensions: 768, force: true }),
    ).resolves.not.toThrow();

    expect(mockDeleteCollection).toHaveBeenCalledWith('test-collection');
    expect(mockCreateCollection).toHaveBeenCalledWith(
      'test-collection',
      expect.objectContaining({
        vectors: {
          semantic: { size: 768, distance: 'Cosine' },
          signature: { size: 768, distance: 'Cosine' },
        },
      }),
    );
  });

  it('Test 16: initialize() without force throws [OLD_SCHEMA] when old schema (text/code) detected', async () => {
    mockCollectionExists.mockResolvedValue({ exists: true });
    mockGetCollection.mockResolvedValue({
      points_count: 100,
      status: 'green',
      config: {
        params: {
          vectors: {
            text: { size: 768, distance: 'Cosine' },
            code: { size: 768, distance: 'Cosine' },
          },
        },
      },
    });

    await expect(store.initialize({ textDimensions: 768, codeDimensions: 768 })).rejects.toThrow(
      '[OLD_SCHEMA]',
    );

    expect(mockDeleteCollection).not.toHaveBeenCalled();
  });

  it('T14: absent collection creates, writes the contract, then creates payload indexes in order', async () => {
    const order: string[] = [];
    mockCollectionExists.mockResolvedValue({ exists: false });
    mockCreateCollection.mockImplementation(() => {
      order.push('createCollection');
      return Promise.resolve(true);
    });
    mockUpsert.mockImplementation(() => {
      order.push('writeContract');
      return Promise.resolve({ status: 'completed' });
    });
    mockCreatePayloadIndex.mockImplementation(
      (_collection: string, args: { field_name: string }) => {
        order.push(`index:${args.field_name}`);
        return Promise.resolve(true);
      },
    );

    await store.initialize({
      textDimensions: 3,
      codeDimensions: 3,
      embeddingContract: ACTIVE_CONTRACT,
      indexGeneration: 'generation-1',
    } as never);

    expect(order[0]).toBe('createCollection');
    expect(order[1]).toBe('writeContract');
    expect(order.slice(2)).toHaveLength(11);
    expect(mockCreatePayloadIndex).toHaveBeenCalledTimes(11);
  });

  it('T14: dimension mismatch throws CollectionSchemaError without deleting the collection', async () => {
    mockCollectionExists.mockResolvedValue({ exists: true });
    mockGetCollection.mockResolvedValue({
      config: {
        params: {
          vectors: {
            semantic: { size: 2, distance: 'Cosine' },
            signature: { size: 3, distance: 'Cosine' },
          },
        },
      },
    });

    const error = await store
      .initialize({
        textDimensions: 3,
        codeDimensions: 3,
        embeddingContract: ACTIVE_CONTRACT,
        indexGeneration: 'generation-1',
      } as never)
      .catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(CollectionSchemaError);
    expect((error as Error).message).toContain('ia index --force');
    expect(mockDeleteCollection).not.toHaveBeenCalled();
  });

  it('T14: force permits destructive recreation for a declared dimension mismatch', async () => {
    mockCollectionExists.mockResolvedValue({ exists: true });
    mockGetCollection.mockResolvedValue({
      config: {
        params: {
          vectors: {
            semantic: { size: 2, distance: 'Cosine' },
            signature: { size: 3, distance: 'Cosine' },
          },
        },
      },
    });
    mockDeleteCollection.mockResolvedValue(true);
    mockCreateCollection.mockResolvedValue(true);
    mockCreatePayloadIndex.mockResolvedValue(true);

    await expect(
      store.initialize({ textDimensions: 3, codeDimensions: 3, force: true } as never),
    ).resolves.toBeUndefined();

    expect(mockDeleteCollection).toHaveBeenCalledWith('test-collection');
    expect(mockCreateCollection).toHaveBeenCalledWith(
      'test-collection',
      expect.objectContaining({
        vectors: {
          semantic: { size: 3, distance: 'Cosine' },
          signature: { size: 3, distance: 'Cosine' },
        },
      }),
    );
  });

  it.each([
    ['undefined vectors', undefined],
    ['empty vectors', {}],
  ])('T14: %s fails closed as an unreadable schema', async (_label, vectors) => {
    mockCollectionExists.mockResolvedValue({ exists: true });
    mockGetCollection.mockResolvedValue({ config: { params: { vectors } } });

    await expect(
      store.initialize({
        textDimensions: 3,
        codeDimensions: 3,
        embeddingContract: ACTIVE_CONTRACT,
        indexGeneration: 'generation-1',
      } as never),
    ).rejects.toBeInstanceOf(CollectionSchemaError);
    expect(mockDeleteCollection).not.toHaveBeenCalled();
  });

  it('T14: matching schema and contract reconciles indexes on the no-op path', async () => {
    mockCollectionExists.mockResolvedValue({ exists: true });
    mockGetCollection.mockResolvedValue({
      points_count: 42,
      config: {
        params: {
          vectors: {
            semantic: { size: 3, distance: 'Cosine' },
            signature: { size: 3, distance: 'Cosine' },
          },
        },
      },
    });
    mockRetrieve.mockResolvedValue([
      {
        payload: {
          kind: '__ia_contract__',
          ...ACTIVE_CONTRACT,
          indexGeneration: 'generation-1',
          writtenAt: '2026-08-08T00:00:00.000Z',
        },
      },
    ]);

    await store.initialize({
      textDimensions: 3,
      codeDimensions: 3,
      embeddingContract: ACTIVE_CONTRACT,
      indexGeneration: 'generation-1',
    } as never);

    expect(mockCreateCollection).not.toHaveBeenCalled();
    expect(mockCreatePayloadIndex).toHaveBeenCalledTimes(11);
    expect(mockUpsert).not.toHaveBeenCalled();
    expect(mockDeleteCollection).not.toHaveBeenCalled();
  });

  it('T14: payload index failure raises PayloadIndexError naming the field', async () => {
    mockCollectionExists.mockResolvedValue({ exists: false });
    mockCreateCollection.mockResolvedValue(true);
    mockUpsert.mockResolvedValue({ status: 'completed' });
    mockCreatePayloadIndex.mockRejectedValueOnce(new Error('permission denied'));

    const error = await store
      .initialize({
        textDimensions: 3,
        codeDimensions: 3,
        embeddingContract: ACTIVE_CONTRACT,
        indexGeneration: 'generation-1',
      } as never)
      .catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(PayloadIndexError);
    expect((error as Error).message).toContain('stereotype');
    expect((error as Error).message).toContain('Suggestion:');
  });

  it('T14: existing populated collection adds indexes without destructive writes', async () => {
    mockCollectionExists.mockResolvedValue({ exists: true });
    mockGetCollection.mockResolvedValue({
      points_count: 100,
      config: {
        params: {
          vectors: {
            semantic: { size: 3, distance: 'Cosine' },
            signature: { size: 3, distance: 'Cosine' },
          },
        },
      },
    });
    mockRetrieve.mockResolvedValue([
      {
        payload: {
          kind: '__ia_contract__',
          ...ACTIVE_CONTRACT,
          indexGeneration: 'generation-1',
          writtenAt: '2026-08-08T00:00:00.000Z',
        },
      },
    ]);

    await store.initialize({
      textDimensions: 3,
      codeDimensions: 3,
      embeddingContract: ACTIVE_CONTRACT,
      indexGeneration: 'generation-1',
    } as never);

    expect(mockCreatePayloadIndex).toHaveBeenCalled();
    expect(mockUpsert).not.toHaveBeenCalled();
    expect(mockDeleteCollection).not.toHaveBeenCalled();
  });

  it('F2.1: a VectorStore-typed store accepts embeddingContract and indexGeneration and persists them', async () => {
    mockCollectionExists.mockResolvedValue({ exists: false });
    mockCreateCollection.mockResolvedValue(true);
    mockUpsert.mockResolvedValue({ status: 'completed' });
    mockCreatePayloadIndex.mockResolvedValue(true);

    // Typed as the *interface*, not the concrete class: this is the surface the
    // indexer pipeline sees, and the narrow declaration is what blocked the contract.
    const typedStore: VectorStore = store;
    await typedStore.initialize({
      textDimensions: 3,
      codeDimensions: 3,
      embeddingContract: ACTIVE_CONTRACT,
      indexGeneration: 'generation-f21',
    });

    expect(mockUpsert).toHaveBeenCalledTimes(1);
    const [, upsertArgs] = mockUpsert.mock.calls[0] as [
      string,
      { points: Array<{ id: string; payload: StoredContract }> },
    ];
    expect(upsertArgs.points[0]?.id).toBe(CONTRACT_POINT_ID);
    expect(upsertArgs.points[0]?.payload).toMatchObject({
      kind: '__ia_contract__',
      provider: ACTIVE_CONTRACT.provider,
      model: ACTIVE_CONTRACT.model,
      dimension: ACTIVE_CONTRACT.dimension,
      tokenizerVersion: ACTIVE_CONTRACT.tokenizerVersion,
      sparseHashVersion: ACTIVE_CONTRACT.sparseHashVersion,
      indexGeneration: 'generation-f21',
    });
  });

  it('F2.1: a VectorStore-typed store still initializes without the optional contract fields', async () => {
    mockCollectionExists.mockResolvedValue({ exists: false });
    mockCreateCollection.mockResolvedValue(true);
    mockCreatePayloadIndex.mockResolvedValue(true);

    const typedStore: VectorStore = store;
    await typedStore.initialize({ textDimensions: 3, codeDimensions: 3 });

    expect(mockCreateCollection).toHaveBeenCalledTimes(1);
    expect(mockUpsert).not.toHaveBeenCalled();
  });

  it('T34: declares an index for every effective and expansion filter key', async () => {
    mockCollectionExists.mockResolvedValue({ exists: false });
    mockCreateCollection.mockResolvedValue(true);
    mockCreatePayloadIndex.mockResolvedValue(true);

    await store.initialize({ textDimensions: 3, codeDimensions: 3 });

    const declaredFields = mockCreatePayloadIndex.mock.calls.map(
      ([, args]) => (args as { field_name: string }).field_name,
    );
    expect(new Set(declaredFields)).toEqual(new Set(collectFilterIndexKeys(FILTER_INDEX_SURFACE)));
  });

  it('T34: indexes the reserved kind exclusion field', async () => {
    mockCollectionExists.mockResolvedValue({ exists: false });
    mockCreateCollection.mockResolvedValue(true);
    mockCreatePayloadIndex.mockResolvedValue(true);

    await store.initialize({ textDimensions: 3, codeDimensions: 3 });

    expect(
      mockCreatePayloadIndex.mock.calls.map(
        ([, args]) => (args as { field_name: string }).field_name,
      ),
    ).toContain('kind');
  });

  it('T34: uses an integer index for adjacent chunk positions', async () => {
    mockCollectionExists.mockResolvedValue({ exists: false });
    mockCreateCollection.mockResolvedValue(true);
    mockCreatePayloadIndex.mockResolvedValue(true);

    await store.initialize({ textDimensions: 3, codeDimensions: 3 });

    const chunkIndexCall = mockCreatePayloadIndex.mock.calls.find(
      ([, args]) => (args as { field_name: string }).field_name === 'chunkIndex',
    );
    expect(chunkIndexCall?.[1]).toEqual({ field_name: 'chunkIndex', field_schema: 'integer' });
  });

  it('T34: indexes both nested dependency-edge fields', async () => {
    mockCollectionExists.mockResolvedValue({ exists: false });
    mockCreateCollection.mockResolvedValue(true);
    mockCreatePayloadIndex.mockResolvedValue(true);

    await store.initialize({ textDimensions: 3, codeDimensions: 3 });

    expect(
      mockCreatePayloadIndex.mock.calls.map(
        ([, args]) => (args as { field_name: string }).field_name,
      ),
    ).toEqual(
      expect.arrayContaining(['dependencyEdges[].targetPath', 'dependencyEdges[].relation']),
    );
  });

  it('T34: reports the field and filtering impact when index creation fails', async () => {
    mockCollectionExists.mockResolvedValue({ exists: false });
    mockCreateCollection.mockResolvedValue(true);
    mockCreatePayloadIndex.mockImplementation(
      (_collection: string, args: { field_name: string }) => {
        if (args.field_name === 'chunkIndex') {
          return Promise.reject(new Error('permission denied'));
        }
        return Promise.resolve(true);
      },
    );

    const error = await store
      .initialize({ textDimensions: 3, codeDimensions: 3 })
      .catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(PayloadIndexError);
    expect((error as Error).message).toContain('chunkIndex');
    expect((error as Error).message).toContain('unindexed full scan');
  });

  it('T34: reconciles all indexes on a populated collection without destructive operations', async () => {
    mockCollectionExists.mockResolvedValue({ exists: true });
    mockGetCollection.mockResolvedValue({
      points_count: 100,
      config: {
        params: {
          vectors: {
            semantic: { size: 3, distance: 'Cosine' },
            signature: { size: 3, distance: 'Cosine' },
          },
        },
      },
    });
    mockCreatePayloadIndex.mockResolvedValue(true);

    await store.initialize({ textDimensions: 3, codeDimensions: 3 });

    expect(mockCreatePayloadIndex).toHaveBeenCalledTimes(11);
    expect(mockDeleteCollection).not.toHaveBeenCalled();
    expect(mockDelete).not.toHaveBeenCalled();
  });
});
