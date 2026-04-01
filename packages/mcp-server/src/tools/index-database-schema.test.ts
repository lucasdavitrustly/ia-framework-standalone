import { describe, it, expect, vi, beforeEach } from 'vitest';
import { indexDatabaseSchemaHandler } from './index-database-schema.js';
import { DbConfigNotFoundError } from '@ia-framework/db-context';
import { ConfigNotFoundError } from '@ia-framework/core';

// ── Hoist mocks ───────────────────────────────────────────────────────────────
const { mockLoadConfig, mockLoadDbConfig, mockClose, mockGetChunks, mockPipelineRun } = vi.hoisted(() => {
  const mockClose = vi.fn().mockResolvedValue(undefined);
  const mockGetChunks = vi.fn().mockResolvedValue([]);
  const mockLoadConfig = vi.fn();
  const mockLoadDbConfig = vi.fn();
  const mockPipelineRun = vi.fn().mockResolvedValue({ filesIndexed: 0, chunksIndexed: 5 });
  return { mockLoadConfig, mockLoadDbConfig, mockClose, mockGetChunks, mockPipelineRun };
});

vi.mock('@ia-framework/core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@ia-framework/core')>();
  return {
    ...actual,
    loadConfig: mockLoadConfig,
  };
});

vi.mock('@ia-framework/db-context', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@ia-framework/db-context')>();
  return {
    ...actual,
    loadDbConfig: mockLoadDbConfig,
    PostgresSource: class MockPostgresSource {
      name = 'postgres';
      close = mockClose;
      getChunks = mockGetChunks;
    },
  };
});

vi.mock('@ia-framework/indexer', () => ({
  IndexingPipeline: class MockIndexingPipeline {
    run = mockPipelineRun;
  },
}));

vi.mock('@ia-framework/embedding', () => ({
  createEmbeddingProvider: vi.fn().mockReturnValue({ dimensions: 3, embedBatch: vi.fn() }),
}));

vi.mock('@ia-framework/vector-store', () => ({
  QdrantVectorStore: class MockQdrantVectorStore {
    initialize = vi.fn();
    upsertBatch = vi.fn();
  },
}));

const baseConfig = {
  targetProjectPath: '/target',
  embedding: { provider: 'ollama', model: 'nomic-embed-text' },
  vectorStore: { host: 'localhost', port: 6333, collectionName: 'test' },
};
const dbConfig = { host: 'localhost', port: 5432, database: 'testdb', user: 'u', password: 'p' };

describe('indexDatabaseSchemaHandler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockClose.mockResolvedValue(undefined);
    mockPipelineRun.mockResolvedValue({ filesIndexed: 0, chunksIndexed: 5 });
  });

  // Test 1: Returns "Indexed N chunks" message on success
  it('returns "Indexed N chunks" message on success', async () => {
    mockLoadConfig.mockResolvedValue(baseConfig);
    mockLoadDbConfig.mockResolvedValue(dbConfig);

    const result = await indexDatabaseSchemaHandler('/path/project.json', '/path/db.json');

    const text = (result.content[0] as { type: string; text: string }).text;
    expect(text).toContain('Indexed 5 database schema chunks');
  });

  // Test 2: Returns "No project configured" when ConfigNotFoundError
  it('returns "No project configured" when ConfigNotFoundError', async () => {
    mockLoadConfig.mockRejectedValue(new ConfigNotFoundError('/path/project.json'));

    const result = await indexDatabaseSchemaHandler('/path/project.json', '/path/db.json');

    const text = (result.content[0] as { type: string; text: string }).text;
    expect(text).toContain('No project configured');
  });

  // Test 3: Returns "Database not configured" when DbConfigNotFoundError
  it('returns "Database not configured" when DbConfigNotFoundError', async () => {
    mockLoadConfig.mockResolvedValue(baseConfig);
    mockLoadDbConfig.mockRejectedValue(new DbConfigNotFoundError('/path/db.json'));

    const result = await indexDatabaseSchemaHandler('/path/project.json', '/path/db.json');

    const text = (result.content[0] as { type: string; text: string }).text;
    expect(text).toContain('Database not configured');
  });

  // Test 4: Calls postgresSource.close() after pipeline run
  it('calls postgresSource.close() after pipeline run', async () => {
    mockLoadConfig.mockResolvedValue(baseConfig);
    mockLoadDbConfig.mockResolvedValue(dbConfig);

    await indexDatabaseSchemaHandler('/path/project.json', '/path/db.json');

    expect(mockClose).toHaveBeenCalledOnce();
  });
});
