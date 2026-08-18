import { describe, expect, it, vi } from 'vitest';
import { LiveSourceReader, validateRelativePath } from './live-source-reader.js';
import { createHash } from 'node:crypto';

function candidate(overrides: Partial<Parameters<LiveSourceReader['read']>[0][number]> = {}) {
  return {
    relativePath: 'src/service.ts',
    startLine: 2,
    endLine: 3,
    ...overrides,
  };
}

describe('validateRelativePath', () => {
  it('accepts a normal relative path', () => {
    expect(validateRelativePath('src/service.ts')).toBe('src/service.ts');
  });

  it.each(['../outside.ts', 'src/../../outside.ts', '/etc/passwd', '\\server\\share\\file.ts', 'C:\\outside.ts'])(
    'rejects traversal or absolute path %s', (path) => {
      expect(() => validateRelativePath(path)).toThrow(/relative|outside|traversal/i);
    },
  );
});

describe('LiveSourceReader', () => {
  it('reads one file once for multiple ranges', async () => {
    const readFile = vi.fn().mockResolvedValue('one\ntwo\nthree\nfour');
    const reader = new LiveSourceReader(readFile);

    const results = await reader.read([
      candidate({ startLine: 1, endLine: 2 }),
      candidate({ startLine: 3, endLine: 4 }),
      candidate({ startLine: 2, endLine: 3 }),
    ]);

    expect(readFile).toHaveBeenCalledTimes(1);
    expect(results.map((result) => result.content)).toEqual(['one\ntwo', 'three\nfour', 'two\nthree']);
  });

  it('reads different repositories separately even for the same path', async () => {
    const readFile = vi.fn((path: string, repo?: string) =>
      Promise.resolve(`${repo}:${path}\nbody`),
    );
    const reader = new LiveSourceReader(readFile);

    const results = await reader.read([
      candidate({ repoId: 'repo-a', startLine: 1, endLine: 1 }),
      candidate({ repoId: 'repo-b', startLine: 1, endLine: 1 }),
    ]);

    expect(readFile).toHaveBeenCalledTimes(2);
    expect(results.map((result) => result.content)).toEqual(['repo-a:src/service.ts', 'repo-b:src/service.ts']);
  });

  it('slices one-indexed ranges inclusively', async () => {
    const reader = new LiveSourceReader(vi.fn().mockResolvedValue('a\nb\nc\nd'));

    const [result] = await reader.read([candidate({ startLine: 2, endLine: 3 })]);

    expect(result?.content).toBe('b\nc');
  });

  it('rejects traversal before invoking the reader', async () => {
    const readFile = vi.fn();
    const reader = new LiveSourceReader(readFile);

    const [result] = await reader.read([candidate({ relativePath: '../outside.ts' })]);

    expect(readFile).not.toHaveBeenCalled();
    expect(result?.degraded).toBe('read-failed');
    expect(result?.error).toMatch(/relative|outside|traversal/i);
  });

  it('rejects absolute paths before invoking the reader', async () => {
    const readFile = vi.fn();
    const reader = new LiveSourceReader(readFile);

    const [result] = await reader.read([candidate({ relativePath: '/etc/passwd' })]);

    expect(readFile).not.toHaveBeenCalled();
    expect(result?.degraded).toBe('read-failed');
  });

  it('marks a failed read without silently dropping the candidate', async () => {
    const reader = new LiveSourceReader(vi.fn().mockRejectedValue(new Error('ENOENT')));

    const [result] = await reader.read([candidate()]);

    expect(result?.relativePath).toBe('src/service.ts');
    expect(result?.content).toBeUndefined();
    expect(result?.degraded).toBe('read-failed');
    expect(result?.error).toContain('ENOENT');
  });

  it('keeps deliberate empty content distinct from a failed read', async () => {
    const reader = new LiveSourceReader(vi.fn().mockResolvedValue(''));

    const [result] = await reader.read([candidate()]);

    expect(result?.content).toBe('');
    expect(result?.degraded).toBeUndefined();
    expect(result?.error).toBeUndefined();
  });

  it('marks stale content when the live hash differs', async () => {
    const reader = new LiveSourceReader(vi.fn().mockResolvedValue('new content'));
    const oldHash = createHash('sha256').update('old content').digest('hex');

    const [result] = await reader.read([candidate({ contentHash: oldHash, startLine: 1, endLine: 1 })]);

    expect(result?.stale).toBe(true);
  });

  it('does not mark content stale when the hash matches', async () => {
    const content = 'same content';
    const reader = new LiveSourceReader(vi.fn().mockResolvedValue(content));
    const hash = createHash('sha256').update(content).digest('hex');

    const [result] = await reader.read([candidate({ contentHash: hash, startLine: 1, endLine: 1 })]);

    expect(result?.stale).toBeUndefined();
  });

  it('checks drift for every candidate, not only the first five', async () => {
    const content = 'same';
    const reader = new LiveSourceReader(vi.fn().mockResolvedValue(content));
    const staleHash = createHash('sha256').update('old').digest('hex');
    const candidates = Array.from({ length: 6 }, (_, index) =>
      candidate({ startLine: 1, endLine: 1, relativePath: `src/${index}.ts`, contentHash: staleHash }),
    );

    const results = await reader.read(candidates);

    expect(results).toHaveLength(6);
    expect(results.every((result) => result.stale === true)).toBe(true);
  });

  it('preserves candidate ordering after grouped reads', async () => {
    const reader = new LiveSourceReader(vi.fn().mockResolvedValue('a\nb'));
    const first = candidate({ relativePath: 'src/z.ts', startLine: 1, endLine: 1 });
    const second = candidate({ relativePath: 'src/a.ts', startLine: 2, endLine: 2 });

    const results = await reader.read([first, second]);

    expect(results.map((result) => result.relativePath)).toEqual(['src/z.ts', 'src/a.ts']);
  });

  it('passes repository identity to the reader callback', async () => {
    const readFile = vi.fn().mockResolvedValue('content');
    const reader = new LiveSourceReader(readFile);

    await reader.read([candidate({ repoId: 'payments' })]);

    expect(readFile).toHaveBeenCalledWith('src/service.ts', 'payments');
  });
});
