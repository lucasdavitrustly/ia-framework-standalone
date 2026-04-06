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

const PIPELINE_STAGES = ['walking', 'parsing', 'embedding', 'storing'] as const;
type PipelineStage = (typeof PIPELINE_STAGES)[number];

const STAGE_ICONS: Record<PipelineStage, string> = {
  walking: '🚶',
  parsing: '📄',
  embedding: '🧮',
  storing: '💾',
};

const STAGE_LABELS: Record<PipelineStage, string> = {
  walking: 'Walking',
  parsing: 'Parsing',
  embedding: 'Embedding',
  storing: 'Storing',
};

export default function IndexingPanel() {
  const [status, setStatus] = useState<ApiIndexingStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [triggering, setTriggering] = useState(false);
  const [stopping, setStopping] = useState(false);
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

  async function handleStop() {
    setStopping(true);
    setTriggerError(null);
    try {
      await DashboardClient.stopIndexing();
    } catch (e: unknown) {
      setTriggerError(e instanceof Error ? e.message : 'Failed to stop indexing');
    } finally {
      setStopping(false);
    }
  }

  const isRunning = status?.running ?? false;
  const isDone = status?.stage === 'done';

  // Determine the current stage index in the pipeline
  const currentStageIndex =
    status?.stage && status.stage !== 'done'
      ? PIPELINE_STAGES.indexOf(status.stage as PipelineStage)
      : isDone
        ? PIPELINE_STAGES.length // all done
        : -1;

  // Compute duration string for completion summary
  const completionDuration =
    isDone && status?.startedAt && status?.completedAt
      ? Math.round(
          (new Date(status.completedAt).getTime() - new Date(status.startedAt).getTime()) / 1000,
        )
      : null;

  // Progress percentages
  const filesPct =
    status && status.filesTotal > 0
      ? Math.round((status.filesProcessed / status.filesTotal) * 100)
      : 0;
  const chunksPct =
    status && status.chunksTotal > 0
      ? Math.round((status.chunksIndexed / status.chunksTotal) * 100)
      : 0;

  return (
    <div className="bg-gray-900 rounded-xl border border-gray-800 p-5">
      {/* Header row */}
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Indexing</h3>
        <div className="flex items-center gap-2">
          {isRunning && (
            <button
              onClick={() => void handleStop()}
              disabled={stopping}
              className="px-3 py-1.5 rounded-lg text-xs font-medium bg-red-700 text-white hover:bg-red-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              {stopping ? 'Stopping…' : 'Stop'}
            </button>
          )}
          <button
            onClick={() => void handleTrigger()}
            disabled={isRunning || triggering || loading}
            className="px-3 py-1.5 rounded-lg text-xs font-medium bg-indigo-600 text-white hover:bg-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            {isRunning || triggering ? 'Indexing…' : 'Start Indexing'}
          </button>
        </div>
      </div>

      {loading && <div className="h-4 bg-gray-800 rounded animate-pulse" />}

      {!loading && status && (
        <>
          {/* Idle state — no stage set and not running */}
          {!isRunning && !isDone && status.stage === null && (
            <div className="flex items-center gap-2">
              <span className="inline-block w-2 h-2 rounded-full bg-gray-600 flex-shrink-0" />
              <span className="text-sm text-gray-500">Idle</span>
            </div>
          )}

          {/* 4-stage pipeline view — shown while running or when done */}
          {(isRunning || isDone) && (
            <div className="space-y-3">
              {PIPELINE_STAGES.map((stage, index) => {
                const isActive = index === currentStageIndex;
                const isCompleted = index < currentStageIndex;
                const isPending = index > currentStageIndex;

                return (
                  <div key={stage} className="flex flex-col gap-1">
                    {/* Stage header */}
                    <div className="flex items-center gap-2">
                      {/* Status indicator */}
                      {isCompleted || isDone ? (
                        <span className="text-green-400 text-xs font-bold w-4 flex-shrink-0">
                          ✓
                        </span>
                      ) : isActive ? (
                        <span className="inline-block w-2 h-2 rounded-full bg-yellow-400 animate-pulse flex-shrink-0 ml-1 mr-1" />
                      ) : (
                        <span className="inline-block w-2 h-2 rounded-full bg-gray-700 flex-shrink-0 ml-1 mr-1" />
                      )}

                      {/* Stage icon + label */}
                      <span className="text-xs">
                        {STAGE_ICONS[stage]}{' '}
                        <span
                          className={
                            isCompleted || isDone
                              ? 'text-gray-500'
                              : isActive
                                ? 'text-gray-200 font-medium'
                                : 'text-gray-600'
                          }
                        >
                          {STAGE_LABELS[stage]}
                        </span>
                      </span>

                      {/* Stage colour badge for active stage */}
                      {isActive && (
                        <span
                          className={`ml-auto px-2 py-0.5 rounded text-xs ${STAGE_COLORS[stage] ?? 'bg-gray-800 text-gray-400'}`}
                        >
                          running
                        </span>
                      )}
                    </div>

                    {/* Progress indicator — only show for active stage */}
                    {isActive && (
                      <>
                        {/* Parsing: files progress bar */}
                        {stage === 'parsing' && (
                          <div className="ml-6">
                            <div className="flex justify-between text-xs text-gray-500 mb-1">
                              <span>
                                Files: {status.filesProcessed} / {status.filesTotal}
                              </span>
                              <span>{filesPct}%</span>
                            </div>
                            <div className="h-1.5 bg-gray-800 rounded-full overflow-hidden">
                              <div
                                className="h-full bg-blue-500 rounded-full transition-all duration-300"
                                style={{ width: `${filesPct}%` }}
                              />
                            </div>
                            {status.currentFile && (
                              <p className="mt-1 text-xs text-gray-600 truncate">
                                {status.currentFile}
                              </p>
                            )}
                          </div>
                        )}

                        {/* Embedding: chunks progress bar */}
                        {stage === 'embedding' && (
                          <div className="ml-6">
                            <div className="flex justify-between text-xs text-gray-500 mb-1">
                              <span>
                                Chunks: {status.chunksIndexed} / {status.chunksTotal}
                              </span>
                              <span>{chunksPct}%</span>
                            </div>
                            <div className="h-1.5 bg-gray-800 rounded-full overflow-hidden">
                              <div
                                className="h-full bg-purple-500 rounded-full transition-all duration-300"
                                style={{ width: `${chunksPct}%` }}
                              />
                            </div>
                          </div>
                        )}

                        {/* Walking / Storing: indeterminate spinner */}
                        {(stage === 'walking' || stage === 'storing') && (
                          <div className="ml-6 h-1 w-full bg-gray-800 rounded-full overflow-hidden">
                            <div className="h-full w-1/3 bg-yellow-400 rounded-full animate-pulse" />
                          </div>
                        )}
                      </>
                    )}
                  </div>
                );
              })}

              {/* Completion summary */}
              {isDone && completionDuration !== null && (
                <div className="mt-2 pt-2 border-t border-gray-800">
                  <p className="text-xs text-green-400">Completed in {completionDuration}s</p>
                </div>
              )}
            </div>
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
