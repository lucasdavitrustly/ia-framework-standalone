export default function Benchmarks() {
  return (
    <div className="p-8">
      <h2 className="text-xl font-semibold text-gray-100 mb-6">Benchmarks</h2>
      <div className="bg-gray-900 rounded-xl border border-gray-800 p-6 mb-6">
        <p className="text-sm text-gray-400">Benchmark score trend — loading in next update</p>
        <div className="h-48 mt-4 bg-gray-800/50 rounded-lg animate-pulse" />
      </div>
      <div className="bg-gray-900 rounded-xl border border-gray-800 p-6">
        <p className="text-sm text-gray-400">Run history — loading in next update</p>
      </div>
    </div>
  );
}
