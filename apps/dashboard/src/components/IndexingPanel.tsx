import { useEffect, useRef, useState } from 'react';
import { DashboardClient } from '../api/client.ts';
import type { ApiIndexingStatus } from '../api/client.ts';

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
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastJsonRef = useRef<string>('');

  function applyStatus(s: ApiIndexingStatus) {
    const json = JSON.stringify(s);
    if (json !== lastJsonRef.current) {
      lastJsonRef.current = json;
      setStatus(s);
    }
  }

  useEffect(() => {
    // Fetch immediately on mount
    DashboardClient.getIndexingStatus()
      .then((s) => applyStatus(s))
      .catch(() => {})
      .finally(() => setLoading(false));

    // Then poll unconditionally — detects when CLI indexing starts or finishes
    intervalRef.current = setInterval(() => {
      DashboardClient.getIndexingStatus()
        .then((s) => applyStatus(s))
        .catch(() => {});
    }, 2000);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, []);

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
        {isRunning && (
          <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded text-xs bg-indigo-900/50 text-indigo-300">
            <span className="inline-block w-1.5 h-1.5 rounded-full bg-indigo-400 animate-pulse" />
            Running
          </span>
        )}
      </div>

      {loading && <div className="h-4 bg-gray-800 rounded animate-pulse" />}

      {!loading && status && (
        <>
          {/* Stopped state — aborted by user */}
          {!isRunning && !isDone && status.stage === null && status.error && (
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <span className="inline-block w-2 h-2 rounded-full bg-yellow-500 flex-shrink-0" />
                <span className="text-sm text-yellow-400">Stopped by user</span>
              </div>
              {(status.filesTotal > 0 || status.chunksTotal > 0) && (
                <div className="text-xs text-gray-500 space-y-1">
                  <p>
                    Files: {status.filesProcessed}/{status.filesTotal}
                  </p>
                  <p>
                    Chunks: {status.chunksIndexed}/{status.chunksTotal}
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Idle state — no stage set and not running */}
          {!isRunning && !isDone && status.stage === null && !status.error && (
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <span className="inline-block w-2 h-2 rounded-full bg-gray-600 flex-shrink-0" />
                <span className="text-sm text-gray-500">Idle — not yet indexed</span>
              </div>
              <p className="text-xs text-gray-600 mt-1">
                Run{' '}
                <code className="text-gray-400 bg-gray-800 px-1 rounded">ia-framework index</code>{' '}
                to start indexing
              </p>
            </div>
          )}

          {/* 4-stage pipeline view — shown while running or when done */}
          {(isRunning || isDone) && (
            <div className="space-y-3">
              {PIPELINE_STAGES.map((stage, index) => {
                const isActive = index === currentStageIndex;
                const isCompleted = index < currentStageIndex;

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

                    {/* Progress bars — always rendered to avoid mount/unmount flash.
                        Visibility controlled by opacity so CSS transitions work smoothly. */}

                    {/* Parsing: files progress bar */}
                    {stage === 'parsing' && (
                      <div
                        className="ml-6 transition-opacity duration-300"
                        style={{ opacity: isActive ? 1 : 0 }}
                      >
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
                      </div>
                    )}

                    {/* Embedding: chunks progress bar */}
                    {stage === 'embedding' && (
                      <div
                        className="ml-6 transition-opacity duration-300"
                        style={{ opacity: isActive ? 1 : 0 }}
                      >
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

                    {/* Walking / Storing: indeterminate sliding bar */}
                    {(stage === 'walking' || stage === 'storing') && (
                      <div
                        className="ml-6 h-1 w-full bg-gray-800 rounded-full overflow-hidden transition-opacity duration-300"
                        style={{ opacity: isActive ? 1 : 0 }}
                      >
                        <div
                          className="h-full w-1/3 rounded-full"
                          style={{
                            background:
                              stage === 'storing'
                                ? 'rgb(129 140 248)' // indigo-400
                                : 'rgb(250 204 21)', // yellow-400
                            animation: isActive
                              ? 'indeterminate-slide 1.4s ease-in-out infinite'
                              : 'none',
                          }}
                        />
                      </div>
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
    </div>
  );
}
