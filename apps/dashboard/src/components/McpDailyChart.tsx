import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';
import type { ValueType, NameType } from 'recharts/types/component/DefaultTooltipContent';
import type { McpDailyRequestStats } from '../api/client.ts';

interface Props {
  data: McpDailyRequestStats[];
}

function formatY(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1000) return `${(value / 1000).toFixed(1)}k`;
  return String(value);
}

export default function McpDailyChart({ data }: Props) {
  if (data.length === 0) {
    return (
      <div className="h-72 flex items-center justify-center text-gray-600 text-sm">
        No MCP request data recorded yet
      </div>
    );
  }

  const chartData = data.map((d) => ({
    date: d.date.slice(5), // MM-DD
    inputTokens: d.totalInputTokens,
    outputTokens: d.totalOutputTokens,
    requests: d.requestCount,
  }));

  return (
    <ResponsiveContainer width="100%" height={288}>
      <AreaChart data={chartData} margin={{ top: 4, right: 16, bottom: 0, left: 8 }}>
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
            name === 'inputTokens' ? 'Input Tokens' : 'Output Tokens',
          ]}
        />
        <Legend
          wrapperStyle={{ color: '#9ca3af', fontSize: 12 }}
          formatter={(value: string) =>
            value === 'inputTokens' ? 'Input Tokens' : 'Output Tokens'
          }
        />
        <Area
          type="monotone"
          dataKey="inputTokens"
          stackId="1"
          stroke="#6366f1"
          fill="#6366f1"
          fillOpacity={0.4}
        />
        <Area
          type="monotone"
          dataKey="outputTokens"
          stackId="1"
          stroke="#22d3ee"
          fill="#22d3ee"
          fillOpacity={0.4}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}
