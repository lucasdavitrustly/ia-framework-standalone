import { useEffect, useState } from 'react';
import { DashboardClient } from '../api/client.ts';
import type { CollectionInfo, SearchMetrics, SearchResult } from '../api/client.ts';
import SearchBar from '../components/search/SearchBar.tsx';
import SearchEmpty from '../components/search/SearchEmpty.tsx';
import SearchError from '../components/search/SearchError.tsx';
import SearchNoResults from '../components/search/SearchNoResults.tsx';
import SearchResultList from '../components/search/SearchResultList.tsx';
import SearchSkeleton from '../components/search/SearchSkeleton.tsx';
import NoCollectionsBlock from '../components/search/NoCollectionsBlock.tsx';
import MetricsPanel from '../components/search/MetricsPanel.tsx';
import ABComparisonLayout from '../components/search/ABComparisonLayout.tsx';

type SearchState =
  | 'blocked'
  | 'idle'
  | 'loading'
  | 'results'
  | 'no-results'
  | 'error'
  | 'comparing'
  | 'compared'
  | 'compare-error';

export default function SearchPage() {
  const [state, setState] = useState<SearchState>('idle');
  const [query, setQuery] = useState('');
  const [collection, setCollection] = useState<'both' | 'ast' | 'llm'>('both');
  const [limit, setLimit] = useState(10);
  const [threshold, setThreshold] = useState(0.3);
  const [results, setResults] = useState<SearchResult[]>([]);
  const [metrics, setMetrics] = useState<SearchMetrics | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [collections, setCollections] = useState<CollectionInfo[]>([]);
  const [abResults, setAbResults] = useState<{ ast: SearchResult[]; llm: SearchResult[] } | null>(
    null,
  );
  const [abMetrics, setAbMetrics] = useState<{
    ast: SearchMetrics;
    llm: SearchMetrics;
  } | null>(null);

  useEffect(() => {
    DashboardClient.getSearchCollections()
      .then((cols) => {
        setCollections(cols);
        if (cols.length === 0) setState('blocked');
      })
      .catch(() => {
        // Graceful — leave state as idle, collections just won't be available
      });
  }, []);

  const handleSearch = async () => {
    if (query.trim().length === 0) return;
    setState('loading');
    setExpandedId(null);
    try {
      const res = await DashboardClient.search({
        query,
        limit,
        scoreThreshold: threshold,
        collections: [collection],
      });
      if (res.results.length > 0) {
        setResults(res.results);
        setMetrics(res.metrics);
        setState('results');
      } else {
        setState('no-results');
      }
    } catch {
      setState('error');
    }
  };

  const handleCompare = async () => {
    if (query.trim().length === 0) return;
    setState('comparing');
    setExpandedId(null);
    try {
      const [astRes, llmRes] = await Promise.all([
        DashboardClient.search({
          query,
          limit,
          scoreThreshold: threshold,
          collections: ['ast'],
        }),
        DashboardClient.search({
          query,
          limit,
          scoreThreshold: threshold,
          collections: ['llm'],
        }),
      ]);
      setAbResults({ ast: astRes.results, llm: llmRes.results });
      setAbMetrics({ ast: astRes.metrics, llm: llmRes.metrics });
      setState('compared');
    } catch {
      setState('compare-error');
    }
  };

  const handleRetry = () => {
    void handleSearch();
  };

  return (
    <div className="p-8">
      <h2 className="text-xl font-semibold text-gray-100 mb-6">Search</h2>
      {state === 'blocked' ? (
        <NoCollectionsBlock />
      ) : (
        <>
          <SearchBar
            query={query}
            onQueryChange={setQuery}
            collection={collection}
            onCollectionChange={setCollection}
            limit={limit}
            onLimitChange={setLimit}
            threshold={threshold}
            onThresholdChange={setThreshold}
            onSearch={() => void handleSearch()}
            onCompare={() => void handleCompare()}
            disabled={state === 'loading' || state === 'comparing'}
            collections={collections}
          />
          {state === 'idle' && <SearchEmpty />}
          {state === 'loading' && <SearchSkeleton />}
          {state === 'error' && <SearchError onRetry={handleRetry} />}
          {state === 'compare-error' && (
            <SearchError onRetry={handleRetry} message="Comparison failed" />
          )}
          {state === 'no-results' && <SearchNoResults threshold={threshold} />}
          {state === 'results' && (
            <>
              <SearchResultList
                results={results}
                expandedId={expandedId}
                onToggleExpand={(id) => setExpandedId(expandedId === id ? null : id)}
              />
              {metrics && <MetricsPanel metrics={metrics} results={results} />}
            </>
          )}
          {state === 'compared' && abResults && abMetrics && (
            <ABComparisonLayout
              astResults={abResults.ast}
              llmResults={abResults.llm}
              astMetrics={abMetrics.ast}
              llmMetrics={abMetrics.llm}
            />
          )}
          {state === 'comparing' && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <SearchSkeleton />
              <SearchSkeleton />
            </div>
          )}
        </>
      )}
    </div>
  );
}
