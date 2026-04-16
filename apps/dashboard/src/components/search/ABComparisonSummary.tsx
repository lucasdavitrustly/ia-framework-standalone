import type { SearchMetrics } from '../../api/client.ts';

interface ABComparisonSummaryProps {
  astMetrics: SearchMetrics;
  llmMetrics: SearchMetrics;
  overlapCount: number;
}

export default function ABComparisonSummary({
  astMetrics,
  llmMetrics,
  overlapCount,
}: ABComparisonSummaryProps) {
  const latencyDelta = astMetrics.latencyMs - llmMetrics.latencyMs;
  const resultsDelta = astMetrics.resultsReturned - llmMetrics.resultsReturned;

  return (
    <div className="grid grid-cols-3 gap-4">
      <div className="bg-gray-900 rounded-xl border border-gray-800 p-4 text-center">
        <p className="text-xs text-gray-500 uppercase tracking-wider">Latency Δ</p>
        <p className="mt-1 text-lg font-semibold text-gray-100">
          {latencyDelta > 0 ? '+' : ''}
          {latencyDelta}ms
        </p>
        <p className="text-xs text-gray-500">
          AST: {astMetrics.latencyMs}ms · LLM: {llmMetrics.latencyMs}ms
        </p>
      </div>
      <div className="bg-gray-900 rounded-xl border border-gray-800 p-4 text-center">
        <p className="text-xs text-gray-500 uppercase tracking-wider">Results Δ</p>
        <p className="mt-1 text-lg font-semibold text-gray-100">
          {resultsDelta > 0 ? '+' : ''}
          {resultsDelta}
        </p>
        <p className="text-xs text-gray-500">
          AST: {astMetrics.resultsReturned} · LLM: {llmMetrics.resultsReturned}
        </p>
      </div>
      <div className="bg-gray-900 rounded-xl border border-gray-800 p-4 text-center">
        <p className="text-xs text-gray-500 uppercase tracking-wider">Shared Results</p>
        <p className="mt-1 text-lg font-semibold text-amber-400">{overlapCount}</p>
        <p className="text-xs text-gray-500">overlapping chunks</p>
      </div>
    </div>
  );
}
