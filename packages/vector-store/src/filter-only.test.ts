import { describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_FILTER_ONLY_CEILING,
  FilterOnlyRetriever,
  orderDeterministically,
} from './filter-only.js';
import { FilterOnlyRetrievalError } from '@ia-framework/core';

function point(
  id: string,
  repoId: string | undefined,
  relativePath: string,
  startLine: number,
) {
  return {
    id,
    payload: {
      chunkId: id,
      repoId,
      relativePath,
      startLine,
      endLine: startLine,
      language: 'typescript',
      chunkType: 'function',
      imports: [],
      exports: [],
      indexedAt: '2026-01-01',
    },
  };
}

describe('FilterOnlyRetriever', () => {
  it('pages until the cursor is exhausted', async () => {
    const scroll = vi
      .fn()
      .mockResolvedValueOnce({ points: [point('1', 'a', 'src/a.ts', 2)], nextOffset: 'next' })
      .mockResolvedValueOnce({ points: [point('2', 'a', 'src/a.ts', 1)], nextOffset: 3 })
      .mockResolvedValueOnce({ points: [point('3', 'b', 'src/b.ts', 1)], nextOffset: undefined });
    const retriever = new FilterOnlyRetriever({ scroll, retrieve: vi.fn() });

    const result = await retriever.scrollAll({ must: [] }, { ceiling: 10 });

    expect(result.points.map((item) => item.id)).toEqual(['2', '1', '3']);
    expect(result.truncated).toBe(false);
    expect(scroll).toHaveBeenCalledTimes(3);
  });

  it('reports truncation when the safety ceiling is reached', async () => {
    const scroll = vi.fn().mockResolvedValue({
      points: [point('1', 'a', 'src/a.ts', 1), point('2', 'a', 'src/a.ts', 2)],
      nextOffset: 'more',
    });
    const retriever = new FilterOnlyRetriever({ scroll, retrieve: vi.fn() });

    const result = await retriever.scrollAll({}, { ceiling: 3 });

    expect(result.points).toHaveLength(3);
    expect(result.truncated).toBe(true);
  });

  it('uses a named documented default ceiling', () => {
    expect(DEFAULT_FILTER_ONLY_CEILING).toBe(10_000);
  });

  it('retrieves known ids without scrolling', async () => {
    const retrieve = vi.fn().mockResolvedValue([point('known', 'a', 'src/a.ts', 1)]);
    const scroll = vi.fn();
    const retriever = new FilterOnlyRetriever({ scroll, retrieve });

    await expect(retriever.retrieveByIds(['known'])).resolves.toHaveLength(1);
    expect(retrieve).toHaveBeenCalledWith(['known']);
    expect(scroll).not.toHaveBeenCalled();
  });

  it('orders by repository, path, and line on the client', () => {
    const points = [
      point('b', 'repo-b', 'src/a.ts', 1),
      point('u', undefined, 'src/a.ts', 1),
      point('a2', 'repo-a', 'src/a.ts', 2),
      point('a1', 'repo-a', 'src/a.ts', 1),
      point('a3', 'repo-a', 'src/b.ts', 1),
    ];

    expect(orderDeterministically(points).map((item) => item.id)).toEqual([
      'u',
      'a1',
      'a2',
      'a3',
      'b',
    ]);
  });

  it('does not send order_by while paging', async () => {
    const scroll = vi.fn().mockResolvedValue({ points: [], nextOffset: undefined });
    const retriever = new FilterOnlyRetriever({ scroll, retrieve: vi.fn() });

    await retriever.scrollAll({}, { ceiling: 10 });

    expect(scroll.mock.calls[0]?.[2]).toBeUndefined();
  });

  it('wraps scroll failures and never calls similarity search', async () => {
    const scroll = vi.fn().mockRejectedValue(new Error('scroll unavailable'));
    const search = vi.fn();
    const retriever = new FilterOnlyRetriever({ scroll, retrieve: vi.fn(), search });

    await expect(retriever.scrollAll({}, { ceiling: 10 })).rejects.toBeInstanceOf(
      FilterOnlyRetrievalError,
    );
    expect(search).not.toHaveBeenCalled();
  });

  it('returns no points for an empty match without similarity fallback', async () => {
    const scroll = vi.fn().mockResolvedValue({ points: [], nextOffset: undefined });
    const search = vi.fn();
    const retriever = new FilterOnlyRetriever({ scroll, retrieve: vi.fn(), search });

    await expect(retriever.scrollAll({ must: [] }, { ceiling: 10 })).resolves.toEqual({
      points: [],
      truncated: false,
    });
    expect(search).not.toHaveBeenCalled();
  });

  it('returns an empty result when retrieving no ids', async () => {
    const retrieve = vi.fn();
    const retriever = new FilterOnlyRetriever({ scroll: vi.fn(), retrieve });

    await expect(retriever.retrieveByIds([])).resolves.toEqual([]);
    expect(retrieve).not.toHaveBeenCalled();
  });

  it('wraps known-id retrieval failures as filter-only errors', async () => {
    const retriever = new FilterOnlyRetriever({
      scroll: vi.fn(),
      retrieve: vi.fn().mockRejectedValue(new Error('retrieve unavailable')),
    });

    await expect(retriever.retrieveByIds(['id'])).rejects.toMatchObject({
      name: 'FilterOnlyRetrievalError',
      operation: 'retrieveByIds',
    });
  });

  it('stops exactly at the ceiling and does not request another page', async () => {
    const scroll = vi.fn().mockResolvedValue({
      points: [point('1', 'a', 'src/a.ts', 1), point('2', 'a', 'src/a.ts', 2)],
      nextOffset: 'more',
    });
    const retriever = new FilterOnlyRetriever({ scroll, retrieve: vi.fn() });

    const result = await retriever.scrollAll({}, { ceiling: 2 });

    expect(result.points).toHaveLength(2);
    expect(result.truncated).toBe(true);
    expect(scroll).toHaveBeenCalledTimes(1);
  });

  it('uses the supplied filter on every page request', async () => {
    const scroll = vi
      .fn()
      .mockResolvedValueOnce({ points: [point('1', 'a', 'src/a.ts', 1)], nextOffset: 2 })
      .mockResolvedValueOnce({ points: [], nextOffset: undefined });
    const retriever = new FilterOnlyRetriever({ scroll, retrieve: vi.fn() });
    const filter = { must: [{ key: 'repoId', match: { value: 'repo-a' } }] };

    await retriever.scrollAll(filter, { ceiling: 5 });

    expect(scroll.mock.calls[0]?.[0]).toBe(filter);
    expect(scroll.mock.calls[1]?.[0]).toBe(filter);
  });
});
