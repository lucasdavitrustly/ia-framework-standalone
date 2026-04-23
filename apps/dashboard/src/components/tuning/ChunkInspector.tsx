import { useEffect, useState } from 'react';
import { DashboardClient } from '../../api/client.ts';
import type { ChunkBrowseEntry } from '../../api/client.ts';
import SourceTag from '../search/SourceTag.tsx';

const PAGE_SIZE = 20;

function Skeleton() {
  return (
    <div className="space-y-3">
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="h-40 bg-gray-800/50 rounded-lg animate-pulse" />
      ))}
    </div>
  );
}

interface ChunkCardProps {
  chunk: ChunkBrowseEntry;
}

function ChunkCard({ chunk }: ChunkCardProps) {
  return (
    <div className="bg-gray-900 rounded-xl border border-gray-800 p-4 space-y-3">
      {/* Header row */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <span className="text-sm font-mono text-gray-200 break-all">
            {chunk.filePath}:{chunk.startLine}-{chunk.endLine}
          </span>
          {chunk.name && <p className="text-sm text-gray-400 mt-1">{chunk.name}</p>}
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <SourceTag source={chunk.source} />
          <span className="px-2 py-0.5 rounded text-xs font-medium bg-gray-800 text-gray-400">
            {chunk.chunkType}
          </span>
          {chunk.source === 'llm' ? (
            <span
              className={`px-2 py-0.5 rounded text-xs font-semibold ${
                chunk.qualityScore !== undefined
                  ? chunk.qualityScore >= 0.7
                    ? 'bg-green-900/50 text-green-300'
                    : chunk.qualityScore >= 0.4
                      ? 'bg-yellow-900/50 text-yellow-300'
                      : 'bg-red-900/50 text-red-300'
                  : 'bg-gray-800 text-gray-500'
              }`}
            >
              {chunk.qualityScore !== undefined
                ? `Q: ${(chunk.qualityScore * 100).toFixed(0)}%`
                : 'Q: N/A'}
            </span>
          ) : (
            <span className="px-2 py-0.5 rounded text-xs font-semibold bg-gray-800 text-gray-500">
              Q: N/A
            </span>
          )}
        </div>
      </div>

      {/* Source code */}
      <pre className="text-xs font-mono text-gray-300 bg-gray-950 rounded-lg p-3 overflow-x-auto whitespace-pre-wrap break-words max-h-48">
        {chunk.content}
      </pre>
    </div>
  );
}

export default function ChunkInspector() {
  const [collection, setCollection] = useState<string>('all');
  const [minQuality, setMinQuality] = useState<number>(0);
  const [offset, setOffset] = useState(0);

  const [chunks, setChunks] = useState<ChunkBrowseEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    const params: Parameters<typeof DashboardClient.getTuningChunks>[0] = {
      limit: PAGE_SIZE,
      offset,
    };
    if (collection !== 'all') params.collection = collection;
    if (collection === 'llm' && minQuality > 0) params.minQuality = minQuality / 100;

    DashboardClient.getTuningChunks(params)
      .then((res) => {
        setChunks(res.chunks);
        setTotal(res.total);
        setLoading(false);
      })
      .catch((err: unknown) => {
        setError(String(err));
        setLoading(false);
      });
  }, [collection, minQuality, offset]);

  const handleCollectionChange = (val: string) => {
    setCollection(val);
    setOffset(0);
  };

  const handleQualityChange = (val: number) => {
    setMinQuality(val);
    setOffset(0);
  };

  const avgQuality =
    chunks.filter((c) => c.qualityScore !== undefined).length > 0
      ? chunks
          .filter((c) => c.qualityScore !== undefined)
          .reduce((sum, c) => sum + (c.qualityScore ?? 0), 0) /
        chunks.filter((c) => c.qualityScore !== undefined).length
      : null;

  const start = offset + 1;
  const end = Math.min(offset + PAGE_SIZE, offset + chunks.length);

  return (
    <div className="space-y-4">
      {/* Top bar */}
      <div className="flex flex-wrap items-center gap-4 bg-gray-900 border border-gray-800 rounded-xl p-4">
        {/* Collection selector */}
        <div className="flex items-center gap-2">
          <label className="text-xs text-gray-500 uppercase tracking-wide">Collection</label>
          <select
            value={collection}
            onChange={(e) => handleCollectionChange(e.target.value)}
            className="bg-gray-800 text-gray-200 text-sm rounded-lg px-3 py-1.5 border border-gray-700 focus:outline-none focus:border-indigo-500"
          >
            <option value="all">All</option>
            <option value="ast">AST</option>
            <option value="llm">LLM</option>
          </select>
        </div>

        {/* Min quality (LLM only) */}
        <div className="flex items-center gap-2">
          <label className="text-xs text-gray-500 uppercase tracking-wide">Min Quality</label>
          <input
            type="range"
            min={0}
            max={100}
            step={5}
            value={minQuality}
            disabled={collection !== 'llm'}
            onChange={(e) => handleQualityChange(Number(e.target.value))}
            className="w-28 accent-indigo-400 disabled:opacity-40"
          />
          <span className="text-sm text-gray-400 w-10">{minQuality}%</span>
        </div>

        {/* Pagination */}
        <div className="ml-auto flex items-center gap-3">
          <span className="text-xs text-gray-500">
            {total > 0 ? `Showing ${start}–${end} of ${total}` : 'No results'}
          </span>
          <button
            disabled={offset === 0}
            onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}
            className="px-3 py-1 text-xs rounded-lg bg-gray-800 text-gray-400 disabled:opacity-40 hover:bg-gray-700 transition-colors"
          >
            ← Prev
          </button>
          <button
            disabled={offset + PAGE_SIZE >= total}
            onClick={() => setOffset(offset + PAGE_SIZE)}
            className="px-3 py-1 text-xs rounded-lg bg-gray-800 text-gray-400 disabled:opacity-40 hover:bg-gray-700 transition-colors"
          >
            Next →
          </button>
        </div>
      </div>

      {/* Summary stats */}
      <div className="grid grid-cols-2 gap-4">
        <div className="bg-gray-900 rounded-xl border border-gray-800 p-4">
          <p className="text-xs text-gray-500 uppercase tracking-wide">Total Chunks</p>
          <p className="text-2xl font-semibold text-gray-100 mt-1">{total.toLocaleString()}</p>
        </div>
        <div className="bg-gray-900 rounded-xl border border-gray-800 p-4">
          <p className="text-xs text-gray-500 uppercase tracking-wide">Avg Quality Score</p>
          <p className="text-2xl font-semibold text-gray-100 mt-1">
            {avgQuality !== null ? `${(avgQuality * 100).toFixed(1)}%` : 'N/A'}
          </p>
        </div>
      </div>

      {/* Chunk list */}
      {loading ? (
        <Skeleton />
      ) : error ? (
        <div className="bg-red-900/20 border border-red-800 rounded-xl p-4 text-sm text-red-400">
          Failed to load chunks: {error}
        </div>
      ) : chunks.length === 0 ? (
        <div className="bg-gray-800/40 border border-gray-700 rounded-xl p-5 text-sm text-gray-500">
          No chunks found. Run indexing to populate the database.
        </div>
      ) : (
        <div className="space-y-3">
          {chunks.map((chunk) => (
            <ChunkCard key={chunk.chunkId} chunk={chunk} />
          ))}
        </div>
      )}
    </div>
  );
}
