import { useEffect, useRef, useState } from 'react';
import { DashboardClient } from '../api/client.ts';
import type { ApiIndexingStatus } from '../api/client.ts';

const STAGE_COLORS: Record<string, string> = {
  walking: 'bg-yellow-900/50 text-yellow-300',
  parsing: 'bg-blue-900/50 text-blue-300',
  embedding: 'bg-purple-900/50 text-purple-300',
  storing: 'bg-indigo-900/50 text-indigo-300',
  done: 'bg-green-900/50 text-green-300',
};

export default function IndexingPanel() {
  const [status, setStatus] = useState<ApiIndexingStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [triggering, setTriggering] = useState(false);
  const [triggerError, setTriggerError] = useState<string | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  function startPolling() {
    if (intervalRef.current) return;
    intervalRef.current = setInterval(() => {
      DashboardClient.getIndexingStatus()
        .then((s) => {
          setStatus(s);
          if (!s.running && intervalRef.current) {
            clearInterval(intervalRef.current);
            intervalRef.current = null;
          }
        })
        .catch(() => {});
    }, 2000);
  }

  useEffect(() => {
    DashboardClient.getIndexingStatus()
      .then((s) => {
        setStatus(s);
        if (s.running) startPolling();
      })
      .catch(() => {})
      .finally(() => setLoading(false));

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleTrigger() {
    setTriggering(true);
    setTriggerError(null);
    try {
      await DashboardClient.triggerIndexing({ incremental: false });
      startPolling();
    } catch (e: unknown) {
      setTriggerError(e instanceof Error ? e.message : 'Failed to trigger indexing');
    } finally {
      setTriggering(false);
    }
  }

  const isRunning = status?.running ?? false;
  const pct =
    status && status.filesTotal > 0
      ? Math.round((status.filesProcessed / status.filesTotal) * 100)
      : status && status.chunksTotal > 0
        ? Math.round((status.chunksIndexed / status.chunksTotal) * 100)
        : 0;

  return (
    <div className="bg-gray-900 rounded-xl border border-gray-800 p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Indexing</h3>
        <button
          onClick={() => void handleTrigger()}
          disabled={isRunning || triggering || loading}
          className="px-3 py-1.5 rounded-lg text-xs font-medium bg-indigo-600 text-white hover:bg-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          {isRunning || triggering ? 'Indexing…' : 'Start Indexing'}
        </button>
      </div>

      {loading && <div className="h-4 bg-gray-800 rounded animate-pulse" />}

      {!loading && status && (
        <>
          {/* Status row */}
          <div className="flex items-center gap-3 mb-3">
            <span
              className={`inline-block w-2 h-2 rounded-full flex-shrink-0 ${isRunning ? 'bg-yellow-400 animate-pulse' : 'bg-gray-600'}`}
            />
            <span className="text-sm text-gray-300">{isRunning ? 'Running' : 'Idle'}</span>
            {status.stage && (
              <span
                className={`px-2 py-0.5 rounded text-xs ${STAGE_COLORS[status.stage] ?? 'bg-gray-800 text-gray-400'}`}
              >
                {status.stage}
              </span>
            )}
          </div>

          {/* File progress bar */}
          {isRunning && status.filesTotal > 0 && (
            <div className="mb-3">
              <div className="flex justify-between text-xs text-gray-500 mb-1">
                <span>
                  Files: {status.filesProcessed} / {status.filesTotal}
                </span>
                <span>{pct}%</span>
              </div>
              <div className="h-1.5 bg-gray-800 rounded-full overflow-hidden">
                <div
                  className="h-full bg-indigo-500 rounded-full transition-all duration-500"
                  style={{ width: `${pct}%` }}
                />
              </div>
              {status.currentFile && (
                <p className="mt-1.5 text-xs text-gray-600 truncate">{status.currentFile}</p>
              )}
            </div>
          )}

          {/* Chunk progress */}
          {isRunning && status.chunksTotal > 0 && (
            <p className="text-xs text-gray-500 mb-3">
              Chunks: {status.chunksIndexed} / {status.chunksTotal}
            </p>
          )}

          {/* Error */}
          {status.error && (
            <div className="mt-2 p-2 bg-red-900/30 border border-red-800 rounded text-xs text-red-300">
              {status.error}
            </div>
          )}

          {/* Last completed timestamp */}
          {status.completedAt && !isRunning && (
            <p className="text-xs text-gray-600 mt-2">
              Last run: {new Date(status.completedAt).toLocaleString()}
            </p>
          )}
        </>
      )}

      {/* Trigger error */}
      {triggerError && (
        <div className="mt-2 p-2 bg-red-900/30 border border-red-800 rounded text-xs text-red-300">
          {triggerError}
        </div>
      )}
    </div>
  );
}
