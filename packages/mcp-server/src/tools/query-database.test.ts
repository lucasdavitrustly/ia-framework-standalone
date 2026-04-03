import { describe, it, expect, vi, beforeEach } from 'vitest';
import { queryDatabaseHandler } from './query-database.js';
import { DbConfigNotFoundError } from '@ia-framework/db-context';

// ── Mock @ia-framework/db-context ─────────────────────────────────────────────
const { mockLoadDbConfig, mockExecuteQuery, mockClose } = vi.hoisted(() => {
  const mockClose = vi.fn().mockResolvedValue(undefined);
  const mockExecuteQuery = vi.fn();
  const mockLoadDbConfig = vi.fn();
  return { mockLoadDbConfig, mockExecuteQuery, mockClose };
});

vi.mock('@ia-framework/db-context', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@ia-framework/db-context')>();
  return {
    ...actual,
    loadDbConfig: mockLoadDbConfig,
    PostgresSource: class MockPostgresSource {
      executeQuery = mockExecuteQuery;
      close = mockClose;
    },
  };
});

const baseConfig = { host: 'localhost', port: 5432, database: 'testdb', user: 'u', password: 'p' };

describe('queryDatabaseHandler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockClose.mockResolvedValue(undefined);
  });

  // Test 1: returns rows JSON on success
  it('returns rows JSON on success', async () => {
    mockLoadDbConfig.mockResolvedValue(baseConfig);
    mockExecuteQuery.mockResolvedValue({ rows: [{ id: 1, name: 'Alice' }], rowCount: 1 });

    const result = await queryDatabaseHandler({ sql: 'SELECT * FROM users' }, '/path/db.json');

    expect(result.content[0]?.type).toBe('text');
    const text = (result.content[0] as { type: string; text: string }).text;
    expect(text).toContain('"id": 1');
    expect(text).toContain('"name": "Alice"');
  });

  // Test 2: returns "Database not configured" when DbConfigNotFoundError
  it('returns "Database not configured" when DbConfigNotFoundError', async () => {
    mockLoadDbConfig.mockRejectedValue(new DbConfigNotFoundError('/path/db.json'));

    const result = await queryDatabaseHandler({ sql: 'SELECT 1' }, '/path/db.json');

    const text = (result.content[0] as { type: string; text: string }).text;
    expect(text).toContain('Database not configured');
    expect(text).toContain('ia-framework db configure');
  });

  // Test 3: returns error message text when executeQuery throws
  it('returns error message text when executeQuery throws', async () => {
    mockLoadDbConfig.mockResolvedValue(baseConfig);
    mockExecuteQuery.mockRejectedValue(new Error('syntax error near SELECT'));

    const result = await queryDatabaseHandler({ sql: 'BAD SQL' }, '/path/db.json');

    const text = (result.content[0] as { type: string; text: string }).text;
    expect(text).toContain('syntax error near SELECT');
  });

  // Test 4: result includes rowCount prefix
  it('result includes rowCount prefix: "Rows: 2\\n\\n"', async () => {
    mockLoadDbConfig.mockResolvedValue(baseConfig);
    mockExecuteQuery.mockResolvedValue({
      rows: [{ id: 1 }, { id: 2 }],
      rowCount: 2,
    });

    const result = await queryDatabaseHandler({ sql: 'SELECT id FROM users' }, '/path/db.json');

    const text = (result.content[0] as { type: string; text: string }).text;
    expect(text).toMatch(/^Rows: 2\n\n/);
  });

  // Test 5: close() is called after executeQuery (even on success)
  it('close() is called after executeQuery', async () => {
    mockLoadDbConfig.mockResolvedValue(baseConfig);
    mockExecuteQuery.mockResolvedValue({ rows: [], rowCount: 0 });

    await queryDatabaseHandler({ sql: 'SELECT 1' }, '/path/db.json');

    expect(mockClose).toHaveBeenCalledOnce();
  });
});
