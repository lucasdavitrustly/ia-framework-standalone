import { useState, useEffect, useCallback, useRef } from 'react';
import { fetchLogs, type LogEntry, type LogLevel } from '../api/logs.ts';

const LEVELS: LogLevel[] = ['debug', 'info', 'warn', 'error', 'fatal'];

const LEVEL_COLORS: Record<string, string> = {
  debug: 'text-gray-400',
  info: 'text-blue-400',
  warn: 'text-yellow-400',
  error: 'text-red-400',
  fatal: 'text-red-600 font-bold',
};

export default function LogsPage() {
  const [entries, setEntries] = useState<LogEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [level, setLevel] = useState<LogLevel>('info');
  const [loading, setLoading] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const loadLogs = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchLogs({ level, limit: 100 });
      setEntries(data.entries);
      setTotal(data.total);
    } catch {
      // silently fail — will show empty state
    } finally {
      setLoading(false);
    }
  }, [level]);

  useEffect(() => {
    void loadLogs();
  }, [loadLogs]);

  useEffect(() => {
    if (autoRefresh) {
      intervalRef.current = setInterval(() => void loadLogs(), 5000);
    } else if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [autoRefresh, loadLogs]);

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-semibold text-gray-100">MCP Server Logs</h1>
        <div className="flex items-center gap-3">
          <select
            value={level}
            onChange={(e) => setLevel(e.target.value as LogLevel)}
            className="bg-gray-800 border border-gray-700 rounded px-2 py-1 text-sm text-gray-200"
          >
            {LEVELS.map((l) => (
              <option key={l} value={l}>
                {l.charAt(0).toUpperCase() + l.slice(1)}+
              </option>
            ))}
          </select>
          <button
            onClick={() => void loadLogs()}
            disabled={loading}
            className="bg-gray-800 border border-gray-700 rounded px-3 py-1 text-sm text-gray-200 hover:bg-gray-700 disabled:opacity-50"
          >
            {loading ? 'Loading...' : 'Refresh'}
          </button>
          <label className="flex items-center gap-1.5 text-sm text-gray-400">
            <input
              type="checkbox"
              checked={autoRefresh}
              onChange={(e) => setAutoRefresh(e.target.checked)}
              className="rounded"
            />
            Auto (5s)
          </label>
        </div>
      </div>

      {entries.length === 0 && !loading ? (
        <div className="text-center text-gray-500 py-12">
          <p className="text-lg">No logs yet</p>
          <p className="text-sm mt-1">MCP server logs will appear here once the server runs.</p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm font-mono">
            <thead>
              <tr className="border-b border-gray-800 text-gray-400 text-left">
                <th className="py-2 px-2 w-44">Timestamp</th>
                <th className="py-2 px-2 w-16">Level</th>
                <th className="py-2 px-2 w-40">Component</th>
                <th className="py-2 px-2">Message</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((entry, i) => (
                <tr key={i} className="border-b border-gray-800/50 hover:bg-gray-900/50">
                  <td className="py-1.5 px-2 text-gray-500 whitespace-nowrap">
                    {new Date(entry.timestamp).toLocaleTimeString()}
                  </td>
                  <td
                    className={`py-1.5 px-2 ${LEVEL_COLORS[entry.levelLabel] ?? 'text-gray-400'}`}
                  >
                    {entry.levelLabel}
                  </td>
                  <td className="py-1.5 px-2 text-gray-400 truncate max-w-[10rem]">
                    {entry.component}
                  </td>
                  <td className="py-1.5 px-2 text-gray-200">{entry.msg}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {total > entries.length && (
            <p className="text-xs text-gray-500 mt-2">
              Showing {entries.length} of {total} matching entries
            </p>
          )}
        </div>
      )}
    </div>
  );
}
