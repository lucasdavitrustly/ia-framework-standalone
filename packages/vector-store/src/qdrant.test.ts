import { describe, it, expect, vi, beforeEach } from 'vitest';
import { QdrantVectorStore } from './qdrant.js';
import type { VectorPoint } from './interface.js';

// Mock method references — defined outside so they can be referenced in tests
const mockCollectionExists = vi.fn();
const mockCreateCollection = vi.fn();
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
  textVector: [0.1, 0.2, 0.3],
  codeVector: [0.4, 0.5, 0.6],
  payload: {
    chunkId: id,
    filePath: '/src/foo.ts',
    relativePath: 'src/foo.ts',
    language: 'typescript',
    chunkType: 'function',
    name: 'myFunc',
    content: 'function myFunc() {}',
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
        text: { size: 1536, distance: 'Cosine' },
        code: { size: 1536, distance: 'Cosine' },
      },
      sparse_vectors: {
        sparse: {
          modifier: 'idf',
        },
      },
    });
  });

  it('Test 2: initialize() is idempotent — skips createCollection if collection exists', async () => {
    mockCollectionExists.mockResolvedValue({ exists: true });
    // Return collection info with matching dimensions so no recreation is triggered
    mockGetCollection.mockResolvedValue({
      points_count: 0,
      status: 'green',
      config: {
        params: {
          vectors: {
            text: { size: 1536, distance: 'Cosine' },
            code: { size: 1536, distance: 'Cosine' },
          },
        },
      },
    });

    await store.initialize({ textDimensions: 1536, codeDimensions: 1536 });

    expect(mockCollectionExists).toHaveBeenCalledWith('test-collection');
    expect(mockCreateCollection).not.toHaveBeenCalled();
  });

  it('Test 3: upsertBatch() calls client.upsert() with named vectors and payload', async () => {
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
      vector: { text: number[]; code: number[] };
      payload: { chunkId: string };
    };
    // ID must be UUID format (8-4-4-4-12 hex chars)
    expect(pt.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
    expect(pt.vector.text).toEqual([0.1, 0.2, 0.3]);
    expect(pt.vector.code).toEqual([0.4, 0.5, 0.6]);
    expect(pt.payload.chunkId).toBe('chunk-abc');
  });

  it('Test 4: search() calls client.search() with vector name and returns SearchResult[]', async () => {
    const mockHit = {
      id: 'some-uuid',
      score: 0.92,
      payload: {
        chunkId: 'chunk-abc',
        filePath: '/src/foo.ts',
        relativePath: 'src/foo.ts',
        language: 'typescript',
        chunkType: 'function',
        content: 'function myFunc() {}',
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

    expect(mockSearch).toHaveBeenCalledWith('test-collection', {
      vector: { name: 'text', vector: queryVec },
      limit: 5,
      score_threshold: undefined,
      filter: undefined,
      with_payload: true,
    });
    expect(results).toHaveLength(1);
    expect(results[0]!.id).toBe('chunk-abc');
    expect(results[0]!.score).toBe(0.92);
    expect(results[0]!.vectorName).toBe('text');
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

  it('Test 10: upsertBatch() includes sparse vector when sparseVector is provided', async () => {
    mockUpsert.mockResolvedValue({ status: 'completed', operation_id: 1 });

    const point = {
      ...makePoint('chunk-sparse'),
      sparseVector: { indices: [1, 2, 3], values: [0.5, 1.0, 0.5] },
    };
    await store.upsertBatch([point]);

    const [, args] = mockUpsert.mock.calls[0] as [
      string,
      { points: Array<{ vector: { text: number[]; code: number[]; sparse?: unknown } }> },
    ];
    expect(args.points[0]!.vector).toHaveProperty('sparse');
    expect(args.points[0]!.vector.sparse).toEqual({ indices: [1, 2, 3], values: [0.5, 1.0, 0.5] });
  });

  it('Test 11: upsertBatch() omits sparse key when sparseVector is not provided', async () => {
    mockUpsert.mockResolvedValue({ status: 'completed', operation_id: 1 });

    await store.upsertBatch([makePoint('chunk-no-sparse')]);

    const [, args] = mockUpsert.mock.calls[0] as [
      string,
      { points: Array<{ vector: { text: number[]; code: number[] } }> },
    ];
    expect(args.points[0]!.vector).not.toHaveProperty('sparse');
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
    mockQuery.mockResolvedValue({ result: [mockResult] });

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
    expect(results[0]!.vectorName).toBe('text');
  });

  it('Test 13: searchHybrid() passes { fusion: rrf } as the top-level query', async () => {
    mockQuery.mockResolvedValue({ result: [] });

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
});
