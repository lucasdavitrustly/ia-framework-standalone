import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Hoist all mocks ───────────────────────────────────────────────────────────
const { mockClearRuns, mockListRuns, mockClose } = vi.hoisted(() => {
  const mockClearRuns = vi.fn();
  const mockListRuns = vi.fn().mockReturnValue([]);
  const mockClose = vi.fn();
  return { mockClearRuns, mockListRuns, mockClose };
});

vi.mock('@ia-framework/benchmark', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@ia-framework/benchmark')>();
  return {
    ...actual,
    BenchmarkStore: class MockBenchmarkStore {
      clearRuns = mockClearRuns;
      listRuns = mockListRuns;
      close = mockClose;
    },
  };
});

// ── Import the command factory after mocks ────────────────────────────────────
import { benchmarkCommand } from './benchmark.command.js';

// ── Helpers ───────────────────────────────────────────────────────────────────

function captureOutput(fn: () => Promise<void>): Promise<{ out: string[]; err: string[] }> {
  const out: string[] = [];
  const err: string[] = [];
  const originalLog = console.log;
  const originalError = console.error;
  console.log = (...args: unknown[]) => out.push(args.map(String).join(' '));
  console.error = (...args: unknown[]) => err.push(args.map(String).join(' '));
  return fn().then(
    () => {
      console.log = originalLog;
      console.error = originalError;
      return { out, err };
    },
    (e: unknown) => {
      console.log = originalLog;
      console.error = originalError;
      throw e;
    },
  );
}

async function runBenchmarkSubcommand(
  args: string[],
): Promise<{ out: string[]; err: string[]; exitCode: number | undefined }> {
  const cmd = benchmarkCommand();
  let exitCode: number | undefined;
  const stderrChunks: string[] = [];

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mockExit = vi.spyOn(process, 'exit').mockImplementation(((code?: any) => {
    exitCode = typeof code === 'number' ? code : 0;
    throw new Error(`process.exit(${exitCode})`);
  }) as never);

  // Capture process.stderr.write (used by benchmark subcommands for errors)
  const mockStderrWrite = vi
    .spyOn(process.stderr, 'write')
    .mockImplementation((chunk: string | Uint8Array) => {
      stderrChunks.push(typeof chunk === 'string' ? chunk : chunk.toString());
      return true;
    });

  const { out, err } = await captureOutput(async () => {
    try {
      await cmd.parseAsync(['node', 'benchmark', ...args]);
    } catch (e: unknown) {
      if (!(e instanceof Error) || !e.message.startsWith('process.exit')) {
        throw e;
      }
    }
  });

  mockExit.mockRestore();
  mockStderrWrite.mockRestore();

  return { out, err: [...err, ...stderrChunks], exitCode };
}

// ── benchmark command structure ───────────────────────────────────────────────

describe('benchmarkCommand structure', () => {
  it('has a "clean" subcommand', () => {
    const cmd = benchmarkCommand();
    const names = cmd.commands.map((c) => c.name());
    expect(names).toContain('clean');
  });

  it('clean subcommand has --config option', () => {
    const cmd = benchmarkCommand();
    const clean = cmd.commands.find((c) => c.name() === 'clean');
    expect(clean).toBeDefined();
    const opts = clean!.options.map((o) => o.long);
    expect(opts).toContain('--config');
  });
});

// ── benchmark clean ───────────────────────────────────────────────────────────

describe('benchmark clean', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockClose.mockReturnValue(undefined);
  });

  // Test 1: calls clearRuns() on the BenchmarkStore
  it('calls BenchmarkStore.clearRuns()', async () => {
    await runBenchmarkSubcommand(['clean', '--config', '/tmp/project.json']);

    expect(mockClearRuns).toHaveBeenCalledOnce();
  });

  // Test 2: calls close() after clearing
  it('calls BenchmarkStore.close() after clearing', async () => {
    await runBenchmarkSubcommand(['clean', '--config', '/tmp/project.json']);

    expect(mockClose).toHaveBeenCalledOnce();
  });

  // Test 3: prints a confirmation message
  it('prints a confirmation message containing "Deleted" or "cleared"', async () => {
    const { out } = await runBenchmarkSubcommand(['clean', '--config', '/tmp/project.json']);

    const output = out.join('\n');
    expect(output).toMatch(/deleted|cleared/i);
  });

  // Test 4: does NOT exit with non-zero on success
  it('does not exit with non-zero code on success', async () => {
    const { exitCode } = await runBenchmarkSubcommand(['clean', '--config', '/tmp/project.json']);

    expect(exitCode).toBeUndefined();
  });

  // Test 5: exits 1 and writes stderr when clearRuns throws
  it('exits 1 when clearRuns throws an error', async () => {
    mockClearRuns.mockImplementation(() => {
      throw new Error('disk full');
    });

    const { err, exitCode } = await runBenchmarkSubcommand([
      'clean',
      '--config',
      '/tmp/project.json',
    ]);

    expect(exitCode).toBe(1);
    expect(err.join('\n')).toMatch(/clean failed|disk full/i);
  });
});
