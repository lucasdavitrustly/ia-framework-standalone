import { useState } from 'react';
import StatCard from '../StatCard.tsx';
import ScoreDistributionChart from './ScoreDistributionChart.tsx';
import type { SearchMetrics, SearchResult } from '../../api/client.ts';

interface MetricsPanelProps {
  metrics: SearchMetrics;
  results: SearchResult[];
}

export default function MetricsPanel({ metrics, results }: MetricsPanelProps) {
  const [collapsed, setCollapsed] = useState(false);

  return (
    <div className="mt-6 bg-gray-900 rounded-xl border border-gray-800">
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="w-full flex items-center justify-between px-5 py-3 text-sm font-semibold text-gray-400 hover:text-gray-200"
      >
        <span>Metrics</span>
        <span>{collapsed ? '▸' : '▾'}</span>
      </button>
      {!collapsed && (
        <div className="px-5 pb-5">
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4 mb-5">
            <StatCard label="Latency" value={`${metrics.latencyMs}ms`} />
            <StatCard label="Chunks Scanned" value={metrics.chunksScanned} />
            <StatCard label="Results" value={metrics.resultsReturned} />
            <StatCard
              label="Score Range"
              value={`${metrics.scoreRange.min.toFixed(3)}–${metrics.scoreRange.max.toFixed(3)}`}
              sub="RRF score"
              tooltip="Reciprocal Rank Fusion (RRF) score. When searching across multiple collections, results are re-ranked by the formula 1/(60+rank). Top results typically score 0.013–0.016 — not comparable to cosine similarity."
            />
          </div>
          <ScoreDistributionChart results={results} />
        </div>
      )}
    </div>
  );
}
