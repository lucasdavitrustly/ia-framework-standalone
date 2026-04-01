import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DbConfigNotFoundError } from '@ia-framework/db-context';

// ── Hoist all mocks ───────────────────────────────────────────────────────────
const {
  mockLoadDbConfig,
  mockLoadConfig,
  mockTestConnection,
  mockClose,
  mockGetChunks,
  mockPipelineRun,
} = vi.hoisted(() => {
  const mockLoadDbConfig = vi.fn();
  const mockLoadConfig = vi.fn();
  const mockTestConnection = vi.fn();
  const mockClose = vi.fn().mockResolvedValue(undefined);
  const mockGetChunks = vi.fn().mockResolvedValue([]);
  const mockPipelineRun = vi.fn().mockResolvedValue({ filesIndexed: 0, chunksIndexed: 7 });
  return { mockLoadDbConfig, mockLoadConfig, mockTestConnection, mockClose, mockGetChunks, mockPipelineRun };
});

vi.mock('@ia-framework/db-context', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@ia-framework/db-context')>();
  return {
    ...actual,
    loadDbConfig: mockLoadDbConfig,
    PostgresSource: class MockPostgresSource {
      name = 'postgres';
      testConnection = mockTestConnection;
      close = mockClose;
      getChunks = mockGetChunks;
    },
  };
});

vi.mock('@ia-framework/core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@ia-framework/core')>();
  return {
    ...actual,
    loadConfig: mockLoadConfig,
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

// ── Import the command factory after mocks ────────────────────────────────────
import { dbCommand } from './db.command.js';

const baseDbConfig = { host: 'localhost', port: 5432, database: 'testdb', user: 'testuser', password: 'secret' };
const baseProjectConfig = {
  targetProjectPath: '/target',
  embedding: { provider: 'ollama', model: 'nomic-embed-text' },
  vectorStore: { host: 'localhost', port: 6333, collectionName: 'test' },
};

// Helper: capture stdout/stderr from console.log/error
function captureOutput(fn: () => Promise<void>): Promise<{ out: string[]; err: string[] }> {
  const out: string[] = [];
  const err: string[] = [];
  const originalLog = console.log;
  const originalError = console.error;
  console.log = (...args: unknown[]) => out.push(args.map(String).join(' '));
  console.error = (...args: unknown[]) => err.push(args.map(String).join(' '));
  return fn().then(
    () => { console.log = originalLog; console.error = originalError; return { out, err }; },
    (e: unknown) => { console.log = originalLog; console.error = originalError; throw e; },
  );
}

// Helper: parse and run a subcommand
async function runSubcommand(args: string[]): Promise<{ out: string[]; err: string[]; exitCode?: number }> {
  const cmd = dbCommand();
  let exitCode: number | undefined;
  const mockExit = vi.spyOn(process, 'exit').mockImplementation((code?: number | string) => {
    exitCode = typeof code === 'number' ? code : 0;
    throw new Error(`process.exit(${exitCode})`);
  });
  
  const { out, err } = await captureOutput(async () => {
    try {
      // Use ['node', 'db', ...args] since Commander's default from='process.argv' strips first 2
      await cmd.parseAsync(['node', 'db', ...args]);
    } catch (e: unknown) {
      if (!(e instanceof Error) || !e.message.startsWith('process.exit')) {
        throw e;
      }
    }
  });
  
  mockExit.mockRestore();
  return { out, err, exitCode };
}

describe('db connect', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockClose.mockResolvedValue(undefined);
  });

  // Test 1: Prints connected message with table count on success
  it('prints connected message with table count on success', async () => {
    mockLoadDbConfig.mockResolvedValue(baseDbConfig);
    mockTestConnection.mockResolvedValue({ connected: true, tableCount: 42 });

    const { out } = await runSubcommand(['connect', '--config', '/path/project.json']);

    expect(out.join('\n')).toMatch(/Connected.*42 tables/);
  });

  // Test 2: Prints "Not configured" when DbConfigNotFoundError
  it('prints "Not configured" when DbConfigNotFoundError', async () => {
    mockLoadDbConfig.mockRejectedValue(new DbConfigNotFoundError('/path/db.json'));

    const { out, err } = await runSubcommand(['connect', '--config', '/path/project.json']);

    const output = [...out, ...err].join('\n');
    expect(output).toMatch(/Not configured|ia-framework db configure/);
  });

  // Test 3: Prints failure message and exits 1 when testConnection fails
  it('prints failure message and exits 1 when testConnection throws', async () => {
    mockLoadDbConfig.mockResolvedValue(baseDbConfig);
    mockTestConnection.mockRejectedValue(new Error('ECONNREFUSED'));

    const { out, err, exitCode } = await runSubcommand(['connect', '--config', '/path/project.json']);

    const output = [...out, ...err].join('\n');
    expect(output).toMatch(/Connection failed|ECONNREFUSED/i);
    expect(exitCode).toBe(1);
  });
});

