export default function NoCollectionsBlock() {
  return (
    <div className="py-16 text-center bg-gray-900 rounded-xl border border-gray-800">
      <div className="w-12 h-12 mx-auto mb-4 rounded-full bg-gray-800 flex items-center justify-center">
        <span className="text-xl text-gray-500">⚙</span>
      </div>
      <p className="text-lg font-semibold text-gray-300 mb-2">No collections indexed</p>
      <p className="text-sm text-gray-500 max-w-md mx-auto leading-relaxed mb-4">
        Run{' '}
        <code className="text-indigo-300 bg-gray-800 px-1.5 py-0.5 rounded">
          ia-framework index
        </code>{' '}
        to index your codebase before searching. This creates the vector embeddings needed for
        semantic search.
      </p>
    </div>
  );
}
