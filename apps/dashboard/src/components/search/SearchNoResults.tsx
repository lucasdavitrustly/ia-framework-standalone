interface SearchNoResultsProps {
  threshold: number;
}

export default function SearchNoResults({ threshold }: SearchNoResultsProps) {
  return (
    <div className="py-16 text-center">
      <p className="text-lg font-semibold text-gray-300 mb-3">No results found</p>
      <p className="text-sm text-gray-500 max-w-md mx-auto leading-relaxed">
        Try broadening your search:
      </p>
      <ul className="mt-3 text-sm text-gray-500 space-y-1">
        <li>• Lower the score threshold (currently {threshold})</li>
        <li>• Increase the result limit</li>
        <li>• Use different keywords or phrasing</li>
      </ul>
    </div>
  );
}
