import { Hono } from 'hono';
import type { BenchmarkRun } from '@ia-framework/benchmark';

interface BenchmarksDeps {
  benchmarkStore: {
    listRuns(limit?: number): BenchmarkRun[];
    getRunById(runId: string): BenchmarkRun | null;
  };
}

export function benchmarksRouter(deps: BenchmarksDeps): Hono {
  const app = new Hono();

  // GET /api/benchmarks
  app.get('/', (c) => {
    const limit = parseInt(c.req.query('limit') ?? '20', 10);
    const runs = deps.benchmarkStore.listRuns(isNaN(limit) ? 20 : limit);
    return c.json({ runs });
  });

  // GET /api/benchmarks/:runId
  app.get('/:runId', (c) => {
    const runId = c.req.param('runId');
    const run = deps.benchmarkStore.getRunById(runId);
    if (!run) {
      return c.json({ error: 'Run not found' }, 404);
    }
    return c.json(run);
  });

  return app;
}
