import type { ValueType, NameType } from 'recharts/types/component/DefaultTooltipContent';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import type { BenchmarkTrendPoint } from '../../api/client.ts';

interface Props {
  data: BenchmarkTrendPoint[];
}

export default function BenchmarkTrendChart({ data }: Props) {
  if (data.length === 0) {
    return (
      <div className="h-72 flex items-center justify-center text-gray-600 text-sm">
        No benchmark runs yet
      </div>
    );
  }

  const chartData = data.map((d) => ({
    ...d,
    date: d.timestamp.slice(0, 10), // YYYY-MM-DD
    label: d.label ?? d.collectionName,
    mrrPct: Math.round(d.mrr * 100),
    hitAtKPct: Math.round(d.hitAtK * 100),
  }));

  return (
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
            name === 'mrrPct' ? 'MRR' : 'Hit@K',
          ]}
        />
        <Legend
          formatter={(value: string) => (value === 'mrrPct' ? 'MRR' : 'Hit@K')}
          wrapperStyle={{ color: '#9ca3af', fontSize: 12 }}
        />
        <Line
          type="monotone"
          dataKey="mrrPct"
          stroke="#6366f1"
          strokeWidth={2}
          dot={{ r: 3, fill: '#6366f1' }}
          activeDot={{ r: 5 }}
        />
        <Line
          type="monotone"
          dataKey="hitAtKPct"
          stroke="#22c55e"
          strokeWidth={2}
          dot={{ r: 3, fill: '#22c55e' }}
          activeDot={{ r: 5 }}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}
