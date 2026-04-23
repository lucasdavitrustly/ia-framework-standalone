import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type {
  ChunkBrowseEntry,
  ScoreAnalysisResponse,
  SearchHistoryEntry,
} from '../../api/client.ts';
import { DashboardClient } from '../../api/client.ts';
import NearMissPanel from './NearMissPanel.tsx';

// ─── Types ─────────────────────────────────────────────────────────────────────

interface HistogramBin {
  label: string;
  bucketMid: number;
  count: number;
}

type ScoreMode = 'retrieval' | 'quality';

// ─── Helpers ───────────────────────────────────────────────────────────────────

/** Bucket 0-1 scores into 10 equal bins */
function bucketRetrievalScores(candidates: ScoreAnalysisResponse['candidates']): HistogramBin[] {
  const bins: HistogramBin[] = Array.from({ length: 10 }, (_, i) => ({
    label: `${(i * 0.1).toFixed(1)}–${((i + 1) * 0.1).toFixed(1)}`,
    bucketMid: i * 0.1 + 0.05,
    count: 0,
  }));
  for (const c of candidates) {
    const idx = Math.min(9, Math.floor(c.score * 10));
    bins[idx].count++;
  }
  return bins;
}

/** Bucket 0-100 quality scores into 10 equal bins */
function bucketQualityScores(chunks: ChunkBrowseEntry[]): HistogramBin[] {
  const bins: HistogramBin[] = Array.from({ length: 10 }, (_, i) => ({
    label: `${i * 10}–${(i + 1) * 10}`,
    bucketMid: i * 10 + 5,
    count: 0,
  }));
  for (const c of chunks) {
    if (c.qualityScore === undefined) continue;
    const idx = Math.min(9, Math.floor(c.qualityScore / 10));
    bins[idx].count++;
  }
  return bins;
}

// ─── Component ─────────────────────────────────────────────────────────────────

