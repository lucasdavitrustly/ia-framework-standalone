import { useState } from 'react';
import ChunkInspector from '../components/tuning/ChunkInspector.tsx';
import PromptVersionChart from '../components/tuning/PromptVersionChart.tsx';
import ScoreHistogram from '../components/tuning/ScoreHistogram.tsx';

type Tab = 'chunks' | 'scores' | 'prompts';

export default function TuningPage() {
  const [activeTab, setActiveTab] = useState<Tab>('chunks');

  const tabs: { id: Tab; label: string }[] = [
    { id: 'chunks', label: 'Chunk Inspector' },
    { id: 'scores', label: 'Score Distribution' },
    { id: 'prompts', label: 'Prompt Versions' },
  ];

  return (
    <div className="px-6 py-8 space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-gray-100">Tuning</h2>
        <p className="text-sm text-gray-500 mt-1">
          Inspect indexed chunks, score distributions, and prompt version performance.
        </p>
      </div>

      {/* Tab bar */}
      <div className="border-b border-gray-800 flex gap-1">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`px-4 py-2 text-sm font-medium transition-colors ${
              activeTab === tab.id
                ? 'text-indigo-400 border-b-2 border-indigo-400 -mb-px'
                : 'text-gray-500 hover:text-gray-300'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {activeTab === 'chunks' && <ChunkInspector />}
      {activeTab === 'scores' && (
        <div className="bg-gray-900 rounded-xl border border-gray-800 p-5">
          <ScoreHistogram />
        </div>
      )}
      {activeTab === 'prompts' && <PromptVersionChart />}
    </div>
  );
}
