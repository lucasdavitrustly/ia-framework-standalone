import type { CollectionInfo } from '../../api/client.ts';

interface SearchBarProps {
  query: string;
  onQueryChange: (value: string) => void;
  collection: 'both' | 'ast' | 'llm';
  onCollectionChange: (value: 'both' | 'ast' | 'llm') => void;
  limit: number;
  onLimitChange: (value: number) => void;
  threshold: number;
  onThresholdChange: (value: number) => void;
  onSearch: () => void;
  onCompare: () => void;
  disabled: boolean;
  collections: CollectionInfo[];
}

export default function SearchBar({
  query,
  onQueryChange,
  collection,
  onCollectionChange,
  limit,
  onLimitChange,
  threshold,
  onThresholdChange,
  onSearch,
  onCompare,
  disabled,
  collections,
}: SearchBarProps) {
  const hasLlm = collections.some((c) => c.type === 'llm');
  const canCompare =
    !disabled && query.trim().length > 0 && collection === 'both' && collections.length >= 2;

  return (
    <div className="flex items-center gap-2 mb-6 flex-wrap">
      <label htmlFor="search-query" className="sr-only">
        Search query
      </label>
      <input
        id="search-query"
        type="text"
        value={query}
        onChange={(e) => onQueryChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !disabled && query.trim().length > 0) onSearch();
        }}
        placeholder="Search your codebase..."
        disabled={disabled}
        className="flex-1 min-w-[200px] bg-gray-800 border border-gray-700 rounded-lg px-4 py-2 text-sm text-gray-100 placeholder-gray-500 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none"
      />

      <label htmlFor="search-collection" className="sr-only">
        Collection
      </label>
      <select
        id="search-collection"
        value={collection}
        onChange={(e) => onCollectionChange(e.target.value as 'both' | 'ast' | 'llm')}
        disabled={disabled}
        className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-100 focus:border-indigo-500 outline-none"
      >
        <option value="both">Both</option>
        <option value="ast">AST</option>
        <option
          value="llm"
          disabled={!hasLlm}
          title={
            !hasLlm
              ? 'LLM collection not available — run `ia-framework index --strategy llm` to create it'
              : undefined
          }
        >
          LLM
        </option>
      </select>

      <label htmlFor="search-limit" className="sr-only">
        Result limit
      </label>
      <select
        id="search-limit"
        value={limit}
        onChange={(e) => onLimitChange(Number(e.target.value))}
        disabled={disabled}
        className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-100 focus:border-indigo-500 outline-none"
      >
        <option value={5}>5</option>
        <option value={10}>10</option>
        <option value={20}>20</option>
        <option value={50}>50</option>
      </select>

      <div className="flex items-center gap-1">
        <span className="text-xs text-gray-500">Min Score</span>
        <label htmlFor="search-threshold" className="sr-only">
          Minimum score threshold
        </label>
        <input
          id="search-threshold"
          type="number"
          step={0.05}
          min={0}
          max={1}
          value={threshold}
          onChange={(e) => onThresholdChange(Number(e.target.value))}
          disabled={disabled}
          className="w-20 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-100 text-center focus:border-indigo-500 outline-none"
        />
      </div>

      <button
        onClick={onSearch}
        disabled={disabled || query.trim().length === 0}
        className="bg-indigo-600 hover:bg-indigo-500 text-white px-5 py-2 rounded-lg text-sm font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {disabled ? 'Searching…' : 'Search'}
      </button>

      <button
        onClick={onCompare}
        disabled={!canCompare}
        className="border border-indigo-600 text-indigo-400 hover:bg-indigo-600/10 px-5 py-2 rounded-lg text-sm font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
      >
        Compare
      </button>
    </div>
  );
}
