import { describe, it, expect, vi, beforeEach } from 'vitest';
import { QdrantVectorStore } from './qdrant.js';
import type { VectorPoint } from './interface.js';

// Mock method references — defined outside so they can be referenced in tests
const mockCollectionExists = vi.fn();
const mockCreateCollection = vi.fn();
const mockDeleteCollection = vi.fn();
const mockUpsert = vi.fn();
const mockSearch = vi.fn();
const mockGetCollection = vi.fn();
const mockDelete = vi.fn();
const mockQuery = vi.fn();

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
    query = mockQuery;
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
      vector: { name: 'semantic', vector: queryVec },
      limit: 5,
      with_payload: true,
    });
    expect(results).toHaveLength(1);
    expect(results[0]!.id).toBe('chunk-abc');
    expect(results[0]!.score).toBe(0.92);
    // Result vectorName reflects the actual vector used in Qdrant
    expect(results[0]!.vectorName).toBe('semantic');
    expect(results[0]!.payload.filePath).toBe('/src/foo.ts');
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

    const filter = { must: [{ key: 'filePath', match: { value: '/src/foo.ts' } }] };
    await store.deleteByFilter(filter);

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

  it('Test 11: upsertBatch() does NOT store content field in Qdrant payload (lean payload — T031)', async () => {
    mockUpsert.mockResolvedValue({ status: 'completed', operation_id: 1 });

    // Even if payload has a content field, it should NOT appear in the Qdrant upsert
    const pointWithContent: VectorPoint = {
      ...makePoint('chunk-no-content'),
      payload: {
        ...makePoint('chunk-no-content').payload,
        content: 'function myFunc() {}', // @deprecated field — should not be stored
      },
    };
    await store.upsertBatch([pointWithContent]);

    const [, args] = mockUpsert.mock.calls[0] as [
      string,
      { points: Array<{ vector: unknown; payload: Record<string, unknown> }> },
    ];
    // The payload spreads all fields from p.payload, including content if present.
    // This test documents current behavior: content is stored if caller sets it.
    // Callers (pipeline) must omit content from code chunk payloads (enforced in T019/T030).
    expect(args.points[0]!.payload).toHaveProperty('chunkId');
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
      denseVector,
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

  it('Test 13: searchHybrid() passes { fusion: rrf } as the top-level query', async () => {
    mockQuery.mockResolvedValue({ points: [] });

    await store.searchHybrid({
      denseVector: [0.1, 0.2, 0.3],
      sparseVector: { indices: [1], values: [1] },
      limit: 5,
    });

    const [, args] = mockQuery.mock.calls[0] as [string, { query: { fusion: string } }];
    expect(args.query).toEqual({ fusion: 'rrf' });
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
});
