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
import type { StrategyComparisonRow } from '../../api/client.ts';

interface Props {
  data: StrategyComparisonRow[];
}

export default function StrategyComparisonChart({ data }: Props) {
  if (data.length === 0) {
    return (
      <div className="h-64 flex items-center justify-center text-gray-600 text-sm">
        No benchmark data yet
      </div>
    );
  }

  const chartData = data.map((d) => ({
    name: d.collectionName,
    'Avg MRR': Math.round(d.avgMrr * 100),
    'Avg Hit@K': Math.round(d.avgHitAtK * 100),
    latency: Math.round(d.avgLatencyMs),
  }));

  return (
    <ResponsiveContainer width="100%" height={256}>
      <BarChart data={chartData} margin={{ top: 4, right: 24, bottom: 0, left: 8 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#374151" vertical={false} />
        <XAxis
          dataKey="name"
          tick={{ fill: '#9ca3af', fontSize: 11 }}
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
            String(name ?? ''),
          ]}
        />
        <Legend wrapperStyle={{ color: '#9ca3af', fontSize: 12 }} />
        <Bar dataKey="Avg MRR" fill="#6366f1" radius={[4, 4, 0, 0]} />
        <Bar dataKey="Avg Hit@K" fill="#22c55e" radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}
