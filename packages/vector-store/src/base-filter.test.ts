import { describe, expect, it } from 'vitest';
import { baseFilter } from './base-filter.js';

describe('baseFilter', () => {
  it('always excludes the reserved contract point without a user filter', () => {
    expect(baseFilter()).toEqual({
      must_not: [{ key: 'kind', match: { value: '__ia_contract__' } }],
    });
  });

  it('preserves every user clause while appending reserved-point exclusion', () => {
    const userFilter = {
      must: [{ key: 'repoId', match: { value: 'repo-a' } }],
      should: [{ key: 'language', match: { value: 'typescript' } }],
      must_not: [{ key: 'stereotype', match: { value: 'test' } }],
    };

    expect(baseFilter(userFilter)).toEqual({
      must: userFilter.must,
      should: userFilter.should,
      must_not: [
        ...userFilter.must_not,
        { key: 'kind', match: { value: '__ia_contract__' } },
      ],
    });
  });

  it('does not mutate the caller filter', () => {
    const userFilter = { must: [{ key: 'repoId', match: { value: 'repo-a' } }] };
    const snapshot = structuredClone(userFilter);

    baseFilter(userFilter);

    expect(userFilter).toEqual(snapshot);
  });

  it('preserves scalar user filter properties', () => {
    const userFilter = { min_should: 1, must: [] };

    expect(baseFilter(userFilter)).toEqual({
      min_should: 1,
      must: [],
      must_not: [{ key: 'kind', match: { value: '__ia_contract__' } }],
    });
  });

  it('appends the reserved exclusion when composing an existing filter', () => {
    const once = baseFilter();

    expect(baseFilter(once).must_not).toEqual([
      { key: 'kind', match: { value: '__ia_contract__' } },
      { key: 'kind', match: { value: '__ia_contract__' } },
    ]);
  });

  it('returns a fresh filter object for each call', () => {
    expect(baseFilter()).not.toBe(baseFilter());
  });
});
