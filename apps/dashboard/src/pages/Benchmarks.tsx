import { useEffect, useState } from 'react';
import { DashboardClient } from '../api/client.ts';
import type { ApiBenchmarks } from '../api/client.ts';
import BenchmarkTrendChart from '../components/BenchmarkTrendChart.tsx';
import RunHistoryTable from '../components/RunHistoryTable.tsx';
import IndexingPanel from '../components/IndexingPanel.tsx';

export default function Benchmarks() {
  const [benchmarks, setBenchmarks] = useState<ApiBenchmarks | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    DashboardClient.getBenchmarks(50)
      .then(setBenchmarks)
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, []);

  const runs = benchmarks?.runs ?? [];

  return (
    <div className="p-8">
      <h2 className="text-xl font-semibold text-gray-100 mb-6">Benchmarks</h2>

      {/* Indexing control panel */}
      <div className="mb-6">
        <IndexingPanel />
      </div>

      {/* Score trend chart */}
      <div className="bg-gray-900 rounded-xl border border-gray-800 p-5 mb-6">
        <h3 className="text-sm font-medium text-gray-400 mb-4">Score Trend (MRR & Hit@K)</h3>
        {loading ? (
          <div className="h-72 bg-gray-800/50 rounded-lg animate-pulse" />
        ) : error ? (
          <p className="text-sm text-red-400 py-4">Failed to load benchmarks</p>
        ) : (
          <BenchmarkTrendChart runs={runs} />
        )}
      </div>

      {/* Run history table */}
      <div className="bg-gray-900 rounded-xl border border-gray-800 p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-medium text-gray-400">Run History</h3>
          <span className="text-xs text-gray-600">{runs.length} runs</span>
        </div>
        {loading ? (
          <div className="h-32 bg-gray-800/50 rounded-lg animate-pulse" />
        ) : (
          <RunHistoryTable runs={runs} />
        )}
      </div>
    </div>
  );
}
