import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

const {
  mockLoadConfig,
  mockPipelineRun,
  mockGetCurrentCommit,
  mockGetFullReindexRequired,
  mockSaveLastIndexedCommit,
  mockSetFullReindexRequired,
  mockGetLastEmbeddingModel,
  mockCollectionPointCount,
  mockLegacyModel,
  mockDeleteCollection,
  mockDeleteByFilter,
  mockRepos,
  mockReadlineQuestion,
} = vi.hoisted(() => ({
  mockLoadConfig: vi.fn(),
  mockPipelineRun: vi.fn(),
  mockGetCurrentCommit: vi.fn(),
  mockGetFullReindexRequired: vi.fn(),
  mockSaveLastIndexedCommit: vi.fn(),
  mockSetFullReindexRequired: vi.fn(),
  mockGetLastEmbeddingModel: vi.fn(),
  // Mutable so a test can put the collection in the state that previously
  // triggered the legacy mismatch prompt.
  mockCollectionPointCount: { value: 0 },
  mockLegacyModel: { value: null as string | null },
  mockDeleteCollection: vi.fn(),
  mockDeleteByFilter: vi.fn(),
  mockRepos: { value: [{ name: 'repo-a', path: '/tmp/repo-a' }] },
  mockReadlineQuestion: vi.fn(),
}));

vi.mock('node:readline/promises', () => ({
  createInterface: () => ({
    question: mockReadlineQuestion,
    close: vi.fn(),
  }),
}));

vi.mock('@ia-framework/core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@ia-framework/core')>();
  return {
    ...actual,
    loadConfig: mockLoadConfig,
    RepoRegistry: class MockRepoRegistry {
      static fromConfig() {
        return new MockRepoRegistry();
      }

      getRepos() {
        return mockRepos.value;
      }

      getRepo(name: string) {
        return this.getRepos().find((repo) => repo.name === name);
      }
    },
  };
});

vi.mock('@ia-framework/indexer', () => ({
  IndexingPipeline: class MockIndexingPipeline {
    run = mockPipelineRun;
  },
  getCurrentCommit: mockGetCurrentCommit,
  getFullReindexRequired: mockGetFullReindexRequired,
  saveLastIndexedCommit: mockSaveLastIndexedCommit,
  setFullReindexRequired: mockSetFullReindexRequired,
  getLastEmbeddingModel: (...args: unknown[]) => {
    mockGetLastEmbeddingModel(...args);
    return Promise.resolve(mockLegacyModel.value);
  },
}));

vi.mock('@ia-framework/embedding', () => ({
  createEmbeddingProvider: vi.fn().mockReturnValue({
    name: 'openai',
    model: 'text-embedding-3-small',
    dimensions: 3,
    contract: {
      provider: 'openai',
      model: 'text-embedding-3-small',
      dimension: 3,
      tokenizerVersion: 1,
      sparseHashVersion: 1,
    },
  }),
  discoverDimensions: vi.fn().mockResolvedValue(3),
}));

vi.mock('@ia-framework/vector-store', () => ({
  QdrantVectorStore: class MockQdrantVectorStore {
    getCollectionInfo = vi.fn().mockImplementation(() =>
      Promise.resolve({
        name: 'test',
        pointCount: mockCollectionPointCount.value,
        vectorDimensions: { text: 3, code: 3 },
        status: 'green',
      }),
    );

    countPoints = vi.fn().mockResolvedValue(0);
    deleteByFilter = mockDeleteByFilter;
    deleteCollection = mockDeleteCollection;
  },
}));

vi.mock('@ia-framework/retrieval', () => ({
  DependencyGraph: class MockDependencyGraph {
    initialize() {}
  },
}));

vi.mock('@ia-framework/observability', () => ({
  MetricsStore: class MockMetricsStore {
    saveModuleGraph() {}
    close() {}
  },
}));

import { indexCommand } from './index.command.js';

const baseConfig = {
  targetProjectPath: '/tmp/repo-a',
  embedding: { provider: 'openai', model: 'text-embedding-3-small', dimensions: 3 },
  vectorStore: { host: 'localhost', port: 6333, collectionName: 'test' },
  indexing: {},
};

