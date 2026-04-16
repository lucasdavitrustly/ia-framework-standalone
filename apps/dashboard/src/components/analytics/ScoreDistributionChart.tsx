import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import type { ValueType, NameType } from 'recharts/types/component/DefaultTooltipContent';
import type { ScoreDistributionEntry } from '../../api/client.ts';

interface Props {
  data: ScoreDistributionEntry[];
}

const COLORS = ['#6366f1', '#22c55e', '#f59e0b', '#ec4899', '#14b8a6'];

export default function ScoreDistributionChart({ data }: Props) {
  if (data.length === 0) {
    return (
      <div className="h-48 flex items-center justify-center text-gray-600 text-sm">
        No benchmark data yet
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {data.map((entry, idx) => (
        <div key={entry.collectionName}>
          <div className="flex items-center gap-2 mb-2">
            <span
              className="inline-block w-2 h-2 rounded-full"
              style={{ backgroundColor: COLORS[idx % COLORS.length] }}
            />
            <p className="text-xs font-medium text-gray-400 font-mono">{entry.collectionName}</p>
            <span className="text-xs text-gray-600">({entry.totalQueries} queries)</span>
          </div>
          <ResponsiveContainer width="100%" height={160}>
            <BarChart data={entry.buckets} margin={{ top: 4, right: 16, bottom: 0, left: 8 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#374151" vertical={false} />
              <XAxis
                dataKey="label"
                tick={{ fill: '#9ca3af', fontSize: 10 }}
                axisLine={false}
                tickLine={false}
                interval={0}
              />
              <YAxis
                allowDecimals={false}
                tick={{ fill: '#9ca3af', fontSize: 11 }}
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
                  typeof value === 'number' ? value : String(value ?? ''),
                  String(name ?? 'Queries'),
                ]}
              />
              <Bar
                dataKey="count"
                name="Queries"
                fill={COLORS[idx % COLORS.length]}
                radius={[4, 4, 0, 0]}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
      ))}
    </div>
  );
}
