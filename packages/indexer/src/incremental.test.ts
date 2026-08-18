import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { chmod, mkdir, mkdtemp, readFile, rm, unlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import {
  getChangedFiles,
  getFullReindexRequired,
  getLastIndexedCommit,
  saveLastIndexedCommit,
  setFullReindexRequired,
} from './incremental.js';

const execFileAsync = promisify(execFile);

async function git(cwd: string, args: string[]): Promise<string> {
  const { stdout } = await execFileAsync('git', args, { cwd });
  return stdout.trim();
}

/** Commit whatever is currently on disk under `repoRoot` and return the new commit SHA. */
async function commitAll(repoRoot: string, message: string): Promise<string> {
  await git(repoRoot, ['add', '-A']);
  await execFileAsync(
    'git',
    [
      '-c',
      'user.email=test@example.com',
      '-c',
      'user.name=Test',
      '-c',
      'commit.gpgsign=false',
      'commit',
      '-qm',
      message,
      '--allow-empty',
    ],
    { cwd: repoRoot },
  );
  return git(repoRoot, ['rev-parse', 'HEAD']);
}

/**
 * Build a git repo fixture:
 *   <root>/achpro/src/A.java
 *   <root>/platform/src/P.java
 *   <root>/paypro/src/R.java
 * with an initial commit already made. Returns the root path and initial SHA.
 */
async function createMultiRepoFixture(): Promise<{ root: string; initialCommit: string }> {
  const root = await mkdtemp(join(tmpdir(), 'incremental-git-'));
  await git(root, ['init', '-q']);
  await mkdir(join(root, 'achpro', 'src'), { recursive: true });
  await mkdir(join(root, 'platform', 'src'), { recursive: true });
  await mkdir(join(root, 'paypro', 'src'), { recursive: true });
  await writeFile(join(root, 'achpro', 'src', 'A.java'), 'class A {}\n');
  await writeFile(join(root, 'platform', 'src', 'P.java'), 'class P {}\n');
  await writeFile(join(root, 'paypro', 'src', 'R.java'), 'class R {}\n');
  const initialCommit = await commitAll(root, 'initial');
  return { root, initialCommit };
}

describe('incremental indexing state', () => {
  it('isolates repo-scoped state while preserving the unscoped collection key', async () => {
    const frameworkDir = await mkdtemp(join(tmpdir(), 'incremental-state-'));

    await saveLastIndexedCommit(
      frameworkDir,
      'repo-a-commit',
      'codebase',
      undefined,
      undefined,
      'repo-a',
    );
    await saveLastIndexedCommit(
      frameworkDir,
      'repo-b-commit',
      'codebase',
      undefined,
      undefined,
      'repo-b',
    );
    await saveLastIndexedCommit(frameworkDir, 'legacy-commit', 'codebase');

    await expect(getLastIndexedCommit(frameworkDir, 'codebase', 'repo-a')).resolves.toBe(
      'repo-a-commit',
    );
    await expect(getLastIndexedCommit(frameworkDir, 'codebase', 'repo-b')).resolves.toBe(
      'repo-b-commit',
    );
    await expect(getLastIndexedCommit(frameworkDir, 'codebase')).resolves.toBe('legacy-commit');

    const state = JSON.parse(
      await readFile(join(frameworkDir, 'indexing-state.json'), 'utf-8'),
    ) as Record<string, { lastIndexedCommit: string }>;
    expect(state['codebase:repo-a']?.lastIndexedCommit).toBe('repo-a-commit');
    expect(state['codebase:repo-b']?.lastIndexedCommit).toBe('repo-b-commit');
    expect(state.codebase?.lastIndexedCommit).toBe('legacy-commit');
  });

  it('persists a full-reindex marker until a successful commit save replaces it', async () => {
    const frameworkDir = await mkdtemp(join(tmpdir(), 'incremental-retry-'));

    await setFullReindexRequired(frameworkDir, 'codebase', true, 'repo-a');
    await expect(getFullReindexRequired(frameworkDir, 'codebase', 'repo-a')).resolves.toBe(true);
    await expect(getLastIndexedCommit(frameworkDir, 'codebase', 'repo-a')).resolves.toBeNull();

    await saveLastIndexedCommit(
      frameworkDir,
      'repo-a-commit',
      'codebase',
      undefined,
      undefined,
      'repo-a',
    );

    await expect(getFullReindexRequired(frameworkDir, 'codebase', 'repo-a')).resolves.toBe(false);
    await expect(getLastIndexedCommit(frameworkDir, 'codebase', 'repo-a')).resolves.toBe(
      'repo-a-commit',
    );
  });
});

describe('getChangedFiles path scoping', () => {
  it('excludes sibling changes when scoped to a configured subdirectory', async () => {
    const { root, initialCommit } = await createMultiRepoFixture();
    const achpro = join(root, 'achpro');

    await writeFile(join(root, 'platform', 'src', 'P.java'), 'class P { /* changed */ }\n');
    await commitAll(root, 'change platform');

    const result = await getChangedFiles(achpro, initialCommit);

    expect(result.toProcess).toEqual([]);
    expect(result.toDelete).toEqual([]);
    const allPaths = [...result.toProcess, ...result.toDelete];
    for (const p of allPaths) {
      expect(p).not.toContain('platform');
      expect(p).not.toContain('paypro');
      expect(p).not.toContain('risk-engine');
    }
  });

  it('returns the target change correctly scoped, without doubled prefixes', async () => {
    const { root, initialCommit } = await createMultiRepoFixture();
    const achpro = join(root, 'achpro');

    await writeFile(join(root, 'achpro', 'src', 'A.java'), 'class A { /* changed */ }\n');
    await commitAll(root, 'change achpro');

    const result = await getChangedFiles(achpro, initialCommit);

    expect(result.toProcess).toEqual([join(achpro, 'src', 'A.java')]);
    for (const p of result.toProcess) {
      expect(p).not.toContain(join('achpro', 'achpro'));
      const rel = relative(achpro, p);
      expect(rel.startsWith('..')).toBe(false);
    }
  });

  it('returns a deleted target file for vector cleanup, not for re-parsing', async () => {
    const { root, initialCommit } = await createMultiRepoFixture();
    const achpro = join(root, 'achpro');

    await unlink(join(root, 'achpro', 'src', 'A.java'));
    await commitAll(root, 'delete achpro file');

    const result = await getChangedFiles(achpro, initialCommit);

    expect(result.toDelete).toEqual([join(achpro, 'src', 'A.java')]);
    expect(result.toProcess).toEqual([]);
  });

  it('scopes each configured target independently within one shared worktree', async () => {
    const { root, initialCommit } = await createMultiRepoFixture();

    await writeFile(join(root, 'achpro', 'src', 'A.java'), 'class A { /* changed */ }\n');
    await writeFile(join(root, 'platform', 'src', 'P.java'), 'class P { /* changed */ }\n');
    await writeFile(join(root, 'paypro', 'src', 'R.java'), 'class R { /* changed */ }\n');
    await commitAll(root, 'change all');

    const achproResult = await getChangedFiles(join(root, 'achpro'), initialCommit);
    const platformResult = await getChangedFiles(join(root, 'platform'), initialCommit);
    const payproResult = await getChangedFiles(join(root, 'paypro'), initialCommit);

    expect(achproResult.toProcess).toEqual([join(root, 'achpro', 'src', 'A.java')]);
    expect(platformResult.toProcess).toEqual([join(root, 'platform', 'src', 'P.java')]);
    expect(payproResult.toProcess).toEqual([join(root, 'paypro', 'src', 'R.java')]);
  });

  it('returns changes under all child directories when the target is the git root', async () => {
    const { root, initialCommit } = await createMultiRepoFixture();

    await writeFile(join(root, 'achpro', 'src', 'A.java'), 'class A { /* changed */ }\n');
    await writeFile(join(root, 'platform', 'src', 'P.java'), 'class P { /* changed */ }\n');
    await commitAll(root, 'change achpro and platform');

    const result = await getChangedFiles(root, initialCommit);

    expect(result.toProcess).toEqual(
      expect.arrayContaining([
        join(root, 'achpro', 'src', 'A.java'),
        join(root, 'platform', 'src', 'P.java'),
      ]),
    );
    expect(result.toProcess).toHaveLength(2);
  });

  it('leaves an independent git repository (target == its own root) unaffected', async () => {
    const independentRoot = await mkdtemp(join(tmpdir(), 'incremental-independent-'));
    await git(independentRoot, ['init', '-q']);
    await mkdir(join(independentRoot, 'src'), { recursive: true });
    await writeFile(join(independentRoot, 'src', 'Main.java'), 'class Main {}\n');
    const initialCommit = await commitAll(independentRoot, 'initial');

    await writeFile(join(independentRoot, 'src', 'Main.java'), 'class Main { /* changed */ }\n');
    await commitAll(independentRoot, 'change');

    const result = await getChangedFiles(independentRoot, initialCommit);

    expect(result.toProcess).toEqual([join(independentRoot, 'src', 'Main.java')]);
  });

  describe('defensive path validation', () => {
    let fakeGitDir: string;
    let originalPath: string | undefined;

    beforeEach(async () => {
      fakeGitDir = await mkdtemp(join(tmpdir(), 'incremental-fakegit-'));
      const script = ['#!/bin/sh', 'printf "/etc/passwd\\n../platform/src/P.java\\n"', ''].join(
        '\n',
      );
      await writeFile(join(fakeGitDir, 'git'), script, 'utf-8');
      await chmod(join(fakeGitDir, 'git'), 0o755);
      originalPath = process.env.PATH;
      process.env.PATH = `${fakeGitDir}:${originalPath ?? ''}`;
    });

    afterEach(async () => {
      if (originalPath !== undefined) process.env.PATH = originalPath;
      await rm(fakeGitDir, { recursive: true, force: true });
    });

    it('rejects absolute and escaping paths instead of returning them', async () => {
      const projectPath = await mkdtemp(join(tmpdir(), 'incremental-target-'));

      const result = await getChangedFiles(projectPath, 'irrelevant-sha');

      expect(result.toProcess).toEqual([]);
      expect(result.toDelete).toEqual([]);
      expect(result.failures?.length).toBeGreaterThan(0);
      const messages = (result.failures ?? []).map((f) => f.error).join(' ');
      expect(messages).toMatch(/\/etc\/passwd|\.\.\/platform/);
    });
  });
});
