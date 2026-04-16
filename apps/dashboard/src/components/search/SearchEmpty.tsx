export default function SearchEmpty() {
  return (
    <div className="py-16 text-center">
      <p className="text-lg font-semibold text-gray-300 mb-3">Search your indexed codebase</p>
      <p className="text-sm text-gray-500 max-w-md mx-auto leading-relaxed">
        Enter a natural language query to find relevant code chunks. Try queries like:
      </p>
      <div className="mt-4 flex flex-col items-center gap-2">
        <code className="text-sm text-indigo-300 bg-gray-800 px-3 py-1 rounded">
          &quot;authentication middleware&quot;
        </code>
        <code className="text-sm text-indigo-300 bg-gray-800 px-3 py-1 rounded">
          &quot;error handling patterns&quot;
        </code>
        <code className="text-sm text-indigo-300 bg-gray-800 px-3 py-1 rounded">
          &quot;database connection setup&quot;
        </code>
      </div>
    </div>
  );
}
