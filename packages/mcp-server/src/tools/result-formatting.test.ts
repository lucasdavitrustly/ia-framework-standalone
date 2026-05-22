import { describe, it, expect } from 'vitest';
import { buildCodeAnchor, formatRetrievalContext } from './result-formatting.js';

describe('buildCodeAnchor', () => {
  it('prepends [repoId] when repoId is present', () => {
    const result = buildCodeAnchor({
      relativePath: 'src/a.ts',
      startLine: 1,
      endLine: 10,
      repoId: 'core',
    });
    expect(result).toBe('[core] src/a.ts:1-10');
  });

  it('prepends [repoId] with name', () => {
    const result = buildCodeAnchor({
      relativePath: 'src/a.ts',
      startLine: 1,
      endLine: 10,
      name: 'Foo',
      repoId: 'core',
    });
    expect(result).toBe('[core] src/a.ts:1-10 (Foo)');
  });

  it('no prefix when repoId is absent (backward compat)', () => {
    const result = buildCodeAnchor({
      relativePath: 'src/a.ts',
      startLine: 1,
      endLine: 10,
    });
    expect(result).toBe('src/a.ts:1-10');
  });

  it('no prefix when repoId is undefined', () => {
    const result = buildCodeAnchor({
      relativePath: 'src/a.ts',
      startLine: 1,
      endLine: 10,
      name: 'Bar',
      repoId: undefined,
    });
    expect(result).toBe('src/a.ts:1-10 (Bar)');
  });

  it('appends [via repo] when expansionRepo differs from repoId', () => {
    const result = buildCodeAnchor({
      relativePath: 'src/a.ts',
      startLine: 1,
      endLine: 10,
      name: 'Foo',
      repoId: 'core',
      expansionRepo: 'shared-lib',
    });
    expect(result).toBe('[core] src/a.ts:1-10 (Foo) [via shared-lib]');
  });

  it('no [via] when expansionRepo is absent', () => {
    const result = buildCodeAnchor({
      relativePath: 'src/a.ts',
      startLine: 1,
      endLine: 10,
      repoId: 'core',
    });
    expect(result).toBe('[core] src/a.ts:1-10');
  });

  it('no [via] when expansionRepo equals repoId (same repo)', () => {
    const result = buildCodeAnchor({
      relativePath: 'src/a.ts',
      startLine: 1,
      endLine: 10,
      repoId: 'core',
      expansionRepo: 'core',
    });
    expect(result).toBe('[core] src/a.ts:1-10');
  });
});

describe('formatRetrievalContext', () => {
  it('includes [repo] in Anchor line when repoId present', () => {
    const result = formatRetrievalContext({
      relativePath: 'src/b.ts',
      startLine: 5,
      endLine: 20,
      name: 'Handler',
      repoId: 'backend',
    });
    expect(result).toContain('Anchor: [backend] src/b.ts:5-20 (Handler)');
  });

  it('no [repo] prefix in Anchor when repoId absent', () => {
    const result = formatRetrievalContext({
      relativePath: 'src/b.ts',
      startLine: 5,
      endLine: 20,
    });
    expect(result).toContain('Anchor: src/b.ts:5-20');
    expect(result).not.toContain('[');
  });
});
