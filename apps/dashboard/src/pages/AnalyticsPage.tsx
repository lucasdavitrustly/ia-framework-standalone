import { useEffect, useState } from 'react';
import { DashboardClient } from '../api/client.ts';
import type {
  BenchmarkTrendPoint,
  StrategyComparisonRow,
  ScoreDistributionEntry,
  TokenBreakdownEntry,
} from '../api/client.ts';
import BenchmarkTrendChart from '../components/analytics/BenchmarkTrendChart.tsx';
import StrategyComparisonChart from '../components/analytics/StrategyComparisonChart.tsx';
import StrategyComparisonTable from '../components/analytics/StrategyComparisonTable.tsx';
import ScoreDistributionChart from '../components/analytics/ScoreDistributionChart.tsx';
import TokenBreakdownChart from '../components/analytics/TokenBreakdownChart.tsx';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function SectionCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-gray-900 rounded-xl border border-gray-800 p-5">
      <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-4">{title}</h3>
      {children}
    </div>
  );
}

function Skeleton() {
  return <div className="h-64 bg-gray-800/50 rounded-lg animate-pulse" />;
}

function SectionError({ message }: { message: string }) {
  return <p className="text-sm text-red-400 py-4">{message}</p>;
}

// ─── Analytics Page ───────────────────────────────────────────────────────────

interface SectionState<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
}

function useFetch<T>(fetcher: () => Promise<T>): SectionState<T> {
  const [state, setState] = useState<SectionState<T>>({
    data: null,
    loading: true,
    error: null,
  });

  useEffect(() => {
    fetcher()
      .then((data) => setState({ data, loading: false, error: null }))
      .catch((err: unknown) => setState({ data: null, loading: false, error: String(err) }));
  }, []);

  return state;
}

export default function AnalyticsPage() {
  const trends = useFetch<BenchmarkTrendPoint[]>(() =>
    DashboardClient.getAnalyticsBenchmarkTrends(),
  );
  const strategies = useFetch<StrategyComparisonRow[]>(() =>
    DashboardClient.getAnalyticsStrategyComparison(),
  );
  const distributions = useFetch<ScoreDistributionEntry[]>(() =>
    DashboardClient.getAnalyticsScoreDistribution(),
  );
  const tokens = useFetch<TokenBreakdownEntry[]>(() =>
    DashboardClient.getAnalyticsTokenBreakdown(),
  );

  const allEmpty =
    !trends.loading &&
    !strategies.loading &&
    !distributions.loading &&
    !tokens.loading &&
    (trends.data?.length ?? 0) === 0 &&
    (strategies.data?.length ?? 0) === 0 &&
    (distributions.data?.length ?? 0) === 0 &&
    (tokens.data?.length ?? 0) === 0;

  return (
    <div className="px-6 py-8 space-y-6">
      <h2 className="text-xl font-semibold text-gray-100">Analytics</h2>

      {allEmpty && (
        <div className="bg-gray-800/40 border border-gray-700 rounded-xl p-5 text-sm text-gray-500">
          No analytics data yet. Run{' '}
          <code className="text-gray-300 bg-gray-800 px-1.5 py-0.5 rounded text-xs">
            ia-framework benchmark run
          </code>{' '}
          to populate benchmark charts, or use the search page to populate token usage.
        </div>
      )}

      {/* Benchmark Quality Trends */}
      <SectionCard title="Benchmark Quality Trends">
        {trends.loading ? (
          <Skeleton />
        ) : trends.error ? (
          <SectionError message={`Failed to load trends: ${trends.error}`} />
        ) : (
          <BenchmarkTrendChart data={trends.data ?? []} />
        )}
      </SectionCard>

      {/* Strategy Comparison */}
      <SectionCard title="Strategy Comparison">
        {strategies.loading ? (
          <Skeleton />
        ) : strategies.error ? (
          <SectionError message={`Failed to load comparison: ${strategies.error}`} />
        ) : (
          <div className="space-y-5">
            <StrategyComparisonChart data={strategies.data ?? []} />
            <div className="border-t border-gray-800 pt-4">
              <StrategyComparisonTable data={strategies.data ?? []} />
            </div>
          </div>
        )}
      </SectionCard>

      {/* Score Distributions */}
      <SectionCard title="Score Distributions (Reciprocal Rank)">
        {distributions.loading ? (
          <Skeleton />
        ) : distributions.error ? (
          <SectionError message={`Failed to load distributions: ${distributions.error}`} />
        ) : (
          <ScoreDistributionChart data={distributions.data ?? []} />
        )}
      </SectionCard>

      {/* Token Usage by Strategy */}
      <SectionCard title="Token Usage by Strategy">
        {tokens.loading ? (
          <Skeleton />
        ) : tokens.error ? (
          <SectionError message={`Failed to load token data: ${tokens.error}`} />
        ) : (
          <TokenBreakdownChart data={tokens.data ?? []} />
        )}
      </SectionCard>
    </div>
  );
}
