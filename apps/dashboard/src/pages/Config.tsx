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

function EditableField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="py-3 border-b border-gray-800 last:border-0">
      <label className="text-xs text-gray-500 uppercase tracking-wider block mb-1">{label}</label>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-1.5 text-sm text-gray-200 focus:outline-none focus:border-indigo-500"
      />
    </div>
  );
}

function LlmChunkingSection({ config }: { config: ProjectConfig }) {
  const existingLlm = config.indexing?.llm;
  const [editing, setEditing] = useState(!!existingLlm);
  const [model, setModel] = useState(existingLlm?.model ?? '');
  const [ollamaUrl, setOllamaUrl] = useState(existingLlm?.ollamaUrl ?? 'http://localhost:11434');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  if (!editing) {
    return (
      <section className="bg-gray-900 rounded-xl border border-gray-800 p-5 mb-6">
        <h3 className="text-xs font-semibold text-indigo-400 uppercase tracking-wider mb-3">
          LLM Chunking
        </h3>
        <p className="text-sm text-gray-400 mb-3">No LLM chunking model configured.</p>
        <button
          onClick={() => setEditing(true)}
          className="text-xs text-indigo-400 hover:text-indigo-300 border border-indigo-400/30 rounded px-3 py-1"
        >
          Configure LLM Chunking
        </button>
      </section>
    );
  }

  const handleSave = async () => {
    if (!model.trim()) {
      setMessage({ type: 'error', text: 'Model name is required' });
      return;
    }
    setSaving(true);
    setMessage(null);
    try {
      await DashboardClient.updateConfig({
        indexing: {
          llm: { model: model.trim(), ollamaUrl: ollamaUrl.trim() },
        } as ProjectConfig['indexing'],
      });
      setMessage({ type: 'success', text: 'LLM config saved' });
    } catch (err) {
      setMessage({ type: 'error', text: `Failed to save: ${String(err)}` });
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="bg-gray-900 rounded-xl border border-gray-800 p-5 mb-6">
      <h3 className="text-xs font-semibold text-indigo-400 uppercase tracking-wider mb-3">
        LLM Chunking
      </h3>
      <EditableField label="Model" value={model} onChange={setModel} />
      <EditableField label="Ollama URL" value={ollamaUrl} onChange={setOllamaUrl} />
      <div className="mt-3 flex items-center gap-3">
        <button
          onClick={handleSave}
          disabled={saving}
          className="text-xs bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white rounded px-4 py-1.5"
        >
          {saving ? 'Saving...' : 'Save'}
        </button>
        {message && (
          <span
            className={`text-xs ${message.type === 'success' ? 'text-green-400' : 'text-red-400'}`}
          >
            {message.text}
          </span>
        )}
      </div>
    </section>
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

  if (loading) return <div className="p-8 text-gray-500 text-sm">Loading config...</div>;
  if (error)
    return (
      <div className="p-8 max-w-2xl">
        <h2 className="text-xl font-semibold text-gray-100 mb-6">Project Config</h2>
        <div className="bg-gray-900 rounded-xl border border-gray-800 p-6 text-center">
          <p className="text-gray-400 text-sm mb-2">No project configured yet</p>
          <p className="text-gray-600 text-xs">
            Run <code className="bg-gray-800 px-1 rounded">./install.sh</code> in your target
            project to generate <code className="bg-gray-800 px-1 rounded">project.json</code>
          </p>
        </div>
      </div>
    );
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

      {/* LLM Chunking config */}
      <LlmChunkingSection config={config} />

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
