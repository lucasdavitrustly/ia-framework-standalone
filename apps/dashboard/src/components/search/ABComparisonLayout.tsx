import { useState } from 'react';
import type { SearchMetrics, SearchResult } from '../../api/client.ts';
import SearchResultList from './SearchResultList.tsx';
import MetricsPanel from './MetricsPanel.tsx';
import ABComparisonSummary from './ABComparisonSummary.tsx';

interface ABComparisonLayoutProps {
  astResults: SearchResult[];
  llmResults: SearchResult[];
  astMetrics: SearchMetrics;
  llmMetrics: SearchMetrics;
}

function computeOverlaps(
  astResults: SearchResult[],
  llmResults: SearchResult[],
): { astOverlaps: Set<string>; llmOverlaps: Set<string>; overlapCount: number } {
  const astOverlaps = new Set<string>();
  const llmOverlaps = new Set<string>();

  for (const ast of astResults) {
    for (const llm of llmResults) {
      if (
        ast.filePath === llm.filePath &&
        ast.startLine <= llm.endLine &&
        llm.startLine <= ast.endLine
      ) {
        astOverlaps.add(ast.id);
        llmOverlaps.add(llm.id);
      }
    }
  }

  return { astOverlaps, llmOverlaps, overlapCount: astOverlaps.size };
}

export default function ABComparisonLayout({
  astResults,
  llmResults,
  astMetrics,
  llmMetrics,
}: ABComparisonLayoutProps) {
  const [astExpandedId, setAstExpandedId] = useState<string | null>(null);
  const [llmExpandedId, setLlmExpandedId] = useState<string | null>(null);

  const { astOverlaps, llmOverlaps, overlapCount } = computeOverlaps(astResults, llmResults);

  return (
    <div>
      <ABComparisonSummary
        astMetrics={astMetrics}
        llmMetrics={llmMetrics}
        overlapCount={overlapCount}
      />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-4">
        {/* AST Column */}
        <div>
          <h3 className="text-sm font-semibold text-blue-300 mb-3 flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-blue-500" />
            AST Chunking
          </h3>
          <SearchResultList
            results={astResults}
            expandedId={astExpandedId}
            onToggleExpand={(id) => setAstExpandedId(astExpandedId === id ? null : id)}
            overlaps={astOverlaps}
          />
          <MetricsPanel metrics={astMetrics} results={astResults} />
        </div>

        {/* LLM Column */}
        <div>
          <h3 className="text-sm font-semibold text-purple-300 mb-3 flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-purple-500" />
            LLM Chunking
          </h3>
          <SearchResultList
            results={llmResults}
            expandedId={llmExpandedId}
            onToggleExpand={(id) => setLlmExpandedId(llmExpandedId === id ? null : id)}
            overlaps={llmOverlaps}
          />
          <MetricsPanel metrics={llmMetrics} results={llmResults} />
        </div>
      </div>
    </div>
  );
}