async function runIndex(
  args: string[] = ['node', 'index', '--config', '/tmp/.ia-framework/project.json'],
): Promise<{ output: string; exitCode: number | undefined }> {
  const output: string[] = [];
  const originalLog = console.log;
  const originalError = console.error;
  // Bound so the restore below re-installs a method still tied to stdout.
  const originalWrite = process.stdout.write.bind(process.stdout);
  let exitCode: number | undefined;

  console.log = (...args: unknown[]) => output.push(args.map(String).join(' '));
  console.error = (...args: unknown[]) => output.push(args.map(String).join(' '));
  process.stdout.write = ((chunk: string | Uint8Array) => {
    output.push(String(chunk));
    return true;
  }) as typeof process.stdout.write;
  const exit = vi.spyOn(process, 'exit').mockImplementation(((code?: number) => {
    exitCode = code ?? 0;
    if (exitCode !== 0) throw new Error(`process.exit(${exitCode})`);
    return undefined as never;
  }) as never);

  try {
    await indexCommand().parseAsync(args);
  } catch (error) {
    if (!(error instanceof Error) || !error.message.startsWith('process.exit')) throw error;
  } finally {
    console.log = originalLog;
    console.error = originalError;
    process.stdout.write = originalWrite;
    exit.mockRestore();
  }

  return { output: output.join('\n'), exitCode };
}

function resultWithMetrics(
  overrides: Partial<{
    filesIndexed: number;
    chunksIndexed: number;
    skippedChunks: number;
    failedFiles: Array<{ relativePath: string; reason: string }>;
    metrics: {
      mode: 'incremental' | 'full';
      filesChanged: number;
      chunksDeleted: number;
      chunksReindexed: number;
      chunksAffected: number;
      failedFiles: Array<{ relativePath: string; reason: string }>;
      failedChanges: Array<{ operation: 'process' | 'delete'; error: string }>;
    };
  }> = {},
) {
  return {
    filesIndexed: 1,
    chunksIndexed: 1,
    skippedChunks: 0,
    skipped: [],
    signatureOnlyCount: 0,
    signatureOnly: [],
    failedFiles: [],
    failedChanges: [],
    metrics: {
      mode: 'incremental' as const,
      filesChanged: 1,
      chunksDeleted: 0,
      chunksReindexed: 1,
      chunksAffected: 1,
      failedFiles: [],
      failedChanges: [],
    },
    ...overrides,
  };
}

