import { Hono } from 'hono';
import type {
  McpRequest,
  ListRequestsOptions,
  RequestsPage,
  RequestSummaryStats,
  DailyRequestStats,
  ToolRequestStats,
} from '@ia-framework/observability';

export interface RequestsStoreDep {
  getRequestById(id: string): McpRequest | null;
  listRequests(options: ListRequestsOptions): RequestsPage;
  getRequestStats(options?: { from?: string; to?: string }): RequestSummaryStats;
  getDailyRequestStats(options?: { from?: string; to?: string }): DailyRequestStats[];
  getToolRequestStats(): ToolRequestStats[];
}

interface RequestsDeps {
  requestsStore: RequestsStoreDep;
}

export function requestsRouter(deps: RequestsDeps): Hono {
  const app = new Hono();

  // GET /api/requests - List requests with pagination and filtering
  app.get('/', (c) => {
    const limit = Math.min(Math.max(parseInt(c.req.query('limit') ?? '50', 10) || 50, 1), 200);
    const offset = Math.max(parseInt(c.req.query('offset') ?? '0', 10) || 0, 0);
    const toolName = c.req.query('tool_name');
    const from = c.req.query('from');
    const to = c.req.query('to');

    const options: ListRequestsOptions = { limit, offset };
    if (toolName) options.toolName = toolName;
    if (from) options.from = from;
    if (to) options.to = to;

    const result = deps.requestsStore.listRequests(options);
    return c.json({ ...result, limit, offset });
  });

  // GET /api/requests/stats - Aggregated statistics
  app.get('/stats', (c) => {
    const from = c.req.query('from');
    const to = c.req.query('to');

    const dateRange: { from?: string; to?: string } = {};
    if (from) dateRange.from = from;
    if (to) dateRange.to = to;

    const summary = deps.requestsStore.getRequestStats(
      Object.keys(dateRange).length > 0 ? dateRange : undefined,
    );
    const byDay = deps.requestsStore.getDailyRequestStats(
      Object.keys(dateRange).length > 0 ? dateRange : undefined,
    );
    const byTool = deps.requestsStore.getToolRequestStats();

    return c.json({ summary, byDay, byTool });
  });

  // GET /api/requests/:id - Get single request with full response content
  app.get('/:id', (c) => {
    const id = c.req.param('id');
    const request = deps.requestsStore.getRequestById(id);

    if (!request) {
      return c.json({ error: 'Request not found' }, 404);
    }

    return c.json(request);
  });

  return app;
}
