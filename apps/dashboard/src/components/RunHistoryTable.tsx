import type { BenchmarkRun } from '../api/client.ts';

interface Props {
  runs: BenchmarkRun[];
}

function formatDate(iso: string): string {
  return iso.slice(0, 16).replace('T', ' ');
}

export default function RunHistoryTable({ runs }: Props) {
  if (runs.length === 0) {
    return (
      <p className="text-sm text-gray-600 py-4">
        No benchmark runs yet. Run:{' '}
        <code className="text-gray-400">ia-framework benchmark run</code>
      </p>
    );
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-gray-800">
      <table className="w-full text-sm text-gray-300">
        <thead className="bg-gray-800/60 text-xs text-gray-500 uppercase tracking-wider">
          <tr>
            {['Run ID', 'Label', 'Date', 'Hit@K', 'MRR', 'Latency', 'Type'].map(h => (
              <th key={h} className="px-4 py-3 text-left">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {runs.map(r => (
            <tr key={r.runId} className="border-t border-gray-800 hover:bg-gray-800/30">
              <td className="px-4 py-2 font-mono text-xs text-gray-400">{r.runId.slice(0, 8)}</td>
              <td className="px-4 py-2 text-gray-300">
                {r.label ?? <span className="text-gray-600">—</span>}
              </td>
              <td className="px-4 py-2 text-gray-500 whitespace-nowrap">{formatDate(r.timestamp)}</td>
              <td className="px-4 py-2 font-mono">{r.hitAtK.toFixed(3)}</td>
              <td className="px-4 py-2 font-mono">{r.mrr.toFixed(3)}</td>
              <td className="px-4 py-2">{Math.round(r.avgLatencyMs)}ms</td>
              <td className="px-4 py-2">
                {r.isBaseline ? (
                  <span className="px-2 py-0.5 rounded text-xs bg-orange-900/50 text-orange-300">
                    BASELINE
                  </span>
                ) : (
                  <span className="px-2 py-0.5 rounded text-xs bg-indigo-900/50 text-indigo-300">
                    RAG
                  </span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
