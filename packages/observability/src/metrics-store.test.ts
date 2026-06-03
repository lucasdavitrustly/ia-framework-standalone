import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { MetricsStore } from './metrics-store.js';
import type { RagEvent, ModuleGraphJSON, McpRequest } from './types.js';

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

    it('enables WAL journal mode for cross-process visibility', () => {
      const tmpDir = mkdtempSync(join(tmpdir(), 'metrics-wal-'));
      const dbPath = join(tmpDir, 'wal-test.sqlite');
      store = new MetricsStore(dbPath);
      const result = (store as unknown as { db: { pragma(s: string): unknown } }).db.pragma(
        'journal_mode',
      );
      expect(result).toEqual([{ journal_mode: 'wal' }]);
      store.close();
      rmSync(tmpDir, { recursive: true });
      store = new MetricsStore(':memory:'); // reset for afterEach
    });

    it('two instances on same file see each others writes (WAL cross-process simulation)', () => {
      const tmpDir = mkdtempSync(join(tmpdir(), 'metrics-test-'));
      const dbPath = join(tmpDir, 'test.sqlite');
      const writer = new MetricsStore(dbPath);
      const reader = new MetricsStore(dbPath);

      // Writer logs a request
      writer.logRequest({
        id: 'req-1',
        sessionId: 'sess-1',
        toolName: 'search_codebase',
        inputParams: { query: 'hello' },
        responseContent: 'result',
        inputTokens: 10,
        outputTokens: 20,
        durationMs: 100,
        timestamp: new Date().toISOString(),
        isTruncated: false,
      });

      // Reader should see it immediately
      const stats = reader.getRequestStats();
      expect(stats.totalRequests).toBe(1);
      expect(stats.totalInputTokens).toBe(10);

      writer.close();
      reader.close();
      rmSync(tmpDir, { recursive: true });
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
      store.logEvent(
        makeEvent({ sessionId: 'session-A', tokenCount: 100, chunksRetrieved: 3, latencyMs: 50 }),
      );
      store.logEvent(
        makeEvent({ sessionId: 'session-A', tokenCount: 200, chunksRetrieved: 5, latencyMs: 100 }),
      );

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

      const mcp = stats.find((s) => s.strategy === 'mcp');
      expect(mcp).toBeDefined();
      expect(mcp!.totalQueries).toBe(2);
      expect(mcp!.totalTokens).toBe(300);
      expect(mcp!.avgTokensPerQuery).toBe(150);

      const autoCtx = stats.find((s) => s.strategy === 'auto-context');
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
      store.logEvent(makeEvent({ tokenCount: 50, timestamp: '2026-04-02T09:00:00Z' }));

      const days = store.getEventsByDay();
      expect(days).toHaveLength(2);

      const day1 = days.find((d) => d.date === '2026-04-01');
      expect(day1).toBeDefined();
      expect(day1!.totalTokens).toBe(300);
      expect(day1!.totalQueries).toBe(2);

      const day2 = days.find((d) => d.date === '2026-04-02');
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

  describe('module_graph persistence', () => {
    const sampleGraph: ModuleGraphJSON = {
      version: 1,
      modules: {
        'com.app:core': {
          coordinate: { groupId: 'com.app', artifactId: 'core', version: '1.0' },
          dependencies: [],
          interfaces: [],
          dtos: [],
          pomPath: 'core/pom.xml',
          sourceRoot: 'core/src/main/java',
        },
        'com.app:web': {
          coordinate: { groupId: 'com.app', artifactId: 'web', version: '1.0' },
          dependencies: ['com.app:core'],
          interfaces: [],
          dtos: [],
          pomPath: 'web/pom.xml',
          sourceRoot: 'web/src/main/java',
        },
      },
    };

    it('saveModuleGraph() stores and getModuleGraph() retrieves', () => {
      store = new MetricsStore(':memory:');
      store.saveModuleGraph('/projects/my-app', sampleGraph);
      const result = store.getModuleGraph('/projects/my-app');
      expect(result).toEqual(sampleGraph);
    });

    it('saveModuleGraph() with same projectRoot overwrites (upsert)', () => {
      store = new MetricsStore(':memory:');
      store.saveModuleGraph('/projects/my-app', sampleGraph);

      const updated: ModuleGraphJSON = { version: 1, modules: {} };
      store.saveModuleGraph('/projects/my-app', updated);

      const result = store.getModuleGraph('/projects/my-app');
      expect(result).toEqual(updated);
    });

    it('getModuleGraph() returns null for unknown project', () => {
      store = new MetricsStore(':memory:');
      const result = store.getModuleGraph('/nonexistent');
      expect(result).toBeNull();
    });
  });

  describe('MCP Requests', () => {
    function makeRequest(overrides: Partial<McpRequest> = {}): McpRequest {
      return {
        id: crypto.randomUUID(),
        sessionId: 'session-1',
        toolName: 'search_codebase',
        inputParams: { query: 'auth middleware', limit: 10 },
        responseContent: 'Found 3 results...',
        inputTokens: 50,
        outputTokens: 200,
        durationMs: 150,
        timestamp: new Date().toISOString(),
        isTruncated: false,
        ...overrides,
      };
    }

    describe('logRequest()', () => {
      it('stores a request retrievable by ID', () => {
        store = new MetricsStore(':memory:');
        const req = makeRequest();
        store.logRequest(req);
        const result = store.getRequestById(req.id);
        expect(result).toEqual(req);
      });

      it('stores multiple requests', () => {
        store = new MetricsStore(':memory:');
        store.logRequest(makeRequest());
        store.logRequest(makeRequest());
        const page = store.listRequests({ limit: 10, offset: 0 });
        expect(page.total).toBe(2);
      });
    });

    describe('getRequestById()', () => {
      it('returns null for unknown ID', () => {
        store = new MetricsStore(':memory:');
        expect(store.getRequestById('nonexistent')).toBeNull();
      });

      it('returns full response content', () => {
        store = new MetricsStore(':memory:');
        const req = makeRequest({ responseContent: 'full content here' });
        store.logRequest(req);
        const result = store.getRequestById(req.id);
        expect(result!.responseContent).toBe('full content here');
      });
    });

    describe('listRequests()', () => {
      it('returns paginated results without response content', () => {
        store = new MetricsStore(':memory:');
        for (let i = 0; i < 5; i++) {
          store.logRequest(makeRequest());
        }
        const page = store.listRequests({ limit: 2, offset: 0 });
        expect(page.items).toHaveLength(2);
        expect(page.total).toBe(5);
        // Items should not have responseContent
        expect((page.items[0] as unknown as McpRequest).responseContent).toBeUndefined();
      });

      it('filters by tool name', () => {
        store = new MetricsStore(':memory:');
        store.logRequest(makeRequest({ toolName: 'search_codebase' }));
        store.logRequest(makeRequest({ toolName: 'get_file' }));
        store.logRequest(makeRequest({ toolName: 'search_codebase' }));
        const page = store.listRequests({ limit: 10, offset: 0, toolName: 'get_file' });
        expect(page.total).toBe(1);
        expect(page.items[0]!.toolName).toBe('get_file');
      });

      it('filters by date range', () => {
        store = new MetricsStore(':memory:');
        store.logRequest(makeRequest({ timestamp: '2026-06-01T10:00:00.000Z' }));
        store.logRequest(makeRequest({ timestamp: '2026-06-02T10:00:00.000Z' }));
        store.logRequest(makeRequest({ timestamp: '2026-06-03T10:00:00.000Z' }));
        const page = store.listRequests({
          limit: 10,
          offset: 0,
          from: '2026-06-02T00:00:00.000Z',
          to: '2026-06-02T23:59:59.999Z',
        });
        expect(page.total).toBe(1);
      });
    });

    describe('getRequestStats()', () => {
      it('returns zero stats when no requests', () => {
        store = new MetricsStore(':memory:');
        const stats = store.getRequestStats();
        expect(stats.totalRequests).toBe(0);
        expect(stats.totalInputTokens).toBe(0);
        expect(stats.totalOutputTokens).toBe(0);
      });

      it('returns correct aggregated stats', () => {
        store = new MetricsStore(':memory:');
        store.logRequest(makeRequest({ inputTokens: 100, outputTokens: 500, durationMs: 200 }));
        store.logRequest(makeRequest({ inputTokens: 50, outputTokens: 300, durationMs: 100 }));
        const stats = store.getRequestStats();
        expect(stats.totalRequests).toBe(2);
        expect(stats.totalInputTokens).toBe(150);
        expect(stats.totalOutputTokens).toBe(800);
        expect(stats.avgDurationMs).toBe(150);
      });
    });

    describe('getDailyRequestStats()', () => {
      it('groups by day', () => {
        store = new MetricsStore(':memory:');
        store.logRequest(
          makeRequest({
            timestamp: '2026-06-01T10:00:00.000Z',
            inputTokens: 10,
            outputTokens: 100,
          }),
        );
        store.logRequest(
          makeRequest({
            timestamp: '2026-06-01T14:00:00.000Z',
            inputTokens: 20,
            outputTokens: 200,
          }),
        );
        store.logRequest(
          makeRequest({
            timestamp: '2026-06-02T10:00:00.000Z',
            inputTokens: 30,
            outputTokens: 300,
          }),
        );
        const daily = store.getDailyRequestStats();
        expect(daily).toHaveLength(2);
        expect(daily[0]!.date).toBe('2026-06-01');
        expect(daily[0]!.requestCount).toBe(2);
        expect(daily[0]!.totalInputTokens).toBe(30);
        expect(daily[1]!.date).toBe('2026-06-02');
        expect(daily[1]!.requestCount).toBe(1);
      });
    });

    describe('getToolRequestStats()', () => {
      it('groups by tool', () => {
        store = new MetricsStore(':memory:');
        store.logRequest(makeRequest({ toolName: 'search_codebase' }));
        store.logRequest(makeRequest({ toolName: 'search_codebase' }));
        store.logRequest(makeRequest({ toolName: 'get_file' }));
        const byTool = store.getToolRequestStats();
        expect(byTool).toHaveLength(2);
        expect(byTool[0]!.toolName).toBe('search_codebase');
        expect(byTool[0]!.requestCount).toBe(2);
        expect(byTool[1]!.toolName).toBe('get_file');
        expect(byTool[1]!.requestCount).toBe(1);
      });
    });
  });
});
