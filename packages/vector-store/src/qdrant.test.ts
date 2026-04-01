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

// Mock the QdrantClient module with a proper class constructor
vi.mock('@qdrant/js-client-rest', () => {
  class MockQdrantClient {
    collectionExists = mockCollectionExists;
    createCollection = mockCreateCollection;
    upsert = mockUpsert;
    search = mockSearch;
    getCollection = mockGetCollection;
    delete = mockDelete;
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
    });
  });

  it('Test 2: initialize() is idempotent — skips createCollection if collection exists', async () => {
    mockCollectionExists.mockResolvedValue({ exists: true });

    await store.initialize({ textDimensions: 1536, codeDimensions: 1536 });

    expect(mockCollectionExists).toHaveBeenCalledWith('test-collection');
    expect(mockCreateCollection).not.toHaveBeenCalled();
  });

  it('Test 3: upsertBatch() calls client.upsert() with named vectors and payload', async () => {
    mockUpsert.mockResolvedValue({ status: 'completed', operation_id: 1 });

    const point = makePoint('chunk-abc');
    await store.upsertBatch([point]);

    expect(mockUpsert).toHaveBeenCalledOnce();
    const [collName, args] = mockUpsert.mock.calls[0] as [string, { wait: boolean; points: unknown[] }];
    expect(collName).toBe('test-collection');
    expect(args.wait).toBe(true);
    expect(args.points).toHaveLength(1);

    const pt = args.points[0] as { id: string; vector: { text: number[]; code: number[] }; payload: { chunkId: string } };
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
    expect(results[0].id).toBe('chunk-abc');
    expect(results[0].score).toBe(0.92);
    expect(results[0].vectorName).toBe('text');
    expect(results[0].payload.filePath).toBe('/src/foo.ts');
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
    const [collName, args] = mockDelete.mock.calls[0] as [string, { wait: boolean; points: string[] }];
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
});
