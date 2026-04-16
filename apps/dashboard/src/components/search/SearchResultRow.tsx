import type { SearchResult } from '../../api/client.ts';
import SourceTag from './SourceTag.tsx';

interface SearchResultRowProps {
  result: SearchResult;
  expanded: boolean;
  onToggle: () => void;
  overlapBadge?: boolean;
}

export default function SearchResultRow({
  result,
  expanded,
  onToggle,
  overlapBadge = false,
}: SearchResultRowProps) {
  return (
    <div>
      <div
        onClick={onToggle}
        className="flex items-center px-4 py-3 border-t border-gray-800 hover:bg-gray-800/40 cursor-pointer text-sm text-gray-300"
      >
        <span className="flex-1 truncate font-mono text-gray-200">
          {result.filePath}
          {overlapBadge && (
            <span className="ml-2 px-1.5 py-0.5 rounded text-xs bg-amber-900/30 text-amber-400">
              shared
            </span>
          )}
        </span>
        <span className="w-24 text-gray-400">
          {result.startLine}–{result.endLine}
        </span>
        <span className="w-20 font-mono">{result.score.toFixed(3)}</span>
        <span className="w-20">
          <SourceTag source={result.source} />
        </span>
        <span className="w-24 text-gray-500">{result.chunkType}</span>
      </div>
      {expanded && (
        <div className="bg-gray-900 border-t border-gray-800 px-4 py-4">
          <div className="flex items-center gap-2 mb-2 text-xs text-gray-500">
            <span>Matched vector: {result.matchedVector}</span>
          </div>
          {result.description && <p className="text-sm text-gray-400 mb-2">{result.description}</p>}
          <pre className="bg-gray-950 rounded-lg p-4 text-sm font-mono text-gray-300 overflow-x-auto max-h-64 overflow-y-auto leading-relaxed">
            {result.content}
          </pre>
        </div>
      )}
    </div>
  );
}
