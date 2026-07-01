import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtemp, writeFile, readFile, rm, mkdir } from 'node:fs/promises';
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

import { agentsCommand, RAG_MARKER_START, RAG_MARKER_END } from './agents.command.js';

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

  // Test 3c: New 3-tool content is present in injected content (search_codebase_hybrid removed)
  it('includes new 3-tool documentation in injected content', async () => {
    const agentsPath = join(targetDir, 'AGENTS.md');
    await writeFile(agentsPath, '# Project\n');

    await runSubcommand(['inject', '--config', '/path/project.json', '--file', agentsPath]);

    const content = await readFile(agentsPath, 'utf-8');
    expect(content).toContain('search_codebase');
    expect(content).toContain('get_file');
    expect(content).toContain('get_dependencies');
    // Old tool should NOT appear
    expect(content).not.toContain('search_codebase_hybrid');
    // New filter params should be documented
    expect(content).toContain('stereotype');
    expect(content).toContain('archLayer');
    // Multi-repo path rule must be documented
    expect(content).toContain('Multi-repo path resolution');
    expect(content).toContain('repo:');
    // Dedicated expand_hops section with full mechanics must be documented
    expect(content).toContain('Dependency graph expansion (`expand_hops`)');
    expect(content).toContain('clamped to 0–2');
    expect(content).toContain('70/30');
    expect(content).toContain('1 hop');
  });

  // Test 3d (US4): Context7 + Sequential Thinking guidance present in injected content
  it('includes Context7 and Sequential Thinking guidance (US4)', async () => {
    const agentsPath = join(targetDir, 'AGENTS.md');
    await writeFile(agentsPath, '# Project\n');

    await runSubcommand(['inject', '--config', '/path/project.json', '--file', agentsPath]);

    const content = await readFile(agentsPath, 'utf-8');
    expect(content).toContain('When to use Context7');
    expect(content).toContain('When to use Sequential Thinking');
    // Each section conveys when NOT to use it
    expect(content).toMatch(/Do NOT use it for/);
    // Still alongside the RAG tools guidance
    expect(content).toContain('search_codebase');
  });

  // Test 3e (US4): re-injecting an old block converges to one block with all guidance
  it('refreshes an old block to include Context7/Sequential Thinking without duplication (US4)', async () => {
    const agentsPath = join(targetDir, 'AGENTS.md');
    const old = [
      '# Agents',
      '',
      RAG_MARKER_START,
      '## Codebase RAG Tools (ia-framework)',
      'search_codebase only, no context7 here',
      RAG_MARKER_END,
      '',
    ].join('\n');
    await writeFile(agentsPath, old);

    await runSubcommand(['inject', '--config', '/path/project.json', '--file', agentsPath]);

    const content = await readFile(agentsPath, 'utf-8');
    // Exactly one marker block
    expect(content.split(RAG_MARKER_START).length).toBe(2);
    expect(content.split(RAG_MARKER_END).length).toBe(2);
    // Now contains all three guidance areas
    expect(content).toContain('search_codebase');
    expect(content).toContain('When to use Context7');
    expect(content).toContain('When to use Sequential Thinking');
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

describe('agents inject — target resolution (US1/US2/US3/US5)', () => {
  let root: string; // acts as config dir
  let repoA: string;
  let repoB: string;
  let extra: string;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'agents-targets-'));
    repoA = join(root, 'repo-a');
    repoB = join(root, 'repo-b');
    extra = join(root, 'ops-runbooks');
    await mkdir(repoA);
    await mkdir(repoB);
    await mkdir(extra);
  });

  afterEach(async () => {
    vi.clearAllMocks();
    await rm(root, { recursive: true, force: true });
  });

  const configPathArg = ['--config', 'CFG']; // getConfigPath uses this; dirname → cwd, but repos resolve via configDir

  // US1: only flagged repos are injected; unflagged untouched (FR-002/FR-003)
  it('injects only into repos flagged injectAgents: true', async () => {
    mockLoadConfig.mockResolvedValue({
      repos: [
        { path: repoA, name: 'repo-a', injectAgents: true },
        { path: repoB, name: 'repo-b' },
      ],
      embedding: { provider: 'ollama', model: 'nomic-embed-text' },
      vectorStore: { host: 'localhost', port: 6333, collectionName: 'test' },
    });

    await runSubcommand(['inject', ...configPathArg]);

    // repoA got AGENTS.md; repoB did not
    const aContent = await readFile(join(repoA, 'AGENTS.md'), 'utf-8');
    expect(aContent).toContain(RAG_MARKER_START);
    await expect(readFile(join(repoB, 'AGENTS.md'), 'utf-8')).rejects.toThrow();
  });

  // US1: idempotent refresh across multiple targets (FR-006)
  it('refreshes existing blocks in flagged repos without duplication', async () => {
    await writeFile(
      join(repoA, 'AGENTS.md'),
      `x\n${RAG_MARKER_START}\nSTALE_SENTINEL_XYZ\n${RAG_MARKER_END}\n`,
    );
    mockLoadConfig.mockResolvedValue({
      repos: [{ path: repoA, name: 'repo-a', injectAgents: true }],
      embedding: { provider: 'ollama', model: 'nomic-embed-text' },
      vectorStore: { host: 'localhost', port: 6333, collectionName: 'test' },
    });

    await runSubcommand(['inject', ...configPathArg]);

    const content = await readFile(join(repoA, 'AGENTS.md'), 'utf-8');
    expect(content).not.toContain('STALE_SENTINEL_XYZ');
    expect(content.split(RAG_MARKER_START).length).toBe(2);
  });

  // US2: zero flagged repos → no files written, message printed, exit 0 (FR-004)
  it('reports no target and writes nothing when no repo is flagged', async () => {
    mockLoadConfig.mockResolvedValue({
      repos: [{ path: repoA, name: 'repo-a' }, { path: repoB, name: 'repo-b' }],
      embedding: { provider: 'ollama', model: 'nomic-embed-text' },
      vectorStore: { host: 'localhost', port: 6333, collectionName: 'test' },
    });

    const { out, exitCode } = await runSubcommand(['inject', ...configPathArg]);

    expect(out.join('\n')).toMatch(/no injection target configured/i);
    expect(exitCode).toBeUndefined(); // exit 0 (no explicit exit)
    await expect(readFile(join(repoA, 'AGENTS.md'), 'utf-8')).rejects.toThrow();
    await expect(readFile(join(repoB, 'AGENTS.md'), 'utf-8')).rejects.toThrow();
  });

  // US3: legacy targetProjectPath is implicitly opted-in (FR-008)
  it('injects into the single legacy targetProjectPath target', async () => {
    mockLoadConfig.mockResolvedValue({
      targetProjectPath: repoA,
      embedding: { provider: 'ollama', model: 'nomic-embed-text' },
      vectorStore: { host: 'localhost', port: 6333, collectionName: 'test' },
    });

    await runSubcommand(['inject', ...configPathArg]);

    const content = await readFile(join(repoA, 'AGENTS.md'), 'utf-8');
    expect(content).toContain(RAG_MARKER_START);
  });

  // US5: agentInjectionTargets (non-indexed) get injected alongside flagged repos (FR-017/FR-018)
  it('injects into a non-indexed agentInjectionTargets path without touching unflagged repos', async () => {
    mockLoadConfig.mockResolvedValue({
      repos: [
        { path: repoA, name: 'repo-a', injectAgents: true },
        { path: repoB, name: 'repo-b' },
      ],
      agentInjectionTargets: [extra],
      embedding: { provider: 'ollama', model: 'nomic-embed-text' },
      vectorStore: { host: 'localhost', port: 6333, collectionName: 'test' },
    });

    await runSubcommand(['inject', ...configPathArg]);

    expect(await readFile(join(repoA, 'AGENTS.md'), 'utf-8')).toContain(RAG_MARKER_START);
    expect(await readFile(join(extra, 'AGENTS.md'), 'utf-8')).toContain(RAG_MARKER_START);
    await expect(readFile(join(repoB, 'AGENTS.md'), 'utf-8')).rejects.toThrow();
  });

  // Polish: per-target summary + continue-on-failure for a missing path (FR-011/FR-012)
  it('reports per-target summary and continues past a failing target', async () => {
    const missing = join(root, 'does-not-exist');
    mockLoadConfig.mockResolvedValue({
      repos: [{ path: repoA, name: 'repo-a', injectAgents: true }],
      agentInjectionTargets: [missing],
      embedding: { provider: 'ollama', model: 'nomic-embed-text' },
      vectorStore: { host: 'localhost', port: 6333, collectionName: 'test' },
    });

    const { out, exitCode } = await runSubcommand(['inject', ...configPathArg]);

    // repoA succeeded even though the missing path failed
    expect(await readFile(join(repoA, 'AGENTS.md'), 'utf-8')).toContain(RAG_MARKER_START);
    expect(out.join('\n')).toMatch(/failed/i);
    expect(out.join('\n')).toMatch(/Created:|Injected:|Refreshed:/);
    expect(exitCode).toBe(1); // failures surface a non-zero exit
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
