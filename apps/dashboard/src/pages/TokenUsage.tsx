import { useEffect, useRef, useState } from 'react';
import { DashboardClient } from '../api/client.ts';
import type { McpRequestsStatsResponse } from '../api/client.ts';
import McpDailyChart from '../components/McpDailyChart.tsx';
import McpRequestTable from '../components/McpRequestTable.tsx';

const POLL_INTERVAL_MS = 30_000;

export default function TokenUsage() {
  const [stats, setStats] = useState<McpRequestsStatsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const fetchingRef = useRef(false);

  useEffect(() => {
    let cancelled = false;

    const fetchStats = () => {
      if (fetchingRef.current) return;
      fetchingRef.current = true;
      DashboardClient.getMcpRequestsStats()
        .then((data) => {
          if (!cancelled) {
            setStats(data);
            setRefreshKey((k) => k + 1);
          }
        })
        .catch(() => {
          // Only show error on initial load; polling failures keep last data
          if (!cancelled && stats === null) setError(true);
        })
        .finally(() => {
          fetchingRef.current = false;
          if (!cancelled) setLoading(false);
        });
    };

    fetchStats();
    const interval = setInterval(fetchStats, POLL_INTERVAL_MS);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
    // Mount-only: the polling interval is self-contained and must not be
    // re-created on every render. The dependency array is deliberately empty.
  }, []);

  return (
    <div className="p-8">
      <h2 className="text-xl font-semibold text-gray-100 mb-6">MCP Token Usage</h2>

      {/* Summary stats row */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <div className="bg-gray-900 rounded-xl border border-gray-800 p-4">
            <p className="text-xs text-gray-500 uppercase tracking-wider">Total Requests</p>
            <p className="mt-1 text-xl font-bold text-gray-100">
              {stats.summary.totalRequests.toLocaleString()}
            </p>
          </div>
          <div className="bg-gray-900 rounded-xl border border-gray-800 p-4">
            <p className="text-xs text-gray-500 uppercase tracking-wider">Input Tokens</p>
            <p className="mt-1 text-xl font-bold text-gray-100">
              {stats.summary.totalInputTokens.toLocaleString()}
            </p>
          </div>
          <div className="bg-gray-900 rounded-xl border border-gray-800 p-4">
            <p className="text-xs text-gray-500 uppercase tracking-wider">Output Tokens</p>
            <p className="mt-1 text-xl font-bold text-gray-100">
              {stats.summary.totalOutputTokens.toLocaleString()}
            </p>
          </div>
          <div className="bg-gray-900 rounded-xl border border-gray-800 p-4">
            <p className="text-xs text-gray-500 uppercase tracking-wider">Avg Duration</p>
            <p className="mt-1 text-xl font-bold text-gray-100">
              {Math.round(stats.summary.avgDurationMs)}ms
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
          <p className="text-sm text-red-400 py-4">Failed to load MCP request stats</p>
        ) : (
          <McpDailyChart data={stats?.byDay ?? []} />
        )}
      </div>

      {/* By-tool breakdown */}
      {stats && stats.byTool.length > 0 && (
        <div className="bg-gray-900 rounded-xl border border-gray-800 p-5 mb-6">
          <h3 className="text-sm font-medium text-gray-400 mb-3">By Tool</h3>
          <div className="space-y-2">
            {stats.byTool.map((t) => (
              <div key={t.toolName} className="flex justify-between items-center text-sm">
                <span className="px-2 py-0.5 rounded text-xs bg-indigo-900/50 text-indigo-300">
                  {t.toolName}
                </span>
                <span className="text-gray-400">
                  {t.requestCount} requests · {t.totalInputTokens.toLocaleString()} in ·{' '}
                  {t.totalOutputTokens.toLocaleString()} out · avg {Math.round(t.avgDurationMs)}ms
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Request log table */}
      <div className="bg-gray-900 rounded-xl border border-gray-800 p-5">
        <h3 className="text-sm font-medium text-gray-400 mb-4">Request Log</h3>
        <McpRequestTable tools={stats?.byTool ?? []} initialLimit={20} refreshKey={refreshKey} />
      </div>
    </div>
  );
}
