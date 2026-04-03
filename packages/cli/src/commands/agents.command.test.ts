import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtemp, writeFile, readFile, mkdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

// ── Hoist mock ────────────────────────────────────────────────────────────────
const { mockLoadConfig } = vi.hoisted(() => {
  const mockLoadConfig = vi.fn();
  return { mockLoadConfig };
});

vi.mock('@ia-framework/core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@ia-framework/core')>();
  return {
    ...actual,
    loadConfig: mockLoadConfig,
  };
});

import { agentsCommand, RAG_MARKER_START, RAG_MARKER_END, RAG_CONTENT } from './agents.command.js';

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

async function runSubcommand(
  args: string[],
): Promise<{ out: string[]; err: string[]; exitCode: number | undefined }> {
  const cmd = agentsCommand();
  let exitCode: number | undefined;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mockExit = vi.spyOn(process, 'exit').mockImplementation(((code?: any) => {
    exitCode = typeof code === 'number' ? code : 0;
    throw new Error(`process.exit(${exitCode})`);
  }) as never);

  const { out, err } = await captureOutput(async () => {
    try {
      await cmd.parseAsync(['node', 'agents', ...args]);
    } catch (e: unknown) {
      if (!(e instanceof Error) || !e.message.startsWith('process.exit')) {
        throw e;
      }
    }
  });

  mockExit.mockRestore();
  return { out, err, exitCode };
}

describe('agents inject', () => {
  let targetDir: string;

  beforeEach(async () => {
    targetDir = await mkdtemp(join(tmpdir(), 'agents-test-'));
    mockLoadConfig.mockResolvedValue({
      targetProjectPath: targetDir,
      embedding: { provider: 'ollama', model: 'nomic-embed-text' },
      vectorStore: { host: 'localhost', port: 6333, collectionName: 'test' },
    });
  });

  afterEach(async () => {
    vi.clearAllMocks();
    await rm(targetDir, { recursive: true, force: true });
  });

  // Test 1: Injects into existing AGENTS.md when found
  it('injects RAG section into existing AGENTS.md when --file targets it', async () => {
    const agentsPath = join(targetDir, 'AGENTS.md');
    await writeFile(agentsPath, '# Project Agents\n\nExisting content.\n');

    const { out } = await runSubcommand([
      'inject',
      '--config',
      '/path/project.json',
      '--file',
      agentsPath,
    ]);

    const content = await readFile(agentsPath, 'utf-8');
    expect(content).toContain(RAG_MARKER_START);
    expect(content).toContain(RAG_MARKER_END);
    expect(content).toContain('search_codebase');
    expect(content).toContain('# Project Agents'); // preserves existing content
    expect(out.join('\n')).toMatch(/inject|written|success/i);
  });

  // Test 2: Idempotent — replaces existing markers on re-run
  it('replaces existing markers on re-run (idempotent)', async () => {
    const agentsPath = join(targetDir, 'AGENTS.md');
    const existing = [
      '# Agents',
      '',
      RAG_MARKER_START,
      'old content here',
      RAG_MARKER_END,
      '',
      'Other stuff.',
    ].join('\n');
    await writeFile(agentsPath, existing);

    await runSubcommand(['inject', '--config', '/path/project.json', '--file', agentsPath]);

    const content = await readFile(agentsPath, 'utf-8');
    expect(content).not.toContain('old content here');
    expect(content).toContain('search_codebase');
    expect(content).toContain('Other stuff.');
    // Only one pair of markers
    expect(content.split(RAG_MARKER_START).length).toBe(2);
    expect(content.split(RAG_MARKER_END).length).toBe(2);
  });

  // Test 3: Creates new file when --file points to non-existent path
  it('creates file when --file points to non-existent path', async () => {
    const newPath = join(targetDir, 'CLAUDE.md');

    await runSubcommand(['inject', '--config', '/path/project.json', '--file', newPath]);

    const content = await readFile(newPath, 'utf-8');
    expect(content).toContain(RAG_MARKER_START);
    expect(content).toContain('search_codebase');
  });

  // Test 4: Exits with error when config load fails
  it('exits with error when config load fails', async () => {
    mockLoadConfig.mockRejectedValue(new Error('config not found'));

    const { err, exitCode } = await runSubcommand([
      'inject',
      '--config',
      '/path/project.json',
      '--file',
      join(targetDir, 'AGENTS.md'),
    ]);

    expect(exitCode).toBe(1);
    expect(err.join('\n')).toMatch(/config|failed/i);
  });

  // Test 5: Appends to end of file when no markers present
  it('appends RAG section to end of existing file', async () => {
    const filePath = join(targetDir, 'AGENTS.md');
    await writeFile(filePath, '# Project\n\nSome content.\n');

    await runSubcommand(['inject', '--config', '/path/project.json', '--file', filePath]);

    const content = await readFile(filePath, 'utf-8');
    // Original content is before markers
    const markerPos = content.indexOf(RAG_MARKER_START);
    const originalPos = content.indexOf('# Project');
    expect(originalPos).toBeLessThan(markerPos);
  });
});

describe('agents check', () => {
  let targetDir: string;

  beforeEach(async () => {
    targetDir = await mkdtemp(join(tmpdir(), 'agents-check-'));
    mockLoadConfig.mockResolvedValue({
      targetProjectPath: targetDir,
      embedding: { provider: 'ollama', model: 'nomic-embed-text' },
      vectorStore: { host: 'localhost', port: 6333, collectionName: 'test' },
    });
  });

  afterEach(async () => {
    vi.clearAllMocks();
    await rm(targetDir, { recursive: true, force: true });
  });

  // Test 6: Reports injected when markers found in AGENTS.md
  it('reports injected when markers found in AGENTS.md', async () => {
    await writeFile(
      join(targetDir, 'AGENTS.md'),
      `# Agents\n\n${RAG_MARKER_START}\nstuff\n${RAG_MARKER_END}\n`,
    );

    const { out } = await runSubcommand(['check', '--config', '/path/project.json']);

    expect(out.join('\n')).toMatch(/AGENTS\.md.*inject|found/i);
  });

  // Test 7: Reports injected when markers found in CLAUDE.md
  it('reports injected when markers found in CLAUDE.md', async () => {
    await writeFile(
      join(targetDir, 'CLAUDE.md'),
      `# Claude\n\n${RAG_MARKER_START}\nstuff\n${RAG_MARKER_END}\n`,
    );

    const { out } = await runSubcommand(['check', '--config', '/path/project.json']);

    expect(out.join('\n')).toMatch(/CLAUDE\.md.*inject|found/i);
  });

  // Test 8: Reports not injected when no markers found
  it('reports not injected when no markers in any file', async () => {
    const { out } = await runSubcommand(['check', '--config', '/path/project.json']);

    expect(out.join('\n')).toMatch(/not.*inject|not found|no.*rag/i);
  });
});
