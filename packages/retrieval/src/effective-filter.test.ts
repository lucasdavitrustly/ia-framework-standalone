import { describe, expect, it } from 'vitest';
import { toQdrantFilter, type EffectiveFilter } from './effective-filter.js';

describe('EffectiveFilter', () => {
  it('emits repository, user, test, and reserved clauses', () => {
    const filter: EffectiveFilter = {
      repoId: 'repo-a',
      userFilters: {
        must: [
          { key: 'language', match: { value: 'java' } },
          { key: 'stereotype', match: { value: 'service' } },
        ],
      },
      excludeTests: true,
      reservedExclusion: true,
    };

    expect(toQdrantFilter(filter)).toEqual({
      must: [
        { key: 'language', match: { value: 'java' } },
        { key: 'stereotype', match: { value: 'service' } },
        { key: 'repoId', match: { value: 'repo-a' } },
      ],
      must_not: [
        { key: 'stereotype', match: { value: 'test' } },
        { key: 'kind', match: { value: '__ia_contract__' } },
      ],
    });
  });

  it('omits test exclusion when explicitly disabled', () => {
    const result = toQdrantFilter({
      userFilters: {},
      excludeTests: false,
      reservedExclusion: true,
    });

    expect(result).toEqual({
      must_not: [{ key: 'kind', match: { value: '__ia_contract__' } }],
    });
  });

  it('preserves user should and must_not clauses', () => {
    const result = toQdrantFilter({
      userFilters: {
        should: [{ key: 'moduleInfo.module', match: { value: 'billing' } }],
        must_not: [{ key: 'language', match: { value: 'xml' } }],
      },
      excludeTests: true,
      reservedExclusion: true,
    });

    expect(result.should).toEqual([{ key: 'moduleInfo.module', match: { value: 'billing' } }]);
    expect(result.must_not).toEqual([
      { key: 'language', match: { value: 'xml' } },
      { key: 'stereotype', match: { value: 'test' } },
      { key: 'kind', match: { value: '__ia_contract__' } },
    ]);
  });

  it('is deterministic for equal inputs', () => {
    const filter: EffectiveFilter = {
      repoId: 'repo-a',
      userFilters: { must: [{ key: 'language', match: { value: 'typescript' } }] },
      excludeTests: true,
      reservedExclusion: true,
    };

    expect(toQdrantFilter(filter)).toEqual(toQdrantFilter(filter));
  });

  it('allows an unscoped repository while keeping required filter controls', () => {
    const filter: EffectiveFilter = {
      userFilters: {},
      excludeTests: false,
      reservedExclusion: true,
    };

    expect(toQdrantFilter(filter).must).toBeUndefined();
    expect(toQdrantFilter(filter).must_not).toBeDefined();
  });

  it('retains explicit module and architecture metadata filters', () => {
    const result = toQdrantFilter({
      userFilters: {
        must: [
          { key: 'archLayer', match: { value: 'service' } },
          { key: 'moduleInfo.module', match: { value: 'payments' } },
        ],
      },
      excludeTests: false,
      reservedExclusion: true,
    });

    expect(result.must).toEqual([
      { key: 'archLayer', match: { value: 'service' } },
      { key: 'moduleInfo.module', match: { value: 'payments' } },
    ]);
  });

  it('keeps a repository clause separate from same-path user criteria', () => {
    const result = toQdrantFilter({
      repoId: 'repo-a',
      userFilters: { must: [{ key: 'relativePath', match: { value: 'src/App.ts' } }] },
      excludeTests: false,
      reservedExclusion: true,
    });

    expect(result.must).toContainEqual({ key: 'repoId', match: { value: 'repo-a' } });
    expect(result.must).toContainEqual({
      key: 'relativePath',
      match: { value: 'src/App.ts' },
    });
  });

  it('does not mutate the user filter object', () => {
    const userFilters = { must: [{ key: 'language', match: { value: 'java' } }] };
    const before = structuredClone(userFilters);

    toQdrantFilter({ userFilters, excludeTests: true, reservedExclusion: true });

    expect(userFilters).toEqual(before);
  });

  it('emits only user clauses when reserved exclusion is disabled', () => {
    const result = toQdrantFilter({
      userFilters: { must: [{ key: 'language', match: { value: 'java' } }] },
      excludeTests: false,
      reservedExclusion: false,
    });

    expect(result).toEqual({
      must: [{ key: 'language', match: { value: 'java' } }],
    });
  });

  it('keeps array-valued user clauses intact', () => {
    const result = toQdrantFilter({
      userFilters: {
        must: [{ key: 'language', match: { any: ['java', 'typescript'] } }],
      },
      excludeTests: false,
      reservedExclusion: true,
    });

    expect(result.must).toEqual([
      { key: 'language', match: { any: ['java', 'typescript'] } },
    ]);
  });
});
