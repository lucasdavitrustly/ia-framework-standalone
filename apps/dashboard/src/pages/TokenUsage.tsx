import { useEffect, useState } from 'react';
import { DashboardClient } from '../api/client.ts';
import type { ApiMetrics } from '../api/client.ts';
import DailyTokenChart from '../components/DailyTokenChart.tsx';
import QueryEventTable from '../components/QueryEventTable.tsx';

export default function TokenUsage() {
  const [metrics, setMetrics] = useState<ApiMetrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    DashboardClient.getMetrics()
      .then(setMetrics)
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="p-8">
      <h2 className="text-xl font-semibold text-gray-100 mb-6">Token Usage</h2>

      {/* Summary stats row */}
      {metrics && (
        <div className="grid grid-cols-3 gap-4 mb-6">
          <div className="bg-gray-900 rounded-xl border border-gray-800 p-4">
            <p className="text-xs text-gray-500 uppercase tracking-wider">Total Tokens</p>
            <p className="mt-1 text-xl font-bold text-gray-100">
              {metrics.totals.totalTokens.toLocaleString()}
            </p>
          </div>
          <div className="bg-gray-900 rounded-xl border border-gray-800 p-4">
            <p className="text-xs text-gray-500 uppercase tracking-wider">Total Queries</p>
            <p className="mt-1 text-xl font-bold text-gray-100">{metrics.totals.totalEvents}</p>
          </div>
          <div className="bg-gray-900 rounded-xl border border-gray-800 p-4">
            <p className="text-xs text-gray-500 uppercase tracking-wider">Avg Tokens/Query</p>
            <p className="mt-1 text-xl font-bold text-gray-100">
              {metrics.totals.avgTokensPerQuery.toLocaleString()}
            </p>
          </div>
        </div>
      )}

      {/* Daily chart */}
      <div className="bg-gray-900 rounded-xl border border-gray-800 p-5 mb-6">
        <h3 className="text-sm font-medium text-gray-400 mb-4">Daily Token Usage</h3>
        {loading ? (
          <div className="h-72 bg-gray-800/50 rounded-lg animate-pulse" />
        ) : error ? (
          <p className="text-sm text-red-400 py-4">Failed to load metrics</p>
        ) : (
          <DailyTokenChart data={metrics?.byDay ?? []} />
        )}
      </div>

      {/* Per-strategy breakdown */}
      {metrics && metrics.byStrategy.length > 0 && (
        <div className="bg-gray-900 rounded-xl border border-gray-800 p-5 mb-6">
          <h3 className="text-sm font-medium text-gray-400 mb-3">By Strategy</h3>
          <div className="space-y-2">
            {metrics.byStrategy.map(s => (
              <div key={s.strategy} className="flex justify-between items-center text-sm">
                <span className="px-2 py-0.5 rounded text-xs bg-indigo-900/50 text-indigo-300">
                  {s.strategy}
                </span>
                <span className="text-gray-400">
                  {s.totalQueries} queries · {s.totalTokens.toLocaleString()} tokens
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Per-query event log */}
      <div className="bg-gray-900 rounded-xl border border-gray-800 p-5">
        <h3 className="text-sm font-medium text-gray-400 mb-4">Query Event Log</h3>
        <QueryEventTable initialLimit={20} />
      </div>
    </div>
  );
}
