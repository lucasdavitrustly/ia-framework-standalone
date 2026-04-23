import { useEffect, useState } from 'react';
import type { ValueType, NameType } from 'recharts/types/component/DefaultTooltipContent';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { DashboardClient } from '../../api/client.ts';
import type { BenchmarkTrendPoint } from '../../api/client.ts';
import BenchmarkDetailPanel from './BenchmarkDetailPanel.tsx';

// Color palette for prompt versions
const VERSION_COLORS = [
  '#6366f1', // indigo
  '#22c55e', // green
  '#f59e0b', // amber
  '#ec4899', // pink
  '#06b6d4', // cyan
  '#a855f7', // purple
  '#f97316', // orange
  '#14b8a6', // teal
];
const UNKNOWN_COLOR = '#6b7280'; // gray

function getVersionColor(version: number | undefined, versionList: number[]): string {
  if (version === undefined) return UNKNOWN_COLOR;
  const idx = versionList.indexOf(version);
  return idx >= 0 ? (VERSION_COLORS[idx % VERSION_COLORS.length] ?? UNKNOWN_COLOR) : UNKNOWN_COLOR;
}

interface VersionStat {
  version: number | undefined;
  label: string;
  color: string;
  runCount: number;
  avgMrr: number;
  bestMrr: number;
}

function buildVersionStats(data: BenchmarkTrendPoint[], versionList: number[]): VersionStat[] {
  const map = new Map<string, { version: number | undefined; mrrs: number[] }>();

  for (const point of data) {
    const key = point.promptVersion !== undefined ? String(point.promptVersion) : 'unknown';
    const existing = map.get(key);
    if (existing) {
      existing.mrrs.push(point.mrr);
    } else {
      map.set(key, { version: point.promptVersion, mrrs: [point.mrr] });
    }
  }

  return Array.from(map.entries()).map(([key, { version, mrrs }]) => ({
    version,
    label: key === 'unknown' ? 'Unknown' : `v${key}`,
    color: getVersionColor(version, versionList),
    runCount: mrrs.length,
    avgMrr: mrrs.reduce((s, v) => s + v, 0) / mrrs.length,
    bestMrr: Math.max(...mrrs),
  }));
}

// Custom dot renderer that colors each dot by promptVersion
interface DotProps {
  cx?: number;
  cy?: number;
  payload?: BenchmarkTrendPoint & { mrrPct: number };
  versionList: number[];
  onClickRun: (runId: string) => void;
}

function ColoredDot({ cx, cy, payload, versionList, onClickRun }: DotProps) {
  if (cx === undefined || cy === undefined || !payload) return null;
  const color = getVersionColor(payload.promptVersion, versionList);
  return (
    <circle
      cx={cx}
      cy={cy}
      r={5}
      fill={color}
      stroke="transparent"
      strokeWidth={0}
      style={{ cursor: 'pointer' }}
      onClick={() => onClickRun(payload.runId)}
    />
  );
}

function Skeleton() {
  return <div className="h-72 bg-gray-800/50 rounded-lg animate-pulse" />;
}