describe('index command skipped-chunk reporting', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRepos.value = [{ name: 'repo-a', path: '/tmp/repo-a' }];
    mockDeleteByFilter.mockResolvedValue(0);
    mockLoadConfig.mockResolvedValue(baseConfig);
    mockGetCurrentCommit.mockResolvedValue(null);
    mockGetFullReindexRequired.mockResolvedValue(false);
    mockSaveLastIndexedCommit.mockResolvedValue(undefined);
    mockSetFullReindexRequired.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders skipped and signature-only identities and exits non-zero', async () => {
    mockPipelineRun.mockResolvedValue({
      filesIndexed: 1,
      chunksIndexed: 2,
      skippedChunks: 1,
      skipped: [
        {
          repoId: 'repo-a',
          relativePath: 'src/payment.ts',
          name: 'refund',
          startLine: 4,
          endLine: 9,
          reason: 'provider rejected input',
        },
      ],
      signatureOnlyCount: 1,
      signatureOnly: [
        {
          repoId: 'repo-a',
          relativePath: 'src/large.ts',
          name: 'largeMethod',
          startLine: 20,
          endLine: 500,
        },
      ],
    });

    const { output, exitCode } = await runIndex();

    expect(exitCode).toBe(1);
    expect(output).toContain('src/payment.ts');
    expect(output).toContain('refund');
    expect(output).toContain('4-9');
    expect(output).toContain('provider rejected input');
    expect(output).toContain('src/large.ts');
    expect(output).toContain('largeMethod');
    expect(output).toContain('signature-only');
  });

  it('keeps a clean run at exit code zero', async () => {
    mockPipelineRun.mockResolvedValue({
      filesIndexed: 1,
      chunksIndexed: 2,
      skippedChunks: 0,
      skipped: [],
      signatureOnlyCount: 0,
      signatureOnly: [],
    });

    const { exitCode } = await runIndex();

    expect(exitCode).toBe(0);
  });

  it('logs explicit per-repo incremental metrics', async () => {
    mockPipelineRun.mockResolvedValue(
      resultWithMetrics({
        metrics: {
          mode: 'incremental',
          filesChanged: 2,
          chunksDeleted: 4,
          chunksReindexed: 3,
          chunksAffected: 7,
          failedFiles: [],
          failedChanges: [],
        },
      }),
    );

    const { output, exitCode } = await runIndex();

    expect(exitCode).toBe(0);
    expect(output).toContain('repo-a');
    expect(output).toContain('changed files=2');
    expect(output).toContain('affected chunks=7');
    expect(output).toContain('deleted chunks=4');
    expect(output).toContain('re-indexed chunks=3');
  });

  it('falls back once with a scoped full index and continues to healthy repos', async () => {
    mockRepos.value = [
      { name: 'repo-a', path: '/tmp/repo-a' },
      { name: 'repo-b', path: '/tmp/repo-b' },
    ];
    mockDeleteByFilter.mockResolvedValue(5);
    mockPipelineRun
      .mockResolvedValueOnce(
        resultWithMetrics({
          skippedChunks: 1,
          failedFiles: [{ relativePath: 'broken.ts', reason: 'embedding failed' }],
        }),
      )
      .mockResolvedValueOnce(
        resultWithMetrics({
          metrics: {
            mode: 'full',
            filesChanged: 4,
            chunksDeleted: 0,
            chunksReindexed: 8,
            chunksAffected: 8,
            failedFiles: [],
            failedChanges: [],
          },
        }),
      )
      .mockResolvedValueOnce(
        resultWithMetrics({
          metrics: {
            mode: 'incremental',
            filesChanged: 1,
            chunksDeleted: 1,
            chunksReindexed: 2,
            chunksAffected: 3,
            failedFiles: [],
            failedChanges: [],
          },
        }),
      );

    const { output, exitCode } = await runIndex();

    expect(exitCode).toBe(0);
    expect(mockPipelineRun).toHaveBeenCalledTimes(3);
    expect(
      mockPipelineRun.mock.calls[0]![0] as { repoId: string; incremental: boolean; force: boolean },
    ).toMatchObject({
      repoId: 'repo-a',
      incremental: true,
      force: false,
    });
    expect(
      mockPipelineRun.mock.calls[1]![0] as { repoId: string; incremental: boolean; force: boolean },
    ).toMatchObject({
      repoId: 'repo-a',
      incremental: false,
      force: false,
    });
    expect(
      mockPipelineRun.mock.calls[2]![0] as { repoId: string; incremental: boolean; force: boolean },
    ).toMatchObject({
      repoId: 'repo-b',
      incremental: true,
      force: false,
    });
    expect(mockDeleteByFilter).toHaveBeenCalledWith({
      must: [{ key: 'repoId', match: { value: 'repo-a' } }],
    });
    expect(output).toContain('fallback');
    expect(output).toContain('affected chunks=16');
    expect(output).toContain('affected chunks=3');
  });

  it('records a failed fallback, exits non-zero, and continues to a healthy repo', async () => {
    mockRepos.value = [
      { name: 'repo-a', path: '/tmp/repo-a' },
      { name: 'repo-b', path: '/tmp/repo-b' },
    ];
    mockPipelineRun
      .mockRejectedValueOnce(new Error('incremental failed'))
      .mockRejectedValueOnce(new Error('full fallback failed'))
      .mockResolvedValueOnce(resultWithMetrics());

    const { output, exitCode } = await runIndex();

    expect(exitCode).toBe(1);
    expect(mockPipelineRun).toHaveBeenCalledTimes(3);
    expect(output).toContain('repo-a');
    expect(output).toContain('full fallback failed');
    expect(output).toContain('repo-b');
    expect(mockSetFullReindexRequired).toHaveBeenCalledWith(
      '/tmp/.ia-framework',
      'test',
      true,
      'repo-a',
    );
  });

  it('retries a repository marked for full re-index before incremental work', async () => {
    mockGetFullReindexRequired.mockResolvedValue(true);
    mockPipelineRun.mockResolvedValue(
      resultWithMetrics({
        metrics: {
          mode: 'full',
          filesChanged: 3,
          chunksDeleted: 2,
          chunksReindexed: 4,
          chunksAffected: 6,
          failedFiles: [],
          failedChanges: [],
        },
      }),
    );

    const { output, exitCode } = await runIndex();

    expect(exitCode).toBe(0);
    expect(mockPipelineRun).toHaveBeenCalledOnce();
    expect(mockPipelineRun.mock.calls[0]![0]).toMatchObject({
      repoId: 'repo-a',
      incremental: false,
      force: false,
    });
    expect(output).toContain('previous full re-index');
  });

  it('purges each repo independently for a multi-repo force run', async () => {
    mockRepos.value = [
      { name: 'repo-a', path: '/tmp/repo-a' },
      { name: 'repo-b', path: '/tmp/repo-b' },
    ];
    mockDeleteByFilter.mockResolvedValueOnce(7).mockResolvedValueOnce(9);
    mockPipelineRun.mockResolvedValue(
      resultWithMetrics({
        metrics: {
          mode: 'full',
          filesChanged: 3,
          chunksDeleted: 0,
          chunksReindexed: 4,
          chunksAffected: 4,
          failedFiles: [],
          failedChanges: [],
        },
      }),
    );

    const { output, exitCode } = await runIndex([
      'node',
      'index',
      '--config',
      '/tmp/.ia-framework/project.json',
      '--force',
    ]);

    expect(exitCode).toBe(0);
    expect(mockPipelineRun).toHaveBeenCalledTimes(2);
    expect(mockPipelineRun.mock.calls[0]![0]).toMatchObject({
      repoId: 'repo-a',
      incremental: false,
      force: true,
    });
    expect(mockPipelineRun.mock.calls[1]![0]).toMatchObject({
      repoId: 'repo-b',
      incremental: false,
      force: true,
    });
    expect(mockDeleteByFilter.mock.calls).toEqual([
      [{ must: [{ key: 'repoId', match: { value: 'repo-a' } }] }],
      [{ must: [{ key: 'repoId', match: { value: 'repo-b' } }] }],
    ]);
    expect(output).toContain('Deleted 7 existing chunks for repo "repo-a"');
    expect(output).toContain('Deleted 9 existing chunks for repo "repo-b"');
  });

  it('does not fall back after user cancellation', async () => {
    vi.stubGlobal(
      'AbortController',
      class {
        signal = { aborted: false } as AbortSignal;
        abort() {}
      },
    );
    try {
      mockPipelineRun.mockImplementationOnce(
        (_config: unknown, _progress: unknown, signal: AbortSignal) => {
          (signal as unknown as { aborted: boolean }).aborted = true;
          throw new Error('Indexing cancelled');
        },
      );

      const { output, exitCode } = await runIndex();

      expect(exitCode, output).toBe(0);
      expect(mockPipelineRun).toHaveBeenCalledTimes(1);
      expect(mockDeleteByFilter).not.toHaveBeenCalled();
      expect(output).toContain('stopped by user');
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// F2.4 — the legacy per-repo embedding-model mismatch check is retired (D-3).
// ContractStore is the single source of truth for embedding-contract state, and
// it is a per-collection invariant (D-6, EMB-08/AD-002) rather than the per-repo
// JSON state the legacy check wrote after every run.
// ─────────────────────────────────────────────────────────────────────────────

describe('index command embedding-contract state', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockLoadConfig.mockResolvedValue(baseConfig);
    mockGetCurrentCommit.mockResolvedValue(null);
    mockSaveLastIndexedCommit.mockResolvedValue(undefined);
    mockPipelineRun.mockResolvedValue({
      filesIndexed: 1,
      chunksIndexed: 2,
      skippedChunks: 0,
      skipped: [],
      signatureOnlyCount: 0,
      signatureOnly: [],
    });
    // A populated collection whose legacy per-repo model differs from the
    // configured one — exactly the state that used to trigger the prompt.
    mockCollectionPointCount.value = 42;
    mockLegacyModel.value = 'text-embedding-ada-002';
  });

  afterEach(() => {
    mockCollectionPointCount.value = 0;
    mockLegacyModel.value = null;
    vi.restoreAllMocks();
  });

  it('never consults the legacy per-repo embedding model', async () => {
    await runIndex();

    expect(mockGetLastEmbeddingModel).not.toHaveBeenCalled();
  });

  it('does not prompt to delete the collection, and indexes without deleting it', async () => {
    const { output, exitCode } = await runIndex();

    expect(mockReadlineQuestion).not.toHaveBeenCalled();
    expect(mockDeleteCollection).not.toHaveBeenCalled();
    expect(output).not.toContain('Embedding model mismatch detected');
    expect(output).not.toContain('Delete existing collection and re-index?');
    expect(mockPipelineRun).toHaveBeenCalledTimes(1);
    expect(exitCode).toBe(0);
  });

  it('does not force a destructive re-index when the model differs', async () => {
    await runIndex();

    const [runConfig] = mockPipelineRun.mock.calls[0] as [{ force?: boolean }];
    expect(runConfig.force).toBeFalsy();
  });
});
