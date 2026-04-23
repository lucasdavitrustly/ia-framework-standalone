import { DashboardClient } from '../../api/client.ts';
import type { BenchmarkRun } from '../../api/client.ts';
import { useEffect, useState } from 'react';

interface Props {
  runId: string;
  onClose: () => void;
}

function Skeleton() {
  return <div className="h-64 bg-gray-800/50 rounded-lg animate-pulse" />;
}

export default function BenchmarkDetailPanel({ runId, onClose }: Props) {
  const [run, setRun] = useState<BenchmarkRun | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    DashboardClient.getBenchmarkRun(runId)
      .then((data) => {
        setRun(data);
        setLoading(false);
      })
      .catch((err: unknown) => {
        setError(String(err));
        setLoading(false);
      });
  }, [runId]);

  return (
    /* Overlay */
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60">
      <div className="w-full max-w-3xl max-h-[80vh] overflow-y-auto bg-gray-900 border border-gray-700 rounded-xl shadow-2xl m-4">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-800">
          <h3 className="text-sm font-semibold text-gray-200">Benchmark Run Detail</h3>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-300 transition-colors text-lg leading-none"
          >
            ✕
          </button>
        </div>

        <div className="p-5 space-y-5">
          {loading ? (
            <Skeleton />
          ) : error ? (
            <p className="text-sm text-red-400">Failed to load run: {error}</p>
          ) : run ? (
            <>
              {/* Run metadata */}
              <div className="grid grid-cols-2 gap-3">
                {[
                  ['Label', run.label ?? '—'],
                  ['Run ID', run.runId.slice(0, 12) + '…'],
                  ['Timestamp', new Date(run.timestamp).toLocaleString()],
                  ['Baseline', run.isBaseline ? 'Yes' : 'No'],
                  ['MRR', `${(run.mrr * 100).toFixed(1)}%`],
                  ['Hit@K', `${(run.hitAtK * 100).toFixed(1)}%`],
                  ['Avg Latency', `${run.avgLatencyMs.toFixed(0)} ms`],
                ].map(([key, val]) => (
                  <div key={key} className="bg-gray-800/60 rounded-lg px-3 py-2">
                    <p className="text-xs text-gray-500 uppercase tracking-wide">{key}</p>
                    <p className="text-sm text-gray-200 mt-0.5 font-mono break-all">{val}</p>
                  </div>
                ))}
              </div>

              {/* Config snapshot */}
              <div>
                <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">
                  Config Snapshot
                </h4>
                <div className="grid grid-cols-2 gap-3">
                  {[
                    ['Embedding Provider', run.configSnapshot.embeddingProvider],
                    ['Embedding Model', run.configSnapshot.embeddingModel],
                    ['Collection', run.configSnapshot.collectionName],
                    ['Top K', String(run.configSnapshot.topK)],
                    ['Score Threshold', String(run.configSnapshot.scoreThreshold)],
                  ].map(([key, val]) => (
                    <div key={key} className="bg-gray-800/60 rounded-lg px-3 py-2">
                      <p className="text-xs text-gray-500 uppercase tracking-wide">{key}</p>
                      <p className="text-sm text-gray-200 mt-0.5 font-mono break-all">{val}</p>
                    </div>
                  ))}
                </div>
              </div>

              {/* Per-query results */}
              {run.queries.length > 0 && (
                <div>
                  <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">
                    Per-Query Results ({run.queries.length})
                  </h4>
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs text-left">
                      <thead>
                        <tr className="border-b border-gray-800">
                          <th className="py-2 pr-4 text-gray-500 font-medium">Query</th>
                          <th className="py-2 pr-4 text-gray-500 font-medium">Hit</th>
                          <th className="py-2 pr-4 text-gray-500 font-medium">Rank</th>
                          <th className="py-2 pr-4 text-gray-500 font-medium">RR</th>
                          <th className="py-2 text-gray-500 font-medium">Latency</th>
                        </tr>
                      </thead>
                      <tbody>
                        {run.queries.map((q) => (
                          <tr key={q.queryId} className="border-b border-gray-800/50">
                            <td className="py-2 pr-4 text-gray-300 max-w-xs truncate">{q.query}</td>
                            <td className="py-2 pr-4">
                              <span
                                className={`font-semibold ${q.hit ? 'text-green-400' : 'text-red-400'}`}
                              >
                                {q.hit ? '✓' : '✗'}
                              </span>
                            </td>
                            <td className="py-2 pr-4 text-gray-400">{q.rank}</td>
                            <td className="py-2 pr-4 text-gray-400">
                              {q.reciprocalRank.toFixed(2)}
                            </td>
                            <td className="py-2 text-gray-400">{q.latencyMs.toFixed(0)} ms</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}
