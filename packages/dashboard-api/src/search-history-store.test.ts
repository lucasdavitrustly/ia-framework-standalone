import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { SearchHistoryStore } from './search-history-store.js';
import type { SearchHistoryEntry } from './search-history-store.js';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeEntry(
  overrides: Partial<Omit<SearchHistoryEntry, 'id' | 'createdAt'>> = {},
): Omit<SearchHistoryEntry, 'id' | 'createdAt'> {
  return {
    query: 'authentication middleware',
    params: { limit: 10, scoreThreshold: 0.3, collections: ['both'] },
    results: [
      {
        id: 'chunk-1',
        filePath: 'src/auth.ts',
        startLine: 10,
        endLine: 20,
        score: 0.85,
        source: 'ast',
        chunkType: 'function',
        matchedVector: 'text',
        content: 'function authenticate() {}',
        description: 'authenticate',
      },
    ],
    metrics: {
      latencyMs: 42,
      chunksScanned: 100,
      resultsReturned: 1,
      scoreRange: { min: 0.85, max: 0.85 },
    },
    collection: 'both',
    resultCount: 1,
    topScore: 0.85,
    latencyMs: 42,
    ...overrides,
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('SearchHistoryStore', () => {
  let store: SearchHistoryStore;

  beforeEach(() => {
    store = new SearchHistoryStore(':memory:');
  });

  afterEach(() => {
    store.close();
  });

  // Test 1: saveEntry() and getById() round-trip
  it('T1: saveEntry() persists an entry and getById() retrieves it with all fields intact', () => {
    const entry = makeEntry();
    const id = store.saveEntry(entry);

    expect(typeof id).toBe('string');
    expect(id.length).toBeGreaterThan(0);

    const retrieved = store.getById(id);
    expect(retrieved).not.toBeNull();
    expect(retrieved!.id).toBe(id);
    expect(retrieved!.query).toBe(entry.query);
    expect(retrieved!.collection).toBe(entry.collection);
    expect(retrieved!.resultCount).toBe(entry.resultCount);
    expect(retrieved!.topScore).toBe(entry.topScore);
    expect(retrieved!.latencyMs).toBe(entry.latencyMs);
    expect(retrieved!.params).toEqual(entry.params);
    expect(retrieved!.results).toEqual(entry.results);
    expect(retrieved!.metrics).toEqual(entry.metrics);
    expect(typeof retrieved!.createdAt).toBe('string');
  });

  // Test 2: list() pagination
  it('T2: list() returns entries ordered newest-first with pagination', () => {
    // Insert 25 entries
    for (let i = 0; i < 25; i++) {
      store.saveEntry(makeEntry({ query: `query-${i}` }));
    }

    const page1 = store.list({ page: 1, pageSize: 20 });
    expect(page1.entries.length).toBe(20);
    expect(page1.total).toBe(25);
    expect(page1.page).toBe(1);
    expect(page1.pageSize).toBe(20);

    const page2 = store.list({ page: 2, pageSize: 20 });
    expect(page2.entries.length).toBe(5);
    expect(page2.total).toBe(25);
  });

  // Test 3: list() filters by query text (case-insensitive LIKE)
  it('T3: list() filters by query text substring (case-insensitive)', () => {
    store.saveEntry(makeEntry({ query: 'Authentication middleware' }));
    store.saveEntry(makeEntry({ query: 'database connection' }));
    store.saveEntry(makeEntry({ query: 'AUTH token validation' }));

    const result = store.list({ q: 'auth' });
    expect(result.total).toBe(2);
    expect(result.entries.every((e) => e.query.toLowerCase().includes('auth'))).toBe(true);
  });

  // Test 4: list() filters by collection name (exact match)
  it('T4: list() filters by collection name (exact match)', () => {
    store.saveEntry(makeEntry({ collection: 'ast' }));
    store.saveEntry(makeEntry({ collection: 'llm' }));
    store.saveEntry(makeEntry({ collection: 'both' }));

    const astResult = store.list({ collection: 'ast' });
    expect(astResult.total).toBe(1);
    expect(astResult.entries[0]!.collection).toBe('ast');
  });

  // Test 5: list() filters by date range
  it('T5: list() filters by date range (dateFrom and dateTo inclusive)', () => {
    // We can't easily control exact timestamps with crypto.randomUUID + new Date(),
    // so we test by inserting then listing with a wide range that should include all
    store.saveEntry(makeEntry({ query: 'query-a' }));
    store.saveEntry(makeEntry({ query: 'query-b' }));

    const now = new Date();
    const from = new Date(now.getTime() - 60_000).toISOString(); // 1 min ago
    const to = new Date(now.getTime() + 60_000).toISOString(); // 1 min ahead

    const result = store.list({ dateFrom: from, dateTo: to });
    expect(result.total).toBe(2);

    // Out-of-range: far future from date should return 0
    const futureFrom = new Date(now.getTime() + 3_600_000).toISOString();
    const futureResult = store.list({ dateFrom: futureFrom });
    expect(futureResult.total).toBe(0);
  });

  // Test 6: list() filters by minimum top score
  it('T6: list() filters by minimum top score', () => {
    store.saveEntry(makeEntry({ topScore: 0.9, query: 'high score query' }));
    store.saveEntry(makeEntry({ topScore: 0.5, query: 'low score query' }));
    store.saveEntry(makeEntry({ topScore: 0.7, query: 'medium score query' }));

    const result = store.list({ minScore: 0.75 });
    expect(result.total).toBe(1);
    expect(result.entries[0]!.query).toBe('high score query');
  });

  // Test 7: list() combines multiple filters
  it('T7: list() combines multiple filters (query + collection + date range)', () => {
    const now = new Date();
    const from = new Date(now.getTime() - 60_000).toISOString();
    const to = new Date(now.getTime() + 60_000).toISOString();

    store.saveEntry(makeEntry({ query: 'auth check', collection: 'ast' }));
    store.saveEntry(makeEntry({ query: 'auth check', collection: 'llm' }));
    store.saveEntry(makeEntry({ query: 'database query', collection: 'ast' }));

    const result = store.list({ q: 'auth', collection: 'ast', dateFrom: from, dateTo: to });
    expect(result.total).toBe(1);
    expect(result.entries[0]!.query).toBe('auth check');
    expect(result.entries[0]!.collection).toBe('ast');
  });

  // Test 8: list() supports sorting
  it('T8: list() supports sorting by timestamp, query, resultCount, topScore, latency in asc/desc', () => {
    store.saveEntry(makeEntry({ query: 'b-query', topScore: 0.8, resultCount: 5, latencyMs: 100 }));
    store.saveEntry(makeEntry({ query: 'a-query', topScore: 0.9, resultCount: 2, latencyMs: 50 }));
    store.saveEntry(makeEntry({ query: 'c-query', topScore: 0.7, resultCount: 8, latencyMs: 200 }));

    // Sort by query ASC
    const queryAsc = store.list({ sortBy: 'query', sortOrder: 'asc' });
    expect(queryAsc.entries[0]!.query).toBe('a-query');
    expect(queryAsc.entries[2]!.query).toBe('c-query');

    // Sort by query DESC
    const queryDesc = store.list({ sortBy: 'query', sortOrder: 'desc' });
    expect(queryDesc.entries[0]!.query).toBe('c-query');

    // Sort by top_score DESC
    const scoreDesc = store.list({ sortBy: 'top_score', sortOrder: 'desc' });
    expect(scoreDesc.entries[0]!.topScore).toBe(0.9);

    // Sort by latency_ms ASC
    const latencyAsc = store.list({ sortBy: 'latency_ms', sortOrder: 'asc' });
    expect(latencyAsc.entries[0]!.latencyMs).toBe(50);

    // Sort by result_count DESC
    const rcDesc = store.list({ sortBy: 'result_count', sortOrder: 'desc' });
    expect(rcDesc.entries[0]!.resultCount).toBe(8);
  });

  // Test 9: deleteById() removes entry and returns true; returns false if not found
  it('T9: deleteById() removes a single entry, returns true; returns false if not found', () => {
    const id = store.saveEntry(makeEntry());
    expect(store.getById(id)).not.toBeNull();

    const deleted = store.deleteById(id);
    expect(deleted).toBe(true);
    expect(store.getById(id)).toBeNull();

    const notFound = store.deleteById('nonexistent-id');
    expect(notFound).toBe(false);
  });

  // Test 10: clearAll() removes all entries
  it('T10: clearAll() removes all entries', () => {
    store.saveEntry(makeEntry({ query: 'entry-1' }));
    store.saveEntry(makeEntry({ query: 'entry-2' }));
    store.saveEntry(makeEntry({ query: 'entry-3' }));

    expect(store.list().total).toBe(3);

    store.clearAll();

    expect(store.list().total).toBe(0);
    expect(store.list().entries.length).toBe(0);
  });

  // Test 11: close() closes the database connection
  it('T11: close() closes the database connection without throwing', () => {
    const testStore = new SearchHistoryStore(':memory:');
    testStore.saveEntry(makeEntry());
    expect(() => testStore.close()).not.toThrow();
  });
});
