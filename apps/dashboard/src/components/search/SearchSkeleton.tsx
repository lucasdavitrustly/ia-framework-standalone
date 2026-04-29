export default function SearchSkeleton() {
  return (
    <div className="rounded-lg border border-gray-800 overflow-hidden">
      {/* Header skeleton */}
      <div className="flex items-center px-4 py-3 bg-gray-800/60">
        <div className="h-3 w-16 bg-gray-700 rounded animate-pulse" />
      </div>
      {/* Row skeletons × 5 */}
      {Array.from({ length: 5 }, (_, i) => (
        <div key={i} className="flex items-center gap-4 px-4 py-3 border-t border-gray-800">
          <div className="flex-1 h-4 bg-gray-800 rounded animate-pulse" />
          <div className="w-16 h-4 bg-gray-800 rounded animate-pulse" />
          <div className="w-12 h-4 bg-gray-800 rounded animate-pulse" />
          <div className="w-14 h-5 bg-gray-800 rounded animate-pulse" />
          <div className="w-16 h-4 bg-gray-800 rounded animate-pulse" />
        </div>
      ))}
    </div>
  );
}
