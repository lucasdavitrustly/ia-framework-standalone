import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import type { ValueType, NameType } from 'recharts/types/component/DefaultTooltipContent';
import type { DailyTokenUsage } from '../api/client.ts';

interface Props {
  data: DailyTokenUsage[];
}

function formatY(value: number): string {
  return value >= 1000 ? `${(value / 1000).toFixed(1)}k` : String(value);
}

export default function DailyTokenChart({ data }: Props) {
  if (data.length === 0) {
    return (
      <div className="h-72 flex items-center justify-center text-gray-600 text-sm">
        No token usage recorded yet
      </div>
    );
  }

  const chartData = data.map(d => ({ ...d, date: d.date.slice(5) })); // MM-DD

  return (
    <ResponsiveContainer width="100%" height={288}>
      <BarChart data={chartData} margin={{ top: 4, right: 16, bottom: 0, left: 8 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#374151" vertical={false} />
        <XAxis
          dataKey="date"
          tick={{ fill: '#9ca3af', fontSize: 12 }}
          axisLine={false}
          tickLine={false}
        />
        <YAxis
          tickFormatter={formatY}
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
            name === 'totalTokens' ? 'Tokens' : 'Queries',
          ]}
        />
        <Bar dataKey="totalTokens" fill="#6366f1" radius={[4, 4, 0, 0]} name="totalTokens" />
      </BarChart>
    </ResponsiveContainer>
  );
}
