import type { ScoreAnalysisResponse, ScoreCandidate } from '../../api/client.ts';
import SourceTag from '../search/SourceTag.tsx';

interface NearMissPanelProps {
  data: ScoreAnalysisResponse;
  threshold: number;
}

// ─── Result Row ────────────────────────────────────────────────────────────────

function CandidateRow({ candidate }: { candidate: ScoreCandidate }) {
  return (
    <div className="flex items-start px-3 py-2 border-t border-gray-800 text-sm text-gray-300 hover:bg-gray-800/30">
      <span className="flex-1 min-w-0 font-mono text-xs text-gray-200 truncate">
        {candidate.filePath}
      </span>
      <span className="w-20 text-gray-400 text-xs shrink-0">
        {candidate.startLine}–{candidate.endLine}
      </span>
      <span className="w-20 font-mono text-xs shrink-0">
        {candidate.scoreType === 'rrf' ? (
          <>
            <span className="text-yellow-500 mr-0.5">rrf</span>
            {candidate.score.toFixed(4)}
          </>
        ) : (
          candidate.score.toFixed(3)
        )}
      </span>
      <span className="w-14 shrink-0">
        <SourceTag source={candidate.source} />
      </span>
      <span className="w-24 text-gray-500 text-xs shrink-0">{candidate.chunkType}</span>
    </div>
  );
}

// ─── Panel ─────────────────────────────────────────────────────────────────────

export default function NearMissPanel({ data, threshold }: NearMissPanelProps) {
  const nearMissLow = threshold * 0.9;

  // Re-compute based on current (possibly dragged) threshold
  const returned = data.candidates
    .filter((c) => c.score >= threshold)
    .sort((a, b) => b.score - a.score);

  const nearMiss = data.candidates
    .filter((c) => c.score < threshold && c.score >= nearMissLow)
    .sort((a, b) => b.score - a.score);

  const lowestReturned = returned.length > 0 ? returned[returned.length - 1].score : null;
  const highestNearMiss = nearMiss.length > 0 ? nearMiss[0].score : null;

  const scoreDiff =
    lowestReturned !== null && highestNearMiss !== null ? lowestReturned - highestNearMiss : null;

  return (
    <div className="mt-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-gray-200">Near-Miss Analysis</h3>
        {scoreDiff !== null && (
          <span className="text-xs text-gray-500">
            Gap between lowest returned and highest near-miss:{' '}
            <span className="font-mono text-yellow-400">{scoreDiff.toFixed(3)}</span>
          </span>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        {/* Left: Returned Results */}
        <div className="bg-gray-900 rounded-xl border border-gray-800 overflow-hidden">
          <div className="px-4 py-2 bg-gray-800/60 flex items-center gap-2 border-b border-gray-700">
            <span className="w-2 h-2 rounded-full bg-green-500 shrink-0" />
            <span className="text-sm font-semibold text-green-300">
              Returned ({returned.length})
            </span>
            <span className="text-xs text-gray-500 ml-auto">score ≥ {threshold.toFixed(3)}</span>
          </div>
          {returned.length === 0 ? (
            <div className="px-4 py-6 text-sm text-gray-500 text-center">
              No results above threshold
            </div>
          ) : (
            <div className="overflow-y-auto max-h-72">
              {/* Column headers */}
              <div className="flex items-center px-3 py-1.5 text-xs text-gray-500 bg-gray-800/30">
                <span className="flex-1">File</span>
                <span className="w-20">Lines</span>
                <span className="w-16">Score</span>
                <span className="w-14">Source</span>
                <span className="w-24">Type</span>
              </div>
              {returned.map((c) => (
                <CandidateRow key={c.id} candidate={c} />
              ))}
            </div>
          )}
        </div>

        {/* Right: Near-Miss Results */}
        <div className="bg-gray-900 rounded-xl border border-gray-800 overflow-hidden">
          <div className="px-4 py-2 bg-gray-800/60 flex items-center gap-2 border-b border-gray-700">
            <span className="w-2 h-2 rounded-full bg-orange-500 shrink-0" />
            <span className="text-sm font-semibold text-orange-300">
              Near-Miss ({nearMiss.length})
            </span>
            <span className="text-xs text-gray-500 ml-auto">
              score {nearMissLow.toFixed(3)}–{threshold.toFixed(3)}
            </span>
          </div>
          {nearMiss.length === 0 ? (
            <div className="px-4 py-6 text-sm text-gray-500 text-center">
              No near-miss results — all filtered results are well below threshold
            </div>
          ) : (
            <div className="overflow-y-auto max-h-72">
              {/* Column headers */}
              <div className="flex items-center px-3 py-1.5 text-xs text-gray-500 bg-gray-800/30">
                <span className="flex-1">File</span>
                <span className="w-20">Lines</span>
                <span className="w-16">Score</span>
                <span className="w-14">Source</span>
                <span className="w-24">Type</span>
              </div>
              {nearMiss.map((c) => (
                <CandidateRow key={c.id} candidate={c} />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
