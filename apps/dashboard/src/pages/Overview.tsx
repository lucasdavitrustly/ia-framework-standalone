import { useEffect, useState } from 'react';
import StatCard from '../components/StatCard.tsx';
import { DashboardClient } from '../api/client.ts';
import type { ApiStatus, ApiMetrics, ApiBenchmarks } from '../api/client.ts';

export default function Overview() {
  const [status, setStatus] = useState<ApiStatus | null>(null);
  const [metrics, setMetrics] = useState<ApiMetrics | null>(null);
  const [benchmarks, setBenchmarks] = useState<ApiBenchmarks | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    Promise.all([
      DashboardClient.getStatus(),
      DashboardClient.getMetrics(),
      DashboardClient.getBenchmarks(1),
    ])
      .then(([s, m, b]) => {
        setStatus(s);
        setMetrics(m);
        setBenchmarks(b);
      })
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, []);

  const lastMrr = benchmarks?.runs[0]?.mrr;
  const qdrantOk = status?.qdrant === 'ok';

  return (
    <div className="p-8">
      <h2 className="text-xl font-semibold text-gray-100 mb-6">Overview</h2>

      {/* Qdrant health banner */}
      {!loading && !qdrantOk && (
        <div className="mb-4 p-3 bg-red-900/40 border border-red-700 rounded-lg text-sm text-red-300">
          Qdrant is unreachable — check that Docker is running
        </div>
      )}

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard
          label="Total Tokens"
          value={metrics ? metrics.totals.totalTokens.toLocaleString() : 0}
          sub="all sessions"
          loading={loading}
          error={error}
        />
        <StatCard
          label="Total Queries"
          value={metrics ? metrics.totals.totalEvents : 0}
          sub={`${metrics?.totals.totalSessions ?? 0} sessions`}
          loading={loading}
          error={error}
        />
        <StatCard
          label="Avg Tokens/Query"
          value={metrics ? metrics.totals.avgTokensPerQuery : 0}
          loading={loading}
          error={error}
        />
        <StatCard
          label="Best Benchmark MRR"
          value={lastMrr !== undefined ? lastMrr.toFixed(3) : '—'}
          sub={benchmarks?.runs[0]?.label ?? ''}
          loading={loading}
          error={error}
        />
      </div>

      {/* Indexing status indicator */}
      {status && (
        <div className="mt-8 p-4 bg-gray-900 rounded-xl border border-gray-800">
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-2">Indexing</p>
          <div className="flex items-center gap-2">
            <span
              className={`inline-block w-2 h-2 rounded-full ${
                status.indexingInProgress ? 'bg-yellow-400 animate-pulse' : 'bg-green-500'
              }`}
            />
            <span className="text-sm text-gray-300">
              {status.indexingInProgress ? 'In progress' : 'Idle'}
            </span>
            {status.lastIndexedCommit && (
              <span className="text-xs text-gray-500 ml-auto">
                Last commit: {status.lastIndexedCommit.slice(0, 8)}
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
