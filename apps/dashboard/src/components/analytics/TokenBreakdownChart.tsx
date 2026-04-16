import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import type { ValueType, NameType } from 'recharts/types/component/DefaultTooltipContent';
import type { TokenBreakdownEntry } from '../../api/client.ts';

interface Props {
  data: TokenBreakdownEntry[];
}

function formatTokens(v: number): string {
  return v >= 1000 ? `${(v / 1000).toFixed(1)}k` : String(v);
}

export default function TokenBreakdownChart({ data }: Props) {
  if (data.length === 0) {
    return (
      <div className="h-64 flex items-center justify-center text-gray-600 text-sm">
        No token usage data yet
      </div>
    );
  }

  const chartData = data.map((d) => ({
    name: d.strategy,
    'Total Tokens': d.totalTokens,
    'Avg/Query': d.avgTokensPerQuery,
    queries: d.totalQueries,
  }));

  return (
    <ResponsiveContainer width="100%" height={256}>
      <BarChart data={chartData} margin={{ top: 4, right: 24, bottom: 0, left: 8 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#374151" vertical={false} />
        <XAxis
          dataKey="name"
          tick={{ fill: '#9ca3af', fontSize: 12 }}
          axisLine={false}
          tickLine={false}
        />
        <YAxis
          yAxisId="left"
          tickFormatter={formatTokens}
          tick={{ fill: '#9ca3af', fontSize: 12 }}
          axisLine={false}
          tickLine={false}
        />
        <YAxis
          yAxisId="right"
          orientation="right"
          tickFormatter={formatTokens}
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
            typeof value === 'number' ? value.toLocaleString() : String(value ?? ''),
            String(name ?? ''),
          ]}
        />
        <Legend wrapperStyle={{ color: '#9ca3af', fontSize: 12 }} />
        <Bar yAxisId="left" dataKey="Total Tokens" fill="#6366f1" radius={[4, 4, 0, 0]} />
        <Bar yAxisId="right" dataKey="Avg/Query" fill="#f59e0b" radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}
