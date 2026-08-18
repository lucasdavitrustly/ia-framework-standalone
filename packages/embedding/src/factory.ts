import type { EmbeddingProvider } from './interface.js';
import type { EmbeddingProviderConfig } from '@ia-framework/core';
import { requestSignal } from './http.js';
import { OpenAIEmbeddingProvider } from './providers/openai.js';
import { OllamaEmbeddingProvider } from './providers/ollama.js';

// Default dimensions per well-known models
export const DEFAULT_DIMENSIONS: Record<string, number> = {
  'text-embedding-3-small': 1536,
  'text-embedding-3-large': 3072,
  'text-embedding-ada-002': 1536,
  'nomic-embed-text': 768,
  'mxbai-embed-large': 1024,
  'all-minilm': 384,
  'qwen3-embedding:0.6b': 1024,
  'qwen3-embedding:1.7b': 2048,
  'qwen3-embedding:4b': 2560,
};

export function createEmbeddingProvider(config: EmbeddingProviderConfig): EmbeddingProvider {
  const dimensions = config.dimensions ?? DEFAULT_DIMENSIONS[config.model] ?? 1536;

  switch (config.provider) {
    case 'openai':
      return new OpenAIEmbeddingProvider({
        model: config.model,
        apiKey: config.apiKey ?? '',
        baseUrl: config.baseUrl,
        dimensions,
        prefixes: config.prefixes,
      });

    case 'ollama':
      return new OllamaEmbeddingProvider({
        model: config.model,
        baseUrl: config.baseUrl,
        dimensions,
        prefixes: config.prefixes,
      });

    default: {
      // TypeScript exhaustiveness — provider is 'never' here in strict mode
      const p = config.provider;
      throw new Error(`Unknown provider: ${String(p)}. Supported: openai, ollama`);
    }
  }
}

/**
 * Discover the embedding dimensions for a given model.
 *
 * Strategy (in priority order):
 * 1. Check DEFAULT_DIMENSIONS map (no API call).
 * 2. Query Ollama /api/show for model_info.*.embedding_length.
 * 3. Probe via /api/embed with a test input and measure vector length.
 * 4. Throw if all strategies fail.
 */
export async function discoverDimensions(
  model: string,
  baseUrl = 'http://localhost:11434',
): Promise<number> {
  // Priority 1: Check known models (strip :latest suffix)
  const normalised = model.replace(/:latest$/, '');
  const known = DEFAULT_DIMENSIONS[model] ?? DEFAULT_DIMENSIONS[normalised];
  if (known) return known;

  // Priority 2: Try /api/show
  try {
    const res = await fetch(`${baseUrl}/api/show`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model }),
      signal: requestSignal(),
    });
    if (res.ok) {
      const info = (await res.json()) as { model_info?: Record<string, unknown> };
      const entry = Object.entries(info.model_info ?? {}).find(([key]) =>
        key.endsWith('.embedding_length'),
      );
      if (entry && typeof entry[1] === 'number') return entry[1];
    }
  } catch {
    /* continue to fallback */
  }

  // Priority 3: Probe via /api/embed
  const embedRes = await fetch(`${baseUrl}/api/embed`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, input: 'dimension probe' }),
    signal: requestSignal(),
  });
  if (!embedRes.ok) {
    throw new Error(
      `Cannot determine dimensions for model "${model}". Specify dimensions in project.json.`,
    );
  }
  const embedResult = (await embedRes.json()) as { embeddings: number[][] };
  const vec = embedResult.embeddings[0];
  if (!vec || vec.length === 0) {
    throw new Error(`Model "${model}" returned empty embedding vector.`);
  }
  return vec.length;
}
