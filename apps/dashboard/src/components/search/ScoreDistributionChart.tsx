import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from 'recharts';
import type { SearchResult } from '../../api/client.ts';

interface ScoreDistributionChartProps {
  results: SearchResult[];
}

export default function ScoreDistributionChart({ results }: ScoreDistributionChartProps) {
  const chartData = results.map((r, i) => ({
    rank: i + 1,
    score: r.score,
    source: r.source,
    filePath: r.filePath,
  }));

  const hasBothSources = new Set(results.map((r) => r.source)).size > 1;

  return (
    <div>
      <ResponsiveContainer width="100%" height={200}>
        <BarChart data={chartData} margin={{ top: 4, right: 16, bottom: 0, left: 8 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#374151" vertical={false} />
          <XAxis
            dataKey="rank"
            tick={{ fill: '#9ca3af', fontSize: 12 }}
            axisLine={false}
            tickLine={false}
            label={{
              value: 'Result Rank',
              position: 'insideBottom',
              offset: -5,
              fill: '#6b7280',
              fontSize: 11,
            }}
          />
          <YAxis
            domain={[0, 1]}
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
            formatter={(value) => (typeof value === 'number' ? value.toFixed(3) : String(value))}
            labelFormatter={(label) => `Rank ${String(label)}`}
          />
          <Bar dataKey="score" radius={[4, 4, 0, 0]}>
            {chartData.map((entry, i) => (
              <Cell key={i} fill={entry.source === 'ast' ? '#3b82f6' : '#a855f7'} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
      {hasBothSources && (
        <div className="flex items-center gap-4 mt-2 text-xs text-gray-500">
          <span className="flex items-center gap-1">
            <span className="w-3 h-3 rounded bg-blue-500" />
            AST
          </span>
          <span className="flex items-center gap-1">
            <span className="w-3 h-3 rounded bg-purple-500" />
            LLM
          </span>
        </div>
      )}
    </div>
  );
}
