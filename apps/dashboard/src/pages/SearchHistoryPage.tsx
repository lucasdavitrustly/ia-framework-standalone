import { useEffect, useState } from 'react';
import { DashboardClient } from '../api/client.ts';
import type {
  SearchHistoryFilters,
  SearchHistoryListResult,
  ReplayResponse,
  SearchHistoryEntry,
} from '../api/client.ts';
import SearchSkeleton from '../components/search/SearchSkeleton.tsx';
import HistoryFilterBar from '../components/search/HistoryFilterBar.tsx';
import HistoryTable from '../components/search/HistoryTable.tsx';
import ReplayDiffLayout from '../components/search/ReplayDiffLayout.tsx';

const DEFAULT_FILTERS: SearchHistoryFilters = {
  page: 1,
  pageSize: 20,
  sortBy: 'created_at',
  sortOrder: 'desc',
};

export default function SearchHistoryPage() {
  const [filters, setFilters] = useState<SearchHistoryFilters>(DEFAULT_FILTERS);
  const [data, setData] = useState<SearchHistoryListResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [replayData, setReplayData] = useState<ReplayResponse | null>(null);
  const [replayQuery, setReplayQuery] = useState<string>('');
  const [replaying, setReplaying] = useState(false);

  const loadHistory = (f: SearchHistoryFilters) => {
    setLoading(true);
    setError(null);
    DashboardClient.getSearchHistory(f)
      .then((result) => {
        setData(result);
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : 'Failed to load history');
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadHistory(filters);
  }, [filters]);

  const handleFiltersChange = (newFilters: SearchHistoryFilters) => {
    setFilters({ ...newFilters, page: 1 });
  };

  const handleSortChange = (sortBy: string, sortOrder: 'asc' | 'desc') => {
    setFilters((f) => ({ ...f, sortBy, sortOrder, page: 1 }));
  };

  const handlePageChange = (page: number) => {
    setFilters((f) => ({ ...f, page }));
  };

  const handleReplay = async (id: string) => {
    setReplaying(true);
    setReplayData(null);
    try {
      const entry: SearchHistoryEntry | undefined = data?.entries.find((e) => e.id === id);
      setReplayQuery(entry?.query ?? '');
      const result = await DashboardClient.replaySearch(id);
      setReplayData(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Replay failed');
    } finally {
      setReplaying(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await DashboardClient.deleteSearchHistoryEntry(id);
      loadHistory(filters);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Delete failed');
    }
  };

  const handleClearAll = async () => {
    if (!window.confirm('Clear all search history? This cannot be undone.')) return;
    try {
      await DashboardClient.clearSearchHistory();
      setData(null);
      loadHistory(filters);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Clear failed');
    }
  };

  const collections = ['ast', 'llm', 'both'];

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-semibold text-gray-100">Search History</h2>
        <button
          onClick={() => void handleClearAll()}
          className="text-sm px-3 py-1.5 rounded bg-red-900/40 text-red-400 hover:bg-red-900/60 border border-red-800/60"
        >
          Clear all
        </button>
      </div>

      <HistoryFilterBar
        filters={filters}
        onFiltersChange={handleFiltersChange}
        collections={collections}
      />

      {replaying && (
        <div className="mb-6">
          <SearchSkeleton />
        </div>
      )}

      {replayData && !replaying && (
        <div className="mb-6">
          <ReplayDiffLayout
            originalResults={replayData.original.results}
            freshResults={replayData.fresh.results}
            originalMetrics={replayData.original.metrics}
            freshMetrics={replayData.fresh.metrics}
            query={replayQuery}
            warning={replayData.warning}
            onClose={() => setReplayData(null)}
          />
        </div>
      )}

      {error && (
        <div className="text-red-400 text-sm mb-4 bg-red-900/20 border border-red-800/50 rounded p-3">
          {error}
        </div>
      )}

      {loading && <SearchSkeleton />}

      {!loading && data && data.entries.length === 0 && (
        <p className="text-gray-500 text-sm py-8 text-center">
          No search history yet. Searches are automatically saved.
        </p>
      )}

      {!loading && data && data.entries.length > 0 && (
        <HistoryTable
          entries={data.entries}
          total={data.total}
          page={data.page}
          pageSize={data.pageSize}
          sortBy={filters.sortBy ?? 'created_at'}
          sortOrder={filters.sortOrder ?? 'desc'}
          onSortChange={handleSortChange}
          onPageChange={handlePageChange}
          onReplay={(id) => void handleReplay(id)}
          onDelete={(id) => void handleDelete(id)}
        />
      )}
    </div>
  );
}
