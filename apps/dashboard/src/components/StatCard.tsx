import Tooltip from './Tooltip.tsx';

interface StatCardProps {
  label: string;
  value: string | number;
  sub?: string;
  tooltip?: string;
  loading?: boolean;
  error?: boolean;
}

export default function StatCard({ label, value, sub, tooltip, loading, error }: StatCardProps) {
  return (
    <div className="bg-gray-900 rounded-xl border border-gray-800 p-5">
      <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">
        {tooltip ? (
          <Tooltip text={tooltip}>
            <span>
              {label} <span className="text-gray-600">ℹ</span>
            </span>
          </Tooltip>
        ) : (
          label
        )}
      </p>
      {loading ? (
        <div className="mt-2 h-8 w-24 bg-gray-800 rounded animate-pulse" />
      ) : error ? (
        <p className="mt-2 text-2xl font-bold text-red-400">—</p>
      ) : (
        <p className="mt-2 text-2xl font-bold text-gray-100">{value}</p>
      )}
      {sub && !loading && !error && <p className="mt-1 text-xs text-gray-500">{sub}</p>}
    </div>
  );
}
