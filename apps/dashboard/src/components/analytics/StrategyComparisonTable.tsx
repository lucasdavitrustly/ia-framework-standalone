import { useState } from 'react';
import type { StrategyComparisonRow } from '../../api/client.ts';

type SortKey = keyof StrategyComparisonRow;
type SortDir = 'asc' | 'desc';

interface Props {
  data: StrategyComparisonRow[];
}

export default function StrategyComparisonTable({ data }: Props) {
  const [sortKey, setSortKey] = useState<SortKey>('avgMrr');
  const [sortDir, setSortDir] = useState<SortDir>('desc');

  if (data.length === 0) {
    return (
      <p className="text-sm text-gray-600 py-4 text-center">
        No benchmark runs yet — run{' '}
        <code className="text-gray-400">ia-framework benchmark run</code>
      </p>
    );
  }

  const sorted = [...data].sort((a, b) => {
    const av = a[sortKey];
    const bv = b[sortKey];
    if (typeof av === 'number' && typeof bv === 'number') {
      return sortDir === 'asc' ? av - bv : bv - av;
    }
    return sortDir === 'asc'
      ? String(av).localeCompare(String(bv))
      : String(bv).localeCompare(String(av));
  });

  function handleSort(key: SortKey) {
    if (key === sortKey) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir('desc');
    }
  }

  function arrow(key: SortKey) {
    if (key !== sortKey) return <span className="text-gray-700 ml-1">↕</span>;
    return <span className="text-indigo-400 ml-1">{sortDir === 'asc' ? '↑' : '↓'}</span>;
  }

  const thCls =
    'px-4 py-2 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider cursor-pointer hover:text-gray-300 select-none';
  const tdCls = 'px-4 py-3 text-sm text-gray-300';

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left">
        <thead>
          <tr className="border-b border-gray-800">
            <th className={thCls} onClick={() => handleSort('collectionName')}>
              Strategy {arrow('collectionName')}
            </th>
            <th className={thCls} onClick={() => handleSort('runCount')}>
              Runs {arrow('runCount')}
            </th>
            <th className={thCls} onClick={() => handleSort('avgMrr')}>
              Avg MRR {arrow('avgMrr')}
            </th>
            <th className={thCls} onClick={() => handleSort('avgHitAtK')}>
              Avg Hit@K {arrow('avgHitAtK')}
            </th>
            <th className={thCls} onClick={() => handleSort('avgLatencyMs')}>
              Avg Latency {arrow('avgLatencyMs')}
            </th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((row) => (
            <tr
              key={row.collectionName}
              className="border-b border-gray-800/50 hover:bg-gray-800/30"
            >
              <td className={`${tdCls} font-mono text-xs`}>{row.collectionName}</td>
              <td className={tdCls}>{row.runCount}</td>
              <td className={tdCls}>
                <span className="text-indigo-400 font-medium">
                  {(row.avgMrr * 100).toFixed(1)}%
                </span>
              </td>
              <td className={tdCls}>
                <span className="text-green-400 font-medium">
                  {(row.avgHitAtK * 100).toFixed(1)}%
                </span>
              </td>
              <td className={tdCls}>{Math.round(row.avgLatencyMs)}ms</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
