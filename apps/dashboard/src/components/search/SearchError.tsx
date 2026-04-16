interface SearchErrorProps {
  onRetry: () => void;
  message?: string;
}

export default function SearchError({ onRetry, message }: SearchErrorProps) {
  const isComparison = message?.includes('Comparison');
  return (
    <div className="rounded-lg border border-red-700 bg-red-900/20 p-6 text-center">
      <p className="text-sm font-semibold text-red-300 mb-2">
        {isComparison ? 'Comparison failed' : 'Search failed'}
      </p>
      <p className="text-sm text-gray-400 mb-4">
        {isComparison
          ? 'Could not complete the A/B comparison. Both searches must succeed for a valid comparison.'
          : 'The vector database may be unreachable. Check that Qdrant is running and try again.'}
      </p>
      <button
        onClick={onRetry}
        className="px-4 py-2 bg-gray-800 hover:bg-gray-700 text-gray-200 rounded-lg text-sm transition-colors"
      >
        Retry
      </button>
    </div>
  );
}