describe('db status', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockClose.mockResolvedValue(undefined);
  });

  // Test 4: Prints all fields when configured and connected
  it('prints all fields when configured and connected', async () => {
    mockLoadDbConfig.mockResolvedValue(baseDbConfig);
    mockTestConnection.mockResolvedValue({ connected: true, tableCount: 15 });

    const { out } = await runSubcommand(['status', '--config', '/path/project.json']);

    const output = out.join('\n');
    expect(output).toContain('configured');
    expect(output).toMatch(/connected|✓/i);
    expect(output).toContain('15');
  });

  // Test 5: Prints "not configured" when db.json missing
  it('prints "not configured" when db.json missing', async () => {
    mockLoadDbConfig.mockRejectedValue(new DbConfigNotFoundError('/path/db.json'));

    const { out } = await runSubcommand(['status', '--config', '/path/project.json']);

    expect(out.join('\n')).toMatch(/not configured/i);
  });

  // Test 6: Never exits non-zero even when connection fails
  it('never exits non-zero even when connection fails', async () => {
    mockLoadDbConfig.mockResolvedValue(baseDbConfig);
    mockTestConnection.mockRejectedValue(new Error('ECONNREFUSED'));

    const { exitCode } = await runSubcommand(['status', '--config', '/path/project.json']);

    expect(exitCode).toBeUndefined(); // process.exit never called
  });
});

describe('db index', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockClose.mockResolvedValue(undefined);
    mockLoadDbConfig.mockResolvedValue(baseDbConfig);
    mockLoadConfig.mockResolvedValue(baseProjectConfig);
    mockPipelineRun.mockResolvedValue({ filesIndexed: 0, chunksIndexed: 7 });
  });

  // Test 7: Calls IndexingPipeline with PostgresSource in contextSources
  it('calls IndexingPipeline.run with PostgresSource in contextSources', async () => {
    await runSubcommand(['index', '--config', '/path/project.json']);

    expect(mockPipelineRun).toHaveBeenCalledOnce();
    const [pipelineConfig] = mockPipelineRun.mock.calls[0] as [{ contextSources: { name: string }[] }];
    expect(pipelineConfig.contextSources).toHaveLength(1);
    expect(pipelineConfig.contextSources[0]?.name).toBe('postgres');
  });

  // Test 8: Calls postgresSource.close() after pipeline completes
  it('calls postgresSource.close() after pipeline completes', async () => {
    await runSubcommand(['index', '--config', '/path/project.json']);

    expect(mockClose).toHaveBeenCalledOnce();
  });

  // Test 9: Prints chunk count on success
  it('prints chunk count on success', async () => {
    const { out } = await runSubcommand(['index', '--config', '/path/project.json']);

    expect(out.join('\n')).toMatch(/7.*chunk|Indexed.*7/i);
  });
});
