import { useEffect, useState } from 'react';
import { DashboardClient } from '../api/client.ts';
import type { ProjectConfig } from '../api/client.ts';

function Field({ label, value }: { label: string; value: string | undefined | null }) {
  return (
    <div className="py-3 border-b border-gray-800 last:border-0">
      <p className="text-xs text-gray-500 uppercase tracking-wider">{label}</p>
      <p className="mt-0.5 text-sm text-gray-200">
        {value ?? <span className="text-gray-600">—</span>}
      </p>
    </div>
  );
}

export default function Config() {
  const [config, setConfig] = useState<ProjectConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    DashboardClient.getConfig()
      .then(setConfig)
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="p-8 text-gray-500 text-sm">Loading config…</div>;
  if (error) return <div className="p-8 text-red-400 text-sm">Failed to load config: {error}</div>;
  if (!config) return null;

  const profile = config.profile;

  return (
    <div className="p-8 max-w-2xl">
      <h2 className="text-xl font-semibold text-gray-100 mb-6">Project Config</h2>

      {/* Project profile */}
      <section className="bg-gray-900 rounded-xl border border-gray-800 p-5 mb-6">
        <h3 className="text-xs font-semibold text-indigo-400 uppercase tracking-wider mb-3">
          Project Profile
        </h3>
        <Field label="Target Project" value={config.targetProjectPath} />
        <Field label="Languages" value={profile?.languages.join(', ')} />
        <Field label="Frameworks" value={profile?.frameworks.join(', ')} />
        <Field label="Package Manager" value={profile?.packageManager} />
        <Field label="Test Runner" value={profile?.testRunner} />
        <Field label="Build Command" value={profile?.buildCommand} />
        <Field label="Dev Command" value={profile?.devCommand} />
      </section>

      {/* Embedding config */}
      <section className="bg-gray-900 rounded-xl border border-gray-800 p-5 mb-6">
        <h3 className="text-xs font-semibold text-indigo-400 uppercase tracking-wider mb-3">
          Embedding
        </h3>
        <Field label="Provider" value={config.embedding.provider} />
        <Field label="Model" value={config.embedding.model} />
      </section>

      {/* Vector store config */}
      <section className="bg-gray-900 rounded-xl border border-gray-800 p-5">
        <h3 className="text-xs font-semibold text-indigo-400 uppercase tracking-wider mb-3">
          Vector Store (Qdrant)
        </h3>
        <Field label="Host" value={config.vectorStore.host} />
        <Field label="Port" value={String(config.vectorStore.port)} />
        <Field label="Collection" value={config.vectorStore.collectionName} />
      </section>
    </div>
  );
}
