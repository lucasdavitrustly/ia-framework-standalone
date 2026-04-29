import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PostgresSource } from './postgres-source.js';
import { loadDbConfig, DbConfigNotFoundError } from './loader.js';
import type { ContextSource } from '@ia-framework/core';
import { writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

// ── Mock pg.Pool factory ─────────────────────────────────────────────────────
function makeMockPool(
  overrides: Partial<{ query: ReturnType<typeof vi.fn>; end: ReturnType<typeof vi.fn> }> = {},
) {
  return {
    query: vi.fn(),
    end: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

const baseConfig = {
  host: 'localhost',
  port: 5432,
  database: 'testdb',
  user: 'testuser',
  password: 'testpass',
};

// Helper: make a mock pool that returns table/view rows + columns + FKs
// Tables must include table_schema to match the updated multi-schema implementation
function makeFullMockPool({
  tables = [
    { table_schema: 'public', table_name: 'users', table_type: 'BASE TABLE' },
    { table_schema: 'public', table_name: 'v_active', table_type: 'VIEW' },
  ],
  columns = [
    {
      column_name: 'id',
      data_type: 'integer',
      is_nullable: 'NO',
      column_default: null,
      character_maximum_length: null,
    },
    {
      column_name: 'email',
      data_type: 'character varying',
      is_nullable: 'NO',
      column_default: null,
      character_maximum_length: 255,
    },
  ],
  foreignKeys = [] as Array<{
    table_schema: string;
    table_name: string;
    column_name: string;
    foreign_table_name: string;
    foreign_column_name: string;
  }>,
} = {}) {
  const mockQuery = vi.fn().mockImplementation((...args: unknown[]) => {
    const sql = (args[0] as string) ?? '';
    if (
      sql.includes('information_schema.tables') &&
      !sql.includes('columns') &&
      !sql.includes('FOREIGN KEY')
    ) {
      return Promise.resolve({ rows: tables, rowCount: tables.length });
    }
    if (sql.includes('FOREIGN KEY')) {
      return Promise.resolve({ rows: foreignKeys, rowCount: foreignKeys.length });
    }
    if (sql.includes('information_schema.columns')) {
      return Promise.resolve({ rows: columns, rowCount: columns.length });
    }
    return Promise.resolve({ rows: [], rowCount: 0 });
  });

  return makeMockPool({ query: mockQuery });
}

describe('PostgresSource', () => {
  // Test 1: testConnection returns connected+tableCount on success
  it('testConnection() returns { connected: true, tableCount: 3 } when pool.query succeeds', async () => {
    const pool = makeMockPool({
      query: vi.fn().mockResolvedValue({ rows: [{ count: '3' }], rowCount: 1 }),
    });
    const source = new PostgresSource(baseConfig, pool as never);
    const result = await source.testConnection();
    expect(result).toEqual({ connected: true, tableCount: 3 });
  });

  // Test 2: testConnection returns false+0 on error
  it('testConnection() returns { connected: false, tableCount: 0 } when pool.query throws', async () => {
    const pool = makeMockPool({
      query: vi.fn().mockRejectedValue(new Error('ECONNREFUSED')),
    });
    const source = new PostgresSource(baseConfig, pool as never);
    const result = await source.testConnection();
    expect(result).toEqual({ connected: false, tableCount: 0 });
  });

  // Test 3: getChunks returns ChunkMetadata[] with chunkType='table' for BASE TABLE
  it("getChunks() returns ChunkMetadata[] with chunkType='table' for BASE TABLE rows", async () => {
    const pool = makeFullMockPool({
      tables: [{ table_schema: 'public', table_name: 'users', table_type: 'BASE TABLE' }],
      columns: [
        {
          column_name: 'id',
          data_type: 'integer',
          is_nullable: 'NO',
          column_default: null,
          character_maximum_length: null,
        },
      ],
    });
    const source = new PostgresSource(baseConfig, pool as never);
    const chunks = await source.getChunks();
    expect(chunks).toHaveLength(1);
    expect(chunks[0]!.chunkType).toBe('table');
    expect(chunks[0]!.name).toBe('public.users');
  });

  // Test 4: getChunks returns chunkType='view' for VIEW rows
  it("getChunks() returns chunkType='view' for VIEW rows", async () => {
    const pool = makeFullMockPool({
      tables: [{ table_schema: 'public', table_name: 'v_active', table_type: 'VIEW' }],
      columns: [],
    });
    const source = new PostgresSource(baseConfig, pool as never);
    const chunks = await source.getChunks();
    expect(chunks).toHaveLength(1);
    expect(chunks[0]!.chunkType).toBe('view');
    expect(chunks[0]!.name).toBe('public.v_active');
  });

  // Test 5: getChunks includes columns in content string
  it('getChunks() includes columns in content string', async () => {
    const pool = makeFullMockPool({
      tables: [{ table_schema: 'public', table_name: 'users', table_type: 'BASE TABLE' }],
      columns: [
        {
          column_name: 'id',
          data_type: 'integer',
          is_nullable: 'NO',
          column_default: null,
          character_maximum_length: null,
        },
        {
          column_name: 'email',
          data_type: 'character varying',
          is_nullable: 'NO',
          column_default: null,
          character_maximum_length: 255,
        },
      ],
    });
    const source = new PostgresSource(baseConfig, pool as never);
    const chunks = await source.getChunks();
    expect(chunks[0]!.content).toContain('id: integer NOT NULL');
    expect(chunks[0]!.content).toContain('email: character varying');
  });

  // Test 6: getChunks includes FK info in content
  it('getChunks() includes foreign keys in content string when FK query returns rows', async () => {
    const pool = makeFullMockPool({
      tables: [{ table_schema: 'public', table_name: 'orders', table_type: 'BASE TABLE' }],
      columns: [
        {
          column_name: 'user_id',
          data_type: 'integer',
          is_nullable: 'NO',
          column_default: null,
          character_maximum_length: null,
        },
      ],
      foreignKeys: [
        {
          table_schema: 'public',
          table_name: 'orders',
          column_name: 'user_id',
          foreign_table_name: 'users',
          foreign_column_name: 'id',
        },
      ],
    });
    const source = new PostgresSource(baseConfig, pool as never);
    const chunks = await source.getChunks();
    expect(chunks[0]!.content).toContain('Foreign keys:');
    expect(chunks[0]!.content).toContain('public.orders.user_id → users.id');
  });

  // Test 7: getChunks returns [] when no tables found
  it('getChunks() returns [] when no tables found', async () => {
    const pool = makeFullMockPool({ tables: [] });
    const source = new PostgresSource(baseConfig, pool as never);
    const chunks = await source.getChunks();
    expect(chunks).toHaveLength(0);
  });

  // Test 8: chunk IDs are deterministic and schema-scoped
  it('getChunks() chunk IDs are deterministic (same schema+table → same id)', async () => {
    const pool1 = makeFullMockPool({
      tables: [{ table_schema: 'public', table_name: 'users', table_type: 'BASE TABLE' }],
      columns: [],
    });
    const pool2 = makeFullMockPool({
      tables: [{ table_schema: 'public', table_name: 'users', table_type: 'BASE TABLE' }],
      columns: [],
    });
    const source1 = new PostgresSource(baseConfig, pool1 as never);
    const source2 = new PostgresSource(baseConfig, pool2 as never);
    const [chunks1, chunks2] = await Promise.all([source1.getChunks(), source2.getChunks()]);
    expect(chunks1[0]!.id).toBe(chunks2[0]!.id);
  });

  // Test 8b: tables with same name in different schemas get different chunk IDs
  it('getChunks() tables with same name in different schemas get different IDs', async () => {
    const pool = makeFullMockPool({
      tables: [
        { table_schema: 'public', table_name: 'entries', table_type: 'BASE TABLE' },
        { table_schema: 'billing', table_name: 'entries', table_type: 'BASE TABLE' },
      ],
      columns: [],
    });
    const source = new PostgresSource(baseConfig, pool as never);
    const chunks = await source.getChunks();
    expect(chunks).toHaveLength(2);
    expect(chunks[0]!.id).not.toBe(chunks[1]!.id);
    expect(chunks[0]!.name).toBe('public.entries');
    expect(chunks[1]!.name).toBe('billing.entries');
  });

  // Test 9: executeQuery returns rows and rowCount
  it('executeQuery() returns rows and rowCount', async () => {
    const rows = [{ id: 1, name: 'Alice' }];
    const pool = makeMockPool({
      query: vi.fn().mockResolvedValue({ rows, rowCount: 1 }),
    });
    const source = new PostgresSource(baseConfig, pool as never);
    const result = await source.executeQuery('SELECT * FROM users');
    expect(result.rows).toEqual(rows);
    expect(result.rowCount).toBe(1);
  });

  // Test 10: close() calls pool.end()
  it('close() calls pool.end()', async () => {
    const pool = makeMockPool();
    const source = new PostgresSource(baseConfig, pool as never);
    await source.close();
    expect(pool.end).toHaveBeenCalledOnce();
  });

  // Test: PostgresSource implements ContextSource
  it('PostgresSource satisfies ContextSource interface', () => {
    const pool = makeFullMockPool({ tables: [] });
    const source: ContextSource = new PostgresSource(baseConfig, pool as never);
    expect(source.name).toBe('postgres');
    expect(typeof source.getChunks).toBe('function');
  });
});

describe('loadDbConfig', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = join(tmpdir(), `db-config-test-${Date.now()}`);
    await mkdir(tmpDir, { recursive: true });
  });

  // Test 11: loadDbConfig returns DatabaseConfig when file is valid JSON
  it('loadDbConfig() returns DatabaseConfig when file is valid JSON', async () => {
    const configPath = join(tmpDir, 'db.json');
    await writeFile(configPath, JSON.stringify(baseConfig));
    const config = await loadDbConfig(configPath);
    expect(config.host).toBe('localhost');
    expect(config.database).toBe('testdb');
    expect(config.port).toBe(5432);
  });

  // Test 12: loadDbConfig throws DbConfigNotFoundError when file missing
  it('loadDbConfig() throws DbConfigNotFoundError when file missing', async () => {
    const configPath = join(tmpDir, 'nonexistent.json');
    await expect(loadDbConfig(configPath)).rejects.toThrow(DbConfigNotFoundError);
  });

  // Test 13: loadDbConfig throws ZodError when required field missing
  it('loadDbConfig() throws ZodError when required field missing', async () => {
    const configPath = join(tmpDir, 'bad.json');
    await writeFile(configPath, JSON.stringify({ host: 'localhost' })); // missing required fields
    await expect(loadDbConfig(configPath)).rejects.toThrow();
  });

  // Test 14: DB_HOST env var overrides host from db.json
  it('loadDbConfig() overrides host with DB_HOST env var when set', async () => {
    const configPath = join(tmpDir, 'db.json');
    await writeFile(configPath, JSON.stringify(baseConfig));
    const original = process.env.DB_HOST;
    process.env.DB_HOST = 'host.docker.internal';
    try {
      const config = await loadDbConfig(configPath);
      expect(config.host).toBe('host.docker.internal');
    } finally {
      if (original === undefined) {
        delete process.env.DB_HOST;
      } else {
        process.env.DB_HOST = original;
      }
    }
  });

  // Test 15: DB_HOST env var absent — host from db.json is used as-is
  it('loadDbConfig() uses host from db.json when DB_HOST env var is not set', async () => {
    const configPath = join(tmpDir, 'db.json');
    await writeFile(configPath, JSON.stringify(baseConfig));
    const original = process.env.DB_HOST;
    delete process.env.DB_HOST;
    try {
      const config = await loadDbConfig(configPath);
      expect(config.host).toBe('localhost');
    } finally {
      if (original !== undefined) {
        process.env.DB_HOST = original;
      }
    }
  });
});
