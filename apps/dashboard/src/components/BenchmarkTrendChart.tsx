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
import type { ValueType, NameType } from 'recharts/types/component/DefaultTooltipContent';
import type { BenchmarkRun } from '../api/client.ts';

interface Props {
  runs: BenchmarkRun[];
}

interface ChartPoint {
  date: string;
  mrr: number;
  hitAtK: number;
  label: string;
}

export default function BenchmarkTrendChart({ runs }: Props) {
  if (runs.length < 2) {
    return (
      <div className="h-72 flex items-center justify-center text-gray-600 text-sm">
        {runs.length === 0
          ? 'No benchmark runs yet — run: ia-framework benchmark run'
          : 'Add one more run to see the trend (need ≥2)'}
      </div>
    );
  }

  const data: ChartPoint[] = [...runs]
    .sort((a, b) => a.timestamp.localeCompare(b.timestamp))
    .map(r => ({
      date: r.timestamp.slice(5, 10), // MM-DD
      mrr: Number(r.mrr.toFixed(4)),
      hitAtK: Number(r.hitAtK.toFixed(4)),
      label: r.label ?? r.runId.slice(0, 8),
    }));

  return (
    <ResponsiveContainer width="100%" height={288}>
      <LineChart data={data} margin={{ top: 4, right: 16, bottom: 0, left: 8 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
        <XAxis
          dataKey="date"
          tick={{ fill: '#9ca3af', fontSize: 12 }}
          axisLine={false}
          tickLine={false}
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
          formatter={(value: ValueType | undefined, name: NameType | undefined) => [
            typeof value === 'number' ? value.toFixed(3) : String(value ?? ''),
            name === 'mrr' ? 'MRR' : 'Hit@K',
          ]}
        />
        <Legend
          formatter={(value: string) => (value === 'mrr' ? 'MRR' : 'Hit@K')}
          wrapperStyle={{ color: '#9ca3af', fontSize: 12 }}
        />
        <Line
          type="monotone"
          dataKey="mrr"
          stroke="#6366f1"
          dot={{ fill: '#6366f1', r: 4 }}
          activeDot={{ r: 6 }}
          strokeWidth={2}
        />
        <Line
          type="monotone"
          dataKey="hitAtK"
          stroke="#10b981"
          dot={{ fill: '#10b981', r: 4 }}
          activeDot={{ r: 6 }}
          strokeWidth={2}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}
