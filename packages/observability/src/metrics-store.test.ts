import { describe, it, expect, afterEach } from 'vitest';
import { MetricsStore } from './metrics-store.js';
import type { RagEvent } from './types.js';

function makeEvent(overrides: Partial<RagEvent> = {}): RagEvent {
  return {
    id: crypto.randomUUID(),
    sessionId: 'session-1',
    query: 'find auth middleware',
    chunksRetrieved: 3,
    chunkIds: ['chunk-a', 'chunk-b', 'chunk-c'],
    tokenCount: 100,
    strategy: 'mcp',
    timestamp: new Date().toISOString(),
    latencyMs: 42,
    ...overrides,
  };
}

describe('MetricsStore', () => {
  let store: MetricsStore;

  afterEach(() => {
    store.close();
  });

  describe('constructor + initialize()', () => {
    it('creates an in-memory database without error', () => {
      store = new MetricsStore(':memory:');
      expect(store).toBeInstanceOf(MetricsStore);
    });
  });

  describe('logEvent()', () => {
    it('stores an event retrievable via getTotalStats', () => {
      store = new MetricsStore(':memory:');
      store.logEvent(makeEvent({ tokenCount: 50 }));
      const stats = store.getTotalStats();
      expect(stats.totalEvents).toBe(1);
      expect(stats.totalTokens).toBe(50);
    });

    it('stores multiple events', () => {
      store = new MetricsStore(':memory:');
      store.logEvent(makeEvent({ tokenCount: 100 }));
      store.logEvent(makeEvent({ tokenCount: 200 }));
      const stats = store.getTotalStats();
      expect(stats.totalEvents).toBe(2);
      expect(stats.totalTokens).toBe(300);
    });
  });

  describe('getSessionStats()', () => {
    it('returns null for unknown session', () => {
      store = new MetricsStore(':memory:');
      const result = store.getSessionStats('nonexistent-session');
      expect(result).toBeNull();
    });

    it('returns correct stats for a session', () => {
      store = new MetricsStore(':memory:');
      store.logEvent(makeEvent({ sessionId: 'session-A', tokenCount: 100, chunksRetrieved: 3, latencyMs: 50 }));
      store.logEvent(makeEvent({ sessionId: 'session-A', tokenCount: 200, chunksRetrieved: 5, latencyMs: 100 }));

      const stats = store.getSessionStats('session-A');
      expect(stats).not.toBeNull();
      expect(stats!.sessionId).toBe('session-A');
      expect(stats!.totalQueries).toBe(2);
      expect(stats!.totalTokens).toBe(300);
      expect(stats!.totalChunks).toBe(8);
      expect(stats!.avgLatencyMs).toBe(75);
    });

    it('does not return data from other sessions', () => {
      store = new MetricsStore(':memory:');
      store.logEvent(makeEvent({ sessionId: 'session-A', tokenCount: 100 }));
      store.logEvent(makeEvent({ sessionId: 'session-B', tokenCount: 200 }));

      const statsA = store.getSessionStats('session-A');
      expect(statsA!.totalQueries).toBe(1);
      expect(statsA!.totalTokens).toBe(100);
    });
  });

  describe('getStrategyStats()', () => {
    it('returns empty array when no events', () => {
      store = new MetricsStore(':memory:');
      expect(store.getStrategyStats()).toEqual([]);
    });

    it('groups events by strategy', () => {
      store = new MetricsStore(':memory:');
      store.logEvent(makeEvent({ strategy: 'mcp', tokenCount: 100 }));
      store.logEvent(makeEvent({ strategy: 'mcp', tokenCount: 200 }));
      store.logEvent(makeEvent({ strategy: 'auto-context', tokenCount: 300 }));

      const stats = store.getStrategyStats();
      expect(stats).toHaveLength(2);

      const mcp = stats.find(s => s.strategy === 'mcp');
      expect(mcp).toBeDefined();
      expect(mcp!.totalQueries).toBe(2);
      expect(mcp!.totalTokens).toBe(300);
      expect(mcp!.avgTokensPerQuery).toBe(150);

      const autoCtx = stats.find(s => s.strategy === 'auto-context');
      expect(autoCtx).toBeDefined();
      expect(autoCtx!.totalQueries).toBe(1);
      expect(autoCtx!.totalTokens).toBe(300);
    });
  });

  describe('getTotalStats()', () => {
    it('returns zeros when no events', () => {
      store = new MetricsStore(':memory:');
      const stats = store.getTotalStats();
      expect(stats.totalEvents).toBe(0);
      expect(stats.totalTokens).toBe(0);
      expect(stats.totalSessions).toBe(0);
      expect(stats.avgTokensPerQuery).toBe(0);
    });

    it('counts distinct sessions', () => {
      store = new MetricsStore(':memory:');
      store.logEvent(makeEvent({ sessionId: 'session-A' }));
      store.logEvent(makeEvent({ sessionId: 'session-A' }));
      store.logEvent(makeEvent({ sessionId: 'session-B' }));

      const stats = store.getTotalStats();
      expect(stats.totalSessions).toBe(2);
      expect(stats.totalEvents).toBe(3);
    });

    it('calculates average tokens per query', () => {
      store = new MetricsStore(':memory:');
      store.logEvent(makeEvent({ tokenCount: 100 }));
      store.logEvent(makeEvent({ tokenCount: 200 }));

      const stats = store.getTotalStats();
      expect(stats.avgTokensPerQuery).toBe(150);
    });
  });

  describe('getEventsByDay()', () => {
    it('returns empty array when no events', () => {
      store = new MetricsStore(':memory:');
      expect(store.getEventsByDay()).toEqual([]);
    });

    it('groups token counts by day', () => {
      store = new MetricsStore(':memory:');
      store.logEvent(makeEvent({ tokenCount: 100, timestamp: '2026-04-01T10:00:00Z' }));
      store.logEvent(makeEvent({ tokenCount: 200, timestamp: '2026-04-01T18:00:00Z' }));
      store.logEvent(makeEvent({ tokenCount: 50,  timestamp: '2026-04-02T09:00:00Z' }));

      const days = store.getEventsByDay();
      expect(days).toHaveLength(2);

      const day1 = days.find(d => d.date === '2026-04-01');
      expect(day1).toBeDefined();
      expect(day1!.totalTokens).toBe(300);
      expect(day1!.totalQueries).toBe(2);

      const day2 = days.find(d => d.date === '2026-04-02');
      expect(day2).toBeDefined();
      expect(day2!.totalTokens).toBe(50);
      expect(day2!.totalQueries).toBe(1);
    });
  });

  describe('listEvents()', () => {
    it('returns empty page when no events', () => {
      store = new MetricsStore(':memory:');
      const page = store.listEvents(10, 0);
      expect(page.events).toEqual([]);
      expect(page.total).toBe(0);
    });

    it('returns paginated events ordered by timestamp DESC', () => {
      store = new MetricsStore(':memory:');
      store.logEvent(makeEvent({ tokenCount: 100, timestamp: '2026-04-01T08:00:00Z' }));
      store.logEvent(makeEvent({ tokenCount: 200, timestamp: '2026-04-01T10:00:00Z' }));
      store.logEvent(makeEvent({ tokenCount: 300, timestamp: '2026-04-01T12:00:00Z' }));

      const page = store.listEvents(2, 0);
      expect(page.total).toBe(3);
      expect(page.events).toHaveLength(2);
      // Newest first
      expect(page.events[0]!.tokenCount).toBe(300);
      expect(page.events[1]!.tokenCount).toBe(200);
    });

    it('respects offset for pagination', () => {
      store = new MetricsStore(':memory:');
      store.logEvent(makeEvent({ tokenCount: 100, timestamp: '2026-04-01T08:00:00Z' }));
      store.logEvent(makeEvent({ tokenCount: 200, timestamp: '2026-04-01T10:00:00Z' }));
      store.logEvent(makeEvent({ tokenCount: 300, timestamp: '2026-04-01T12:00:00Z' }));

      const page = store.listEvents(2, 2);
      expect(page.total).toBe(3);
      expect(page.events).toHaveLength(1);
      expect(page.events[0]!.tokenCount).toBe(100);
    });

    it('round-trips event fields correctly', () => {
      store = new MetricsStore(':memory:');
      const original = makeEvent({
        sessionId: 'sess-xyz',
        query: 'find user auth',
        chunksRetrieved: 5,
        chunkIds: ['a', 'b', 'c'],
        tokenCount: 123,
        strategy: 'auto-context',
        latencyMs: 77,
      });
      store.logEvent(original);

      const page = store.listEvents(10, 0);
      expect(page.events).toHaveLength(1);
      const evt = page.events[0]!;
      expect(evt.sessionId).toBe('sess-xyz');
      expect(evt.query).toBe('find user auth');
      expect(evt.chunksRetrieved).toBe(5);
      expect(evt.chunkIds).toEqual(['a', 'b', 'c']);
      expect(evt.tokenCount).toBe(123);
      expect(evt.strategy).toBe('auto-context');
      expect(evt.latencyMs).toBe(77);
    });
  });

  describe('close()', () => {
    it('closes the database without error', () => {
      store = new MetricsStore(':memory:');
      expect(() => store.close()).not.toThrow();
    });
  });
});
