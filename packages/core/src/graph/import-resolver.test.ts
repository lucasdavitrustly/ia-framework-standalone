import { describe, test, expect } from 'vitest';
import { resolveImportToRepo } from './import-resolver.js';

describe('resolveImportToRepo', () => {
  const repos = [
    { name: 'shared', provides: ['@company/shared'] },
    { name: 'ui-kit', provides: ['@company/ui', '@company/icons'] },
    { name: 'backend', provides: ['@company/api-client'] },
    { name: 'no-provides', provides: undefined },
  ];

  test('returns repo with matching provides prefix', () => {
    const result = resolveImportToRepo('@company/shared/utils', repos);
    expect(result).not.toBeNull();
    expect(result!.targetRepo).toBe('shared');
    expect(result!.matchedPrefix).toBe('@company/shared');
    expect(result!.remainingPath).toBe('utils');
  });

  test('returns null when no repo provides the import', () => {
    const result = resolveImportToRepo('lodash', repos);
    expect(result).toBeNull();
  });

  test('returns longest prefix match when multiple repos match', () => {
    const reposWithOverlap = [
      { name: 'broad', provides: ['@company'] },
      { name: 'specific', provides: ['@company/shared'] },
    ];
    const result = resolveImportToRepo('@company/shared/utils', reposWithOverlap);
    expect(result).not.toBeNull();
    expect(result!.targetRepo).toBe('specific');
    expect(result!.matchedPrefix).toBe('@company/shared');
  });

  test('skips repos without provides field', () => {
    const result = resolveImportToRepo('no-provides', repos);
    expect(result).toBeNull();
  });

  test('exact match works', () => {
    const result = resolveImportToRepo('@company/shared', repos);
    expect(result).not.toBeNull();
    expect(result!.targetRepo).toBe('shared');
    expect(result!.matchedPrefix).toBe('@company/shared');
    expect(result!.remainingPath).toBe('');
  });
});