export default function ScoreHistogram() {
  const [mode, setMode] = useState<ScoreMode>('retrieval');

  // Search history for query selector
  const [historyEntries, setHistoryEntries] = useState<SearchHistoryEntry[]>([]);
  const [selectedHistoryId, setSelectedHistoryId] = useState<string>('');

  // Retrieval scores state
  const [scoreData, setScoreData] = useState<ScoreAnalysisResponse | null>(null);
  const [threshold, setThreshold] = useState<number>(0.3);

  // Quality scores state
  const [qualityChunks, setQualityChunks] = useState<ChunkBrowseEntry[]>([]);
  const [qualityThreshold, setQualityThreshold] = useState<number>(50);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load search history on mount
  useEffect(() => {
    DashboardClient.getSearchHistory({ pageSize: 50, sortBy: 'createdAt', sortOrder: 'desc' })
      .then((r) => {
        setHistoryEntries(r.entries);
        if (r.entries.length > 0 && !selectedHistoryId) {
          setSelectedHistoryId(r.entries[0].id);
        }
      })
      .catch(() => {
        /* non-fatal */
      });
  }, []);

  // Load retrieval scores when selection changes
  useEffect(() => {
    if (mode !== 'retrieval' || !selectedHistoryId) return;
    setLoading(true);
    setError(null);
    DashboardClient.getTuningScores(selectedHistoryId)
      .then((data) => {
        setScoreData(data);
        setThreshold(data.threshold);
      })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : 'Failed to load scores'))
      .finally(() => setLoading(false));
  }, [selectedHistoryId, mode]);

  // Load quality chunks when in quality mode
  useEffect(() => {
    if (mode !== 'quality') return;
    setLoading(true);
    setError(null);
    DashboardClient.getTuningChunks({ limit: 500 })
      .then((r) => setQualityChunks(r.chunks))
      .catch((e: unknown) =>
        setError(e instanceof Error ? e.message : 'Failed to load chunk quality scores'),
      )
      .finally(() => setLoading(false));
  }, [mode]);

  // Compute histogram bins
  const bins = useMemo<HistogramBin[]>(() => {
    if (mode === 'retrieval') {
      return scoreData ? bucketRetrievalScores(scoreData.candidates) : [];
    }
    return bucketQualityScores(qualityChunks);
  }, [mode, scoreData, qualityChunks]);

  // Real-time computed counts based on current threshold
  const { returnedCount, filteredCount, nearMissCount } = useMemo(() => {
    if (mode !== 'retrieval' || !scoreData)
      return { returnedCount: 0, filteredCount: 0, nearMissCount: 0 };
    const nearMissLow = threshold * 0.9;
    let returned = 0;
    let filtered = 0;
    let nearMiss = 0;
    for (const c of scoreData.candidates) {
      if (c.score >= threshold) {
        returned++;
      } else {
        filtered++;
        if (c.score >= nearMissLow) nearMiss++;
      }
    }
    return { returnedCount: returned, filteredCount: filtered, nearMissCount: nearMiss };
  }, [mode, scoreData, threshold]);

  // ── Slider drag handling ───────────────────────────────────────────────────
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const isDragging = useRef(false);

  const handleChartMouseDown = useCallback(() => {
    isDragging.current = true;
  }, []);

  const handleChartMouseMove = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (!isDragging.current || !chartContainerRef.current) return;
      const rect = chartContainerRef.current.getBoundingClientRect();
      // Chart margins: left ~60px, right ~20px; Y-axis goes 0→1 bottom to top
      const chartLeft = rect.left + 60;
      const chartRight = rect.right - 20;
      const chartWidth = chartRight - chartLeft;
      if (chartWidth <= 0) return;
      const relX = (e.clientX - chartLeft) / chartWidth;
      if (mode === 'retrieval') {
        setThreshold(Math.max(0, Math.min(1, relX)));
      } else {
        setQualityThreshold(Math.max(0, Math.min(100, relX * 100)));
      }
    },
    [mode],
  );

  const handleChartMouseUp = useCallback(() => {
    isDragging.current = false;
  }, []);

  const currentThreshold = mode === 'retrieval' ? threshold : qualityThreshold;
  const thresholdScale = mode === 'retrieval' ? threshold : qualityThreshold;

  const selectedEntry = historyEntries.find((e) => e.id === selectedHistoryId);

  return (
    <div className="space-y-4">
      {/* Controls row */}
      <div className="flex flex-wrap items-center gap-3">
        {/* Score type toggle */}
        <div className="flex rounded-lg border border-gray-700 overflow-hidden text-sm">
          <button
            onClick={() => setMode('retrieval')}
            className={`px-3 py-1.5 transition-colors ${mode === 'retrieval' ? 'bg-indigo-600 text-white' : 'bg-gray-800 text-gray-400 hover:text-gray-200'}`}
          >
            Retrieval Scores
          </button>
          <button
            onClick={() => setMode('quality')}
            className={`px-3 py-1.5 transition-colors ${mode === 'quality' ? 'bg-indigo-600 text-white' : 'bg-gray-800 text-gray-400 hover:text-gray-200'}`}
          >
            Chunk Quality Scores
          </button>
        </div>

        {/* Query selector (only for retrieval mode) */}
        {mode === 'retrieval' && (
          <div className="flex items-center gap-2">
            <label className="text-xs text-gray-500">Query:</label>
            <select
              value={selectedHistoryId}
              onChange={(e) => setSelectedHistoryId(e.target.value)}
              className="bg-gray-800 border border-gray-700 text-gray-200 text-sm rounded px-2 py-1 max-w-xs truncate"
            >
              {historyEntries.length === 0 && <option value="">No search history</option>}
              {historyEntries.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.query.length > 60 ? `${e.query.slice(0, 60)}…` : e.query}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {/* Query subtitle */}
      {mode === 'retrieval' && selectedEntry && (
        <p className="text-xs text-gray-500">
          Showing top-50 candidates for:{' '}
          <span className="text-gray-300 italic">"{selectedEntry.query}"</span>
        </p>
      )}

      {loading && <div className="text-sm text-gray-500 py-8 text-center">Loading score data…</div>}
      {error && <div className="text-sm text-red-400 py-4 text-center">{error}</div>}

      {!loading && !error && bins.length > 0 && (
        <>
          {/* Histogram chart */}
          <div
            ref={chartContainerRef}
            className="select-none"
            onMouseDown={handleChartMouseDown}
            onMouseMove={handleChartMouseMove}
            onMouseUp={handleChartMouseUp}
            onMouseLeave={handleChartMouseUp}
          >
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={bins} margin={{ top: 8, right: 20, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#9ca3af' }} />
                <YAxis tick={{ fontSize: 11, fill: '#9ca3af' }} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#1f2937',
                    border: '1px solid #374151',
                    borderRadius: 6,
                  }}
                  labelStyle={{ color: '#e5e7eb' }}
                  itemStyle={{ color: '#a5b4fc' }}
                />
                <ReferenceLine
                  x={
                    bins.findIndex((b) => b.bucketMid >= currentThreshold) >= 0
                      ? bins[bins.findIndex((b) => b.bucketMid >= currentThreshold)]?.label
                      : bins[bins.length - 1]?.label
                  }
                  stroke="#fbbf24"
                  strokeDasharray="4 4"
                  label={{ value: 'Threshold', fill: '#fbbf24', fontSize: 11 }}
                />
                <Bar dataKey="count" radius={[3, 3, 0, 0]}>
                  {bins.map((bin) => (
                    <Cell
                      key={bin.label}
                      fill={bin.bucketMid >= currentThreshold ? '#22c55e' : '#f97316'}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Threshold slider */}
          <div className="flex items-center gap-3">
            <label className="text-xs text-gray-500 w-24 shrink-0">Threshold:</label>
            <input
              type="range"
              min={0}
              max={mode === 'retrieval' ? 100 : 100}
              value={
                mode === 'retrieval' ? Math.round(threshold * 100) : Math.round(qualityThreshold)
              }
              onChange={(e) => {
                const v = Number(e.target.value);
                if (mode === 'retrieval') setThreshold(v / 100);
                else setQualityThreshold(v);
              }}
              className="flex-1 accent-indigo-500"
            />
            <span className="font-mono text-sm text-gray-200 w-12 text-right">
              {mode === 'retrieval' ? thresholdScale.toFixed(2) : Math.round(thresholdScale)}
            </span>
          </div>

          {/* Summary stats (retrieval mode only) */}
          {mode === 'retrieval' && (
            <div className="flex gap-6 text-sm bg-gray-900 rounded-lg border border-gray-800 px-4 py-2">
              <span>
                <span className="text-gray-500">Returned: </span>
                <span className="text-green-400 font-mono font-semibold">{returnedCount}</span>
              </span>
              <span>
                <span className="text-gray-500">Filtered: </span>
                <span className="text-orange-400 font-mono font-semibold">{filteredCount}</span>
              </span>
              <span>
                <span className="text-gray-500">Near-miss: </span>
                <span className="text-yellow-400 font-mono font-semibold">{nearMissCount}</span>
              </span>
            </div>
          )}
        </>
      )}

      {!loading && !error && bins.length === 0 && mode === 'retrieval' && !selectedHistoryId && (
        <div className="text-sm text-gray-500 py-8 text-center">
          No search history available. Run a search first to analyze score distributions.
        </div>
      )}

      {/* Near-miss panel (retrieval mode only) */}
      {mode === 'retrieval' && scoreData && (
        <NearMissPanel data={scoreData} threshold={threshold} />
      )}
    </div>
  );
}
