/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect } from 'vitest';
import { Hono } from 'hono';
import { requestsRouter, type RequestsStoreDep } from './requests.js';
import type {
  McpRequest,
  RequestsPage,
  RequestSummaryStats,
  DailyRequestStats,
  ToolRequestStats,
} from '@ia-framework/observability';

function makeRequest(overrides: Partial<McpRequest> = {}): McpRequest {
  return {
    id: crypto.randomUUID(),
    sessionId: 'session-1',
    toolName: 'search_codebase',
    inputParams: { query: 'auth' },
    responseContent: 'Found results',
    inputTokens: 50,
    outputTokens: 200,
    durationMs: 150,
    timestamp: '2026-06-03T10:00:00.000Z',
    isTruncated: false,
    ...overrides,
  };
}

function makeStore(requests: McpRequest[] = []): RequestsStoreDep {
  return {
    getRequestById(id: string) {
      return requests.find((r) => r.id === id) ?? null;
    },
    listRequests(options) {
      let filtered = [...requests];
      if (options.toolName) filtered = filtered.filter((r) => r.toolName === options.toolName);
      if (options.from) filtered = filtered.filter((r) => r.timestamp >= options.from!);
      if (options.to) filtered = filtered.filter((r) => r.timestamp <= options.to!);
      const items = filtered
        .slice(options.offset, options.offset + options.limit)
        .map(({ responseContent, ...rest }) => rest);
      return { items, total: filtered.length } as RequestsPage;
    },
    getRequestStats(): RequestSummaryStats {
      return {
        totalRequests: requests.length,
        totalInputTokens: 100,
        totalOutputTokens: 500,
        avgDurationMs: 150,
        requestsToday: 1,
      };
    },
    getDailyRequestStats(): DailyRequestStats[] {
      return [
        {
          date: '2026-06-03',
          requestCount: requests.length,
          totalInputTokens: 100,
          totalOutputTokens: 500,
          avgDurationMs: 150,
        },
      ];
    },
    getToolRequestStats(): ToolRequestStats[] {
      return [
        {
          toolName: 'search_codebase',
          requestCount: requests.length,
          totalInputTokens: 100,
          totalOutputTokens: 500,
          avgDurationMs: 150,
        },
      ];
    },
  };
}

function createTestApp(store: RequestsStoreDep) {
  const app = new Hono();
  app.route('/api/requests', requestsRouter({ requestsStore: store }));
  return app;
}

describe('requestsRouter', () => {
  describe('GET /api/requests', () => {
    it('returns paginated list', async () => {
      const reqs = [makeRequest(), makeRequest()];
      const app = createTestApp(makeStore(reqs));
      const res = await app.request('/api/requests');
      expect(res.status).toBe(200);
      const body = (await res.json()) as any as any;
      expect(body.total).toBe(2);
      expect(body.items).toHaveLength(2);
      expect(body.limit).toBe(50);
      expect(body.offset).toBe(0);
    });

    it('respects limit and offset params', async () => {
      const reqs = [makeRequest(), makeRequest(), makeRequest()];
      const app = createTestApp(makeStore(reqs));
      const res = await app.request('/api/requests?limit=1&offset=1');
      const body = (await res.json()) as any;
      expect(body.items).toHaveLength(1);
      expect(body.limit).toBe(1);
      expect(body.offset).toBe(1);
    });

    it('filters by tool_name', async () => {
      const reqs = [
        makeRequest({ toolName: 'get_file' }),
        makeRequest({ toolName: 'search_codebase' }),
      ];
      const app = createTestApp(makeStore(reqs));
      const res = await app.request('/api/requests?tool_name=get_file');
      const body = (await res.json()) as any;
      expect(body.total).toBe(1);
      expect(body.items[0].toolName).toBe('get_file');
    });
  });

  describe('GET /api/requests/:id', () => {
    it('returns full request with response content', async () => {
      const req = makeRequest({ responseContent: 'full response here' });
      const app = createTestApp(makeStore([req]));
      const res = await app.request(`/api/requests/${req.id}`);
      expect(res.status).toBe(200);
      const body = (await res.json()) as any;
      expect(body.responseContent).toBe('full response here');
      expect(body.id).toBe(req.id);
    });

    it('returns 404 for unknown ID', async () => {
      const app = createTestApp(makeStore([]));
      const res = await app.request('/api/requests/nonexistent');
      expect(res.status).toBe(404);
      const body = (await res.json()) as any;
      expect(body.error).toBe('Request not found');
    });
  });

  describe('GET /api/requests/stats', () => {
    it('returns summary, byDay, and byTool stats', async () => {
      const app = createTestApp(makeStore([makeRequest()]));
      const res = await app.request('/api/requests/stats');
      expect(res.status).toBe(200);
      const body = (await res.json()) as any;
      expect(body.summary.totalRequests).toBe(1);
      expect(body.byDay).toHaveLength(1);
      expect(body.byTool).toHaveLength(1);
    });
  });
});
