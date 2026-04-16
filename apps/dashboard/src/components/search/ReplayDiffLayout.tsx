import { useState } from 'react';
import type { SearchResult, SearchMetrics } from '../../api/client.ts';
import SearchResultList from './SearchResultList.tsx';
import MetricsPanel from './MetricsPanel.tsx';

interface ReplayDiffLayoutProps {
  originalResults: SearchResult[];
  freshResults: SearchResult[];
  originalMetrics: SearchMetrics;
  freshMetrics: SearchMetrics;
  query: string;
  warning?: string;
  onClose: () => void;
}

/** Build identity key for a result */
function resultKey(r: SearchResult): string {
  return `${r.filePath}:${r.startLine}:${r.endLine}`;
}

function computeDiff(
  originals: SearchResult[],
  freshes: SearchResult[],
): {
  removedKeys: Set<string>;
  newKeys: Set<string>;
  rankDeltas: Map<string, number>;
} {
  const origKeys = new Map(originals.map((r, i) => [resultKey(r), i]));
  const freshKeys = new Map(freshes.map((r, i) => [resultKey(r), i]));

  const removedKeys = new Set<string>();
  const newKeys = new Set<string>();
  const rankDeltas = new Map<string, number>();

  for (const [key, origRank] of origKeys) {
    if (!freshKeys.has(key)) {
      removedKeys.add(key);
    } else {
      const freshRank = freshKeys.get(key)!;
      if (origRank !== freshRank) {
        rankDeltas.set(key, origRank - freshRank); // positive = moved up
      }
    }
  }

  for (const [key] of freshKeys) {
    if (!origKeys.has(key)) {
      newKeys.add(key);
    }
  }

  return { removedKeys, newKeys, rankDeltas };
}

function sharedCount(originals: SearchResult[], freshes: SearchResult[]): number {
  const freshKeySet = new Set(freshes.map(resultKey));
  return originals.filter((r) => freshKeySet.has(resultKey(r))).length;
}

/** Map result id → key for overlay sets expected by SearchResultList */
function buildOverlaySet(results: SearchResult[], matchKeys: Set<string>): Set<string> {
  const ids = new Set<string>();
  for (const r of results) {
    if (matchKeys.has(resultKey(r))) ids.add(r.id);
  }
  return ids;
}

export default function ReplayDiffLayout({
  originalResults,
  freshResults,
  originalMetrics,
  freshMetrics,
  query,
  warning,
  onClose,
}: ReplayDiffLayoutProps) {
  const [origExpandedId, setOrigExpandedId] = useState<string | null>(null);
  const [freshExpandedId, setFreshExpandedId] = useState<string | null>(null);

  const { removedKeys, newKeys, rankDeltas } = computeDiff(originalResults, freshResults);
  const shared = sharedCount(originalResults, freshResults);

  const latencyDelta = freshMetrics.latencyMs - originalMetrics.latencyMs;
  const resultsDelta = freshResults.length - originalResults.length;

  // Overlay sets: highlight removed in original column, new in fresh column
  const removedOverlays = buildOverlaySet(originalResults, removedKeys);
  const newOverlays = buildOverlaySet(freshResults, newKeys);

  return (
    <div className="bg-gray-900 rounded-xl border border-gray-800 p-5">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-medium text-gray-200">
          Replay: &quot;{query.length > 60 ? `${query.slice(0, 60)}…` : query}&quot;
        </h3>
        <button
          onClick={onClose}
          className="text-gray-500 hover:text-gray-300 text-lg leading-none px-1"
        >
          ✕
        </button>
      </div>

      {/* Warning */}
      {warning && (
        <div className="bg-yellow-900/30 border border-yellow-700 rounded p-3 mb-4 text-yellow-300 text-sm">
          {warning}
        </div>
      )}

      {/* Delta summary */}
      <div className="grid grid-cols-3 gap-4 mb-5">
        <div className="bg-gray-800 rounded-lg border border-gray-700 p-4 text-center">
          <p className="text-xs text-gray-500 uppercase tracking-wider">Latency Δ</p>
          <p
            className={`mt-1 text-lg font-semibold ${latencyDelta > 0 ? 'text-red-400' : latencyDelta < 0 ? 'text-green-400' : 'text-gray-100'}`}
          >
            {latencyDelta > 0 ? '+' : ''}
            {latencyDelta}ms
          </p>
          <p className="text-xs text-gray-500">
            Saved: {originalMetrics.latencyMs}ms · Now: {freshMetrics.latencyMs}ms
          </p>
        </div>
        <div className="bg-gray-800 rounded-lg border border-gray-700 p-4 text-center">
          <p className="text-xs text-gray-500 uppercase tracking-wider">Results Δ</p>
          <p
            className={`mt-1 text-lg font-semibold ${resultsDelta > 0 ? 'text-green-400' : resultsDelta < 0 ? 'text-red-400' : 'text-gray-100'}`}
          >
            {resultsDelta > 0 ? '+' : ''}
            {resultsDelta}
          </p>
          <p className="text-xs text-gray-500">
            Saved: {originalResults.length} · Now: {freshResults.length}
          </p>
        </div>
        <div className="bg-gray-800 rounded-lg border border-gray-700 p-4 text-center">
          <p className="text-xs text-gray-500 uppercase tracking-wider">Shared Results</p>
          <p className="mt-1 text-lg font-semibold text-amber-400">{shared}</p>
          <p className="text-xs text-gray-500">
            {removedKeys.size} removed · {newKeys.size} new
          </p>
        </div>
      </div>

      {/* Rank delta legend */}
      {rankDeltas.size > 0 && (
        <p className="text-xs text-gray-600 mb-3">
          Rank changes shown as badges (e.g. ↑2 = moved up 2 positions)
        </p>
      )}

      {/* Two-column diff */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Original column */}
        <div>
          <h4 className="text-sm font-semibold text-gray-400 mb-3 flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-gray-500" />
            Original (saved)
          </h4>
          {originalResults.length > 0 ? (
            <>
              <SearchResultList
                results={originalResults}
                expandedId={origExpandedId}
                onToggleExpand={(id) => setOrigExpandedId(origExpandedId === id ? null : id)}
                overlaps={removedOverlays}
              />
              <MetricsPanel metrics={originalMetrics} results={originalResults} />
            </>
          ) : (
            <p className="text-sm text-gray-600 py-4">No saved results.</p>
          )}
        </div>

        {/* Fresh column */}
        <div>
          <h4 className="text-sm font-semibold text-indigo-300 mb-3 flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-indigo-500" />
            Current (replay)
          </h4>
          {freshResults.length > 0 ? (
            <>
              <SearchResultList
                results={freshResults}
                expandedId={freshExpandedId}
                onToggleExpand={(id) => setFreshExpandedId(freshExpandedId === id ? null : id)}
                overlaps={newOverlays}
              />
              <MetricsPanel metrics={freshMetrics} results={freshResults} />
            </>
          ) : (
            <p className="text-sm text-gray-600 py-4">No current results.</p>
          )}
        </div>
      </div>
    </div>
  );
}
