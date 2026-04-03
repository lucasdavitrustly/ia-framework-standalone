import { Hono } from 'hono';
import type { TotalStats, StrategyStats, DailyTokenUsage, EventsPage } from '@ia-framework/observability';

interface MetricsDeps {
  metricsStore: {
    getTotalStats(): TotalStats;
    getStrategyStats(): StrategyStats[];
    getEventsByDay(): DailyTokenUsage[];
    listEvents(limit: number, offset: number): EventsPage;
  };
}

export function metricsRouter(deps: MetricsDeps): Hono {
  const app = new Hono();

  // GET /api/metrics
  app.get('/', (c) => {
    const totals = deps.metricsStore.getTotalStats();
    const byStrategy = deps.metricsStore.getStrategyStats();
    const byDay = deps.metricsStore.getEventsByDay();

    return c.json({ totals, byStrategy, byDay });
  });

  // GET /api/metrics/events
  app.get('/events', (c) => {
    const limit = parseInt(c.req.query('limit') ?? '50', 10);
    const offset = parseInt(c.req.query('offset') ?? '0', 10);

    const result = deps.metricsStore.listEvents(
      isNaN(limit) ? 50 : limit,
      isNaN(offset) ? 0 : offset,
    );

    return c.json(result);
  });

  return app;
}
