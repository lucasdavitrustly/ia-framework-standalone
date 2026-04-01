import { useEffect, useState } from 'react';
import { DashboardClient } from '../api/client.ts';
import type { RagEvent } from '../api/client.ts';

interface Props {
  initialLimit?: number;
}

export default function QueryEventTable({ initialLimit = 20 }: Props) {
  const [events, setEvents] = useState<RagEvent[]>([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const limit = initialLimit;

  useEffect(() => {
    setLoading(true);
    DashboardClient.getMetricsEvents({ limit, offset })
      .then(res => {
        setEvents(res.events);
        setTotal(res.total);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [offset, limit]);

  if (loading) return <div className="h-24 bg-gray-800/50 rounded-lg animate-pulse" />;

  if (events.length === 0) {
    return <p className="text-sm text-gray-600 py-4">No queries recorded yet</p>;
  }

  return (
    <div>
      <div className="overflow-x-auto rounded-lg border border-gray-800">
        <table className="w-full text-sm text-gray-300">
          <thead className="bg-gray-800/60 text-xs text-gray-500 uppercase tracking-wider">
            <tr>
              {['Time', 'Query', 'Strategy', 'Tokens', 'Chunks', 'Latency'].map(h => (
                <th key={h} className="px-4 py-3 text-left">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {events.map(e => (
              <>
                <tr
                  key={e.id}
                  onClick={() => setExpanded(expanded === e.id ? null : e.id)}
                  className="border-t border-gray-800 hover:bg-gray-800/40 cursor-pointer"
                >
                  <td className="px-4 py-2 whitespace-nowrap text-gray-500">
                    {new Date(e.timestamp).toLocaleTimeString()}
                  </td>
                  <td className="px-4 py-2 max-w-xs truncate">{e.query}</td>
                  <td className="px-4 py-2">
                    <span className="px-2 py-0.5 rounded text-xs bg-indigo-900/50 text-indigo-300">
                      {e.strategy}
                    </span>
                  </td>
                  <td className="px-4 py-2">{e.tokenCount.toLocaleString()}</td>
                  <td className="px-4 py-2">{e.chunksRetrieved}</td>
                  <td className="px-4 py-2">{e.latencyMs}ms</td>
                </tr>
                {expanded === e.id && (
                  <tr key={`${e.id}-expanded`} className="bg-gray-900">
                    <td
                      colSpan={6}
                      className="px-4 py-3 text-xs text-gray-400 border-t border-gray-800"
                    >
                      <p className="mb-1">
                        <span className="text-gray-500">Full query:</span> {e.query}
                      </p>
                      <p>
                        <span className="text-gray-500">Chunk IDs:</span>{' '}
                        {e.chunkIds.join(', ') || '—'}
                      </p>
                    </td>
                  </tr>
                )}
              </>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      <div className="flex items-center justify-between mt-3 text-xs text-gray-500">
        <span>
          {offset + 1}–{Math.min(offset + limit, total)} of {total}
        </span>
        <div className="flex gap-2">
          <button
            disabled={offset === 0}
            onClick={() => setOffset(Math.max(0, offset - limit))}
            className="px-3 py-1 rounded bg-gray-800 disabled:opacity-40 hover:bg-gray-700"
          >
            ← Prev
          </button>
          <button
            disabled={offset + limit >= total}
            onClick={() => setOffset(offset + limit)}
            className="px-3 py-1 rounded bg-gray-800 disabled:opacity-40 hover:bg-gray-700"
          >
            Next →
          </button>
        </div>
      </div>
    </div>
  );
}
