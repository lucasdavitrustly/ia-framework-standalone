import { useRef } from 'react';
import type { SearchHistoryFilters } from '../../api/client.ts';

interface HistoryFilterBarProps {
  filters: SearchHistoryFilters;
  onFiltersChange: (filters: SearchHistoryFilters) => void;
  collections: string[];
}

export default function HistoryFilterBar({
  filters,
  onFiltersChange,
  collections,
}: HistoryFilterBarProps) {
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleTextChange = (value: string) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      onFiltersChange({ ...filters, q: value || undefined, page: 1 });
    }, 300);
  };

  const inputClass =
    'bg-gray-800 border border-gray-700 text-gray-200 rounded px-2 py-1.5 text-sm focus:outline-none focus:border-indigo-500';

  return (
    <div className="flex flex-wrap items-center gap-3 mb-4">
      <input
        type="text"
        defaultValue={filters.q ?? ''}
        onChange={(e) => handleTextChange(e.target.value)}
        placeholder="Filter by query..."
        className={`${inputClass} w-48`}
      />

      <select
        value={filters.collection ?? ''}
        onChange={(e) =>
          onFiltersChange({ ...filters, collection: e.target.value || undefined, page: 1 })
        }
        className={inputClass}
      >
        <option value="">All collections</option>
        {collections.map((c) => (
          <option key={c} value={c}>
            {c}
          </option>
        ))}
      </select>

      <div className="flex items-center gap-1.5">
        <label className="text-xs text-gray-500">From</label>
        <input
          type="date"
          value={filters.dateFrom ?? ''}
          onChange={(e) =>
            onFiltersChange({ ...filters, dateFrom: e.target.value || undefined, page: 1 })
          }
          className={inputClass}
        />
      </div>

      <div className="flex items-center gap-1.5">
        <label className="text-xs text-gray-500">To</label>
        <input
          type="date"
          value={filters.dateTo ?? ''}
          onChange={(e) =>
            onFiltersChange({ ...filters, dateTo: e.target.value || undefined, page: 1 })
          }
          className={inputClass}
        />
      </div>

      <input
        type="number"
        value={filters.minScore ?? ''}
        onChange={(e) =>
          onFiltersChange({
            ...filters,
            minScore: e.target.value ? parseFloat(e.target.value) : undefined,
            page: 1,
          })
        }
        placeholder="Min score"
        step={0.1}
        min={0}
        max={1}
        className={`${inputClass} w-24`}
      />
    </div>
  );
}
