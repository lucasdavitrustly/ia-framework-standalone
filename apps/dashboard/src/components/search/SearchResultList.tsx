import type { SearchResult } from '../../api/client.ts';
import SearchResultRow from './SearchResultRow.tsx';

interface SearchResultListProps {
  results: SearchResult[];
  expandedId: string | null;
  onToggleExpand: (id: string) => void;
  overlaps?: Set<string>;
}

export default function SearchResultList({
  results,
  expandedId,
  onToggleExpand,
  overlaps,
}: SearchResultListProps) {
  return (
    <div className="rounded-lg border border-gray-800 overflow-hidden">
      <div className="flex items-center px-4 py-3 bg-gray-800/60 text-xs text-gray-500 uppercase tracking-wider">
        <span className="flex-1">File</span>
        <span className="w-24">Lines</span>
        <span className="w-20">Score</span>
        <span className="w-20">Source</span>
        <span className="w-24">Type</span>
      </div>
      {results.map((result) => (
        <SearchResultRow
          key={result.id}
          result={result}
          expanded={expandedId === result.id}
          onToggle={() => onToggleExpand(result.id)}
          overlapBadge={overlaps?.has(result.id) ?? false}
        />
      ))}
    </div>
  );
}
