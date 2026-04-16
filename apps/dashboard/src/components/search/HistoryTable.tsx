import { useState } from 'react';
import { Link } from 'react-router-dom';
import type { SearchHistoryEntry } from '../../api/client.ts';
import Tooltip from '../Tooltip.tsx';
import SearchResultList from './SearchResultList.tsx';
import MetricsPanel from './MetricsPanel.tsx';

interface HistoryTableProps {
  entries: SearchHistoryEntry[];
  total: number;
  page: number;
  pageSize: number;
  sortBy: string;
  sortOrder: 'asc' | 'desc';
  onSortChange: (sortBy: string, sortOrder: 'asc' | 'desc') => void;
  onPageChange: (page: number) => void;
  onReplay: (id: string) => void;
  onDelete: (id: string) => void;
}

const RRF_TOOLTIP =
  'Reciprocal Rank Fusion (RRF) score. When searching across multiple collections, results are re-ranked by the formula 1/(60+rank). Top results typically score 0.013–0.016 — not comparable to cosine similarity.';

const SORT_COLUMNS: Array<{ key: string; label: string; title?: string }> = [
  { key: 'created_at', label: 'Date' },
  { key: 'query', label: 'Query' },
  { key: 'collection', label: 'Collection' },
  { key: 'result_count', label: 'Results' },
  { key: 'top_score', label: 'Top Score', title: RRF_TOOLTIP },
  { key: 'latency_ms', label: 'Latency' },
];

function CollectionBadge({ collection }: { collection: string }) {
  if (collection === 'ast') {
    return <span className="px-2 py-0.5 rounded text-xs bg-blue-900/50 text-blue-300">AST</span>;
  }
  if (collection === 'llm') {
    return (
      <span className="px-2 py-0.5 rounded text-xs bg-purple-900/50 text-purple-300">LLM</span>
    );
  }
  return <span className="px-2 py-0.5 rounded text-xs bg-gray-800 text-gray-400">both</span>;
}

export default function HistoryTable({
  entries,
  total,
  page,
  pageSize,
  sortBy,
  sortOrder,
  onSortChange,
  onPageChange,
  onReplay,
  onDelete,
}: HistoryTableProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [expandedResultId, setExpandedResultId] = useState<string | null>(null);

  const handleSort = (key: string) => {
    if (sortBy === key) {
      onSortChange(key, sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      onSortChange(key, 'desc');
    }
  };

  const totalPages = Math.ceil(total / pageSize);
  const fromItem = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const toItem = Math.min(page * pageSize, total);

  return (
    <div>
      <div className="overflow-x-auto rounded-lg border border-gray-800">
        <table className="w-full text-sm text-gray-300">
          <thead className="bg-gray-800/60 text-xs text-gray-500 uppercase tracking-wider">
            <tr>
              {SORT_COLUMNS.map((col) => (
                <th
                  key={col.key}
                  className="px-4 py-3 text-left cursor-pointer hover:text-gray-300 select-none"
                  onClick={() => handleSort(col.key)}
                >
                  {col.title ? (
                    <Tooltip text={col.title}>
                      <span>
                        {col.label} <span className="text-gray-600">ℹ</span>
                      </span>
                    </Tooltip>
                  ) : (
                    col.label
                  )}
                  {sortBy === col.key && (
                    <span className="ml-1">{sortOrder === 'asc' ? '▲' : '▼'}</span>
                  )}
                </th>
              ))}
              <th className="px-4 py-3 text-left">Actions</th>
            </tr>
          </thead>
          <tbody>
            {entries.map((entry) => (
              <>
                <tr
                  key={entry.id}
                  className="border-t border-gray-800 hover:bg-gray-800/30 cursor-pointer"
                  onClick={() => {
                    setExpandedId(expandedId === entry.id ? null : entry.id);
                    setExpandedResultId(null);
                  }}
                >
                  <td className="px-4 py-2 text-gray-500 whitespace-nowrap">
                    {entry.createdAt.slice(0, 16).replace('T', ' ')}
                  </td>
                  <td className="px-4 py-2 text-gray-300 max-w-xs">
                    <span title={entry.query}>
                      {entry.query.length > 60 ? `${entry.query.slice(0, 60)}…` : entry.query}
                    </span>
                  </td>
                  <td className="px-4 py-2">
                    <CollectionBadge collection={entry.collection} />
                  </td>
                  <td className="px-4 py-2 font-mono">{entry.resultCount}</td>
                  <td className="px-4 py-2 font-mono">{entry.topScore.toFixed(3)}</td>
                  <td className="px-4 py-2">{Math.round(entry.latencyMs)}ms</td>
                  <td className="px-4 py-2" onClick={(e) => e.stopPropagation()}>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => onReplay(entry.id)}
                        title="Replay"
                        className="text-gray-500 hover:text-gray-300 text-xs px-2 py-1 rounded hover:bg-gray-700"
                      >
                        Replay
                      </button>
                      <Link
                        to={`/rag/search?q=${encodeURIComponent(entry.query)}`}
                        onClick={(e) => e.stopPropagation()}
                        title="Search again"
                        className="text-gray-500 hover:text-indigo-400 text-xs px-2 py-1 rounded hover:bg-gray-700"
                      >
                        Search again
                      </Link>
                      <button
                        onClick={() => onDelete(entry.id)}
                        title="Delete"
                        className="text-gray-600 hover:text-red-400 text-xs px-2 py-1 rounded hover:bg-gray-700"
                      >
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
                {expandedId === entry.id && (
                  <tr
                    key={`${entry.id}-expanded`}
                    className="border-t border-gray-800 bg-gray-900/50"
                  >
                    <td colSpan={7} className="px-4 py-4">
                      <SearchResultList
                        results={entry.results}
                        expandedId={expandedResultId}
                        onToggleExpand={(id) =>
                          setExpandedResultId(expandedResultId === id ? null : id)
                        }
                      />
                      <MetricsPanel metrics={entry.metrics} results={entry.results} />
                    </td>
                  </tr>
                )}
              </>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      <div className="flex justify-between items-center mt-4 text-sm text-gray-500">
        <span>{total === 0 ? 'No results' : `Showing ${fromItem}–${toItem} of ${total}`}</span>
        <div className="flex gap-2">
          <button
            onClick={() => onPageChange(page - 1)}
            disabled={page <= 1}
            className="px-3 py-1 rounded bg-gray-800 text-gray-300 hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Previous
          </button>
          <button
            onClick={() => onPageChange(page + 1)}
            disabled={page >= totalPages}
            className="px-3 py-1 rounded bg-gray-800 text-gray-300 hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Next
          </button>
        </div>
      </div>
    </div>
  );
}
