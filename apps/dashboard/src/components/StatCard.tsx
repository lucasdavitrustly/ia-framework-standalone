interface StatCardProps {
  label: string;
  value: string | number;
  sub?: string;
  loading?: boolean;
  error?: boolean;
}

export default function StatCard({ label, value, sub, loading, error }: StatCardProps) {
  return (
    <div className="bg-gray-900 rounded-xl border border-gray-800 p-5">
      <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">{label}</p>
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