export default function PromptVersionChart() {
  const [data, setData] = useState<BenchmarkTrendPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);

  useEffect(() => {
    DashboardClient.getAnalyticsBenchmarkTrends(100)
      .then((trends) => {
        setData(trends);
        setLoading(false);
      })
      .catch((err: unknown) => {
        setError(String(err));
        setLoading(false);
      });
  }, []);

  const versionList = Array.from(
    new Set(data.filter((d) => d.promptVersion !== undefined).map((d) => d.promptVersion!)),
  ).sort((a, b) => a - b);

  const chartData = data.map((d) => ({
    ...d,
    date: d.timestamp.slice(0, 10),
    mrrPct: Math.round(d.mrr * 100),
  }));

  const versionStats = buildVersionStats(data, versionList);

  if (loading) return <Skeleton />;

  if (error) {
    return <p className="text-sm text-red-400 py-4">Failed to load benchmark trends: {error}</p>;
  }

  if (data.length === 0) {
    return (
      <div className="bg-gray-800/40 border border-gray-700 rounded-xl p-5 text-sm text-gray-500">
        No benchmark data yet. Run{' '}
        <code className="text-gray-300 bg-gray-800 px-1.5 py-0.5 rounded text-xs">
          ia-framework benchmark run
        </code>{' '}
        to populate this chart.
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Chart */}
      <div className="bg-gray-900 rounded-xl border border-gray-800 p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider">
            MRR Over Time
          </h3>
          <p className="text-xs text-gray-500">Click a point to see run details</p>
        </div>

        {/* Legend */}
        <div className="flex flex-wrap gap-3 mb-4">
          {versionStats.map((vs) => (
            <div key={vs.label} className="flex items-center gap-1.5">
              <span
                className="w-3 h-3 rounded-full inline-block"
                style={{ backgroundColor: vs.color }}
              />
              <span className="text-xs text-gray-400">{vs.label}</span>
            </div>
          ))}
          {versionList.length === 0 && (
            <div className="flex items-center gap-1.5">
              <span
                className="w-3 h-3 rounded-full inline-block"
                style={{ backgroundColor: UNKNOWN_COLOR }}
              />
              <span className="text-xs text-gray-400">Unknown version</span>
            </div>
          )}
        </div>

        <ResponsiveContainer width="100%" height={288}>
          <LineChart data={chartData} margin={{ top: 4, right: 24, bottom: 0, left: 8 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#374151" vertical={false} />
            <XAxis
              dataKey="date"
              tick={{ fill: '#9ca3af', fontSize: 12 }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              domain={[0, 100]}
              tickFormatter={(v: number) => `${v}%`}
              tick={{ fill: '#9ca3af', fontSize: 12 }}
              axisLine={false}
              tickLine={false}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: '#111827',
                border: '1px solid #374151',
                borderRadius: '8px',
              }}
              labelStyle={{ color: '#e5e7eb' }}
              formatter={(value: ValueType | undefined, name: NameType | undefined) => [
                typeof value === 'number' ? `${value}%` : String(value ?? ''),
                name === 'mrrPct' ? 'MRR' : String(name ?? ''),
              ]}
            />
            <Line
              type="monotone"
              dataKey="mrrPct"
              stroke={UNKNOWN_COLOR}
              strokeWidth={2}
              dot={(props) => (
                <ColoredDot
                  key={props.index}
                  cx={props.cx}
                  cy={props.cy}
                  payload={props.payload as BenchmarkTrendPoint & { mrrPct: number }}
                  versionList={versionList}
                  onClickRun={setSelectedRunId}
                />
              )}
              activeDot={{ r: 7 }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Version comparison table */}
      {versionStats.length > 0 && (
        <div className="bg-gray-900 rounded-xl border border-gray-800 p-5">
          <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-3">
            Prompt Version Comparison
          </h3>
          <table className="w-full text-sm text-left">
            <thead>
              <tr className="border-b border-gray-800">
                <th className="py-2 pr-4 text-gray-500 font-medium text-xs uppercase tracking-wide">
                  Version
                </th>
                <th className="py-2 pr-4 text-gray-500 font-medium text-xs uppercase tracking-wide">
                  Runs
                </th>
                <th className="py-2 pr-4 text-gray-500 font-medium text-xs uppercase tracking-wide">
                  Avg MRR
                </th>
                <th className="py-2 text-gray-500 font-medium text-xs uppercase tracking-wide">
                  Best MRR
                </th>
              </tr>
            </thead>
            <tbody>
              {versionStats.map((vs) => (
                <tr key={vs.label} className="border-b border-gray-800/50">
                  <td className="py-2 pr-4">
                    <div className="flex items-center gap-2">
                      <span
                        className="w-2.5 h-2.5 rounded-full inline-block"
                        style={{ backgroundColor: vs.color }}
                      />
                      <span className="text-gray-200">{vs.label}</span>
                    </div>
                  </td>
                  <td className="py-2 pr-4 text-gray-400">{vs.runCount}</td>
                  <td className="py-2 pr-4 text-gray-300">{(vs.avgMrr * 100).toFixed(1)}%</td>
                  <td className="py-2 text-gray-300">{(vs.bestMrr * 100).toFixed(1)}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Detail panel */}
      {selectedRunId && (
        <BenchmarkDetailPanel runId={selectedRunId} onClose={() => setSelectedRunId(null)} />
      )}
    </div>
  );
}
