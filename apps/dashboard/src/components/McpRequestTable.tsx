import { useEffect, useState } from 'react';
import { DashboardClient } from '../api/client.ts';
import type { McpRequestListItem, McpRequest, McpToolRequestStats } from '../api/client.ts';

interface Props {
  tools: McpToolRequestStats[];
  initialLimit?: number;
}

export default function McpRequestTable({ tools, initialLimit = 20 }: Props) {
  const [items, setItems] = useState<McpRequestListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [toolFilter, setToolFilter] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [expandedContent, setExpandedContent] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const limit = initialLimit;

  useEffect(() => {
    setLoading(true);
    DashboardClient.getMcpRequests({
      limit,
      offset,
      tool_name: toolFilter || undefined,
    })
      .then((res) => {
        setItems(res.items);
        setTotal(res.total);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [offset, limit, toolFilter]);

  // Reset offset when filter changes
  useEffect(() => {
    setOffset(0);
  }, [toolFilter]);

  const handleExpand = (id: string) => {
    if (expandedId === id) {
      setExpandedId(null);
      setExpandedContent(null);
      return;
    }
    setExpandedId(id);
    setExpandedContent(null);
    DashboardClient.getMcpRequestById(id)
      .then((req: McpRequest) => setExpandedContent(req.responseContent))
      .catch(() => setExpandedContent('[Failed to load response]'));
  };

  if (loading && items.length === 0) {
    return <div className="h-24 bg-gray-800/50 rounded-lg animate-pulse" />;
  }

  if (!loading && items.length === 0 && !toolFilter) {
    return <p className="text-sm text-gray-600 py-4">No MCP requests recorded yet</p>;
  }

  return (
    <div>
      {/* Tool filter */}
      <div className="mb-3">
        <select
          value={toolFilter}
          onChange={(e) => setToolFilter(e.target.value)}
          className="bg-gray-800 border border-gray-700 text-gray-300 text-sm rounded px-3 py-1.5 focus:outline-none focus:border-indigo-500"
        >
          <option value="">All tools</option>
          {tools.map((t) => (
            <option key={t.toolName} value={t.toolName}>
              {t.toolName} ({t.requestCount})
            </option>
          ))}
        </select>
      </div>

      <div className="overflow-x-auto rounded-lg border border-gray-800">
        <table className="w-full text-sm text-gray-300">
          <thead className="bg-gray-800/60 text-xs text-gray-500 uppercase tracking-wider">
            <tr>
              {['Time', 'Tool', 'Input Tokens', 'Output Tokens', 'Duration'].map((h) => (
                <th key={h} className="px-4 py-3 text-left">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <>
                <tr
                  key={item.id}
                  onClick={() => handleExpand(item.id)}
                  className="border-t border-gray-800 hover:bg-gray-800/40 cursor-pointer"
                >
                  <td className="px-4 py-2 whitespace-nowrap text-gray-500">
                    {new Date(item.timestamp).toLocaleString()}
                  </td>
                  <td className="px-4 py-2">
                    <span className="px-2 py-0.5 rounded text-xs bg-indigo-900/50 text-indigo-300">
                      {item.toolName}
                    </span>
                  </td>
                  <td className="px-4 py-2">{item.inputTokens.toLocaleString()}</td>
                  <td className="px-4 py-2">{item.outputTokens.toLocaleString()}</td>
                  <td className="px-4 py-2">{item.durationMs}ms</td>
                </tr>
                {expandedId === item.id && (
                  <tr key={`${item.id}-exp`} className="bg-gray-900">
                    <td colSpan={5} className="px-4 py-3 text-xs border-t border-gray-800">
                      <div className="mb-2 text-gray-400">
                        <span className="text-gray-500">Input params: </span>
                        <code className="text-gray-300">
                          {JSON.stringify(item.inputParams, null, 2)}
                        </code>
                      </div>
                      <div className="text-gray-400">
                        <span className="text-gray-500">Response: </span>
                        {expandedContent === null ? (
                          <span className="animate-pulse">Loading...</span>
                        ) : (
                          <pre className="mt-1 max-h-64 overflow-auto whitespace-pre-wrap text-gray-300 bg-gray-800/50 rounded p-2">
                            {expandedContent}
                            {item.isTruncated && (
                              <span className="text-yellow-500 block mt-1">
                                [Response truncated]
                              </span>
                            )}
                          </pre>
                        )}
                      </div>
                    </td>
                  </tr>
                )}
              </>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {total > 0 && (
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
              Prev
            </button>
            <button
              disabled={offset + limit >= total}
              onClick={() => setOffset(offset + limit)}
              className="px-3 py-1 rounded bg-gray-800 disabled:opacity-40 hover:bg-gray-700"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
