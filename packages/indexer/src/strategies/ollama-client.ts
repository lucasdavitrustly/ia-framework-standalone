/**
 * Ollama /api/generate wrapper with JSON schema enforcement.
 * Sends source code to Ollama for LLM-based semantic chunking.
 *
 * Ported from spike/llm-chunking/src/ollama-client.ts — validated with
 * 100% JSON validity and 100% determinism in Phase 12 spike.
 */

export interface OllamaGenerateResponse {
  model: string;
  response: string; // The JSON string from the model
  done: boolean;
  total_duration: number; // nanoseconds
  load_duration: number; // nanoseconds
  prompt_eval_count: number; // input tokens
  prompt_eval_duration: number; // nanoseconds
  eval_count: number; // output tokens generated
  eval_duration: number; // nanoseconds
}

export interface LLMChunk {
  startLine: number;
  endLine: number;
  summary: string;
}

export interface ChunkingResult {
  chunks: LLMChunk[];
  metrics: {
    totalDurationMs: number; // total_duration / 1e6
    promptTokens: number; // prompt_eval_count
    outputTokens: number; // eval_count
    tokensPerSec: number; // eval_count / (eval_duration / 1e9)
    loadDurationMs: number; // load_duration / 1e6
    promptEvalDurationMs: number; // prompt_eval_duration / 1e6
    evalDurationMs: number; // eval_duration / 1e6
  };
  rawResponse: string; // Raw model response for debugging
}

export interface ModelInfo {
  parameterSize: string;
  contextLength: number;
}

/** JSON schema for the chunking output — used in the format field of /api/generate */
const CHUNK_OUTPUT_SCHEMA = {
  type: 'object',
  properties: {
    chunks: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          startLine: { type: 'integer' },
          endLine: { type: 'integer' },
          summary: { type: 'string' },
        },
        required: ['startLine', 'endLine', 'summary'],
      },
    },
  },
  required: ['chunks'],
};

/**
 * Check if Ollama is reachable at the given base URL.
 * Per D-16: CLI needs a connectivity check before attempting LLM chunking.
 */
export async function isOllamaReachable(baseUrl?: string): Promise<boolean> {
  const url = `${baseUrl ?? 'http://localhost:11434'}/api/tags`;
  try {
    const response = await fetch(url);
    return response.ok;
  } catch {
    return false;
  }
}

/**
 * Call Ollama /api/generate with JSON schema enforcement to get chunk boundaries and summaries.
 */
export async function generateChunks(params: {
  prompt: string;
  model: string;
  baseUrl?: string;
  numCtx?: number;
  signal?: AbortSignal | undefined;
}): Promise<ChunkingResult> {
  const baseUrl = params.baseUrl ?? 'http://localhost:11434';
  const numCtx = params.numCtx ?? 32768;

  const response = await fetch(`${baseUrl}/api/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: params.model,
      prompt: params.prompt,
      stream: false,
      format: CHUNK_OUTPUT_SCHEMA,
      options: {
        temperature: 0,
        seed: 42,
        num_ctx: numCtx,
      },
    }),
    ...(params.signal && { signal: params.signal }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Ollama generate error: ${response.status} ${body}`);
  }

  const result = (await response.json()) as OllamaGenerateResponse;
  const rawResponse = result.response;

  // Parse the model's JSON output
  const parsed = JSON.parse(rawResponse) as unknown;

  // Validate parsed JSON structure
  if (
    typeof parsed !== 'object' ||
    parsed === null ||
    !('chunks' in parsed) ||
    !Array.isArray((parsed as Record<string, unknown>)['chunks'])
  ) {
    throw new Error(`Invalid chunking response: missing 'chunks' array`);
  }

  const rawChunks = (parsed as { chunks: unknown[] }).chunks;
  const chunks: LLMChunk[] = rawChunks.map((item, idx) => {
    if (
      typeof item !== 'object' ||
      item === null ||
      typeof (item as Record<string, unknown>)['startLine'] !== 'number' ||
      typeof (item as Record<string, unknown>)['endLine'] !== 'number' ||
      typeof (item as Record<string, unknown>)['summary'] !== 'string'
    ) {
      throw new Error(`Invalid chunk at index ${idx}: expected startLine, endLine, summary`);
    }
    const chunk = item as { startLine: number; endLine: number; summary: string };
    return {
      startLine: chunk.startLine,
      endLine: chunk.endLine,
      summary: chunk.summary,
    };
  });

  // Compute metrics
  const totalDurationMs = result.total_duration / 1e6;
  const loadDurationMs = result.load_duration / 1e6;
  const promptEvalDurationMs = result.prompt_eval_duration / 1e6;
  const evalDurationMs = result.eval_duration / 1e6;
  const tokensPerSec =
    result.eval_duration > 0 ? result.eval_count / (result.eval_duration / 1e9) : 0;

  return {
    chunks,
    metrics: {
      totalDurationMs,
      promptTokens: result.prompt_eval_count,
      outputTokens: result.eval_count,
      tokensPerSec,
      loadDurationMs,
      promptEvalDurationMs,
      evalDurationMs,
    },
    rawResponse,
  };
}

/**
 * Get model info from Ollama /api/show.
 */
export async function getModelInfo(model: string, baseUrl?: string): Promise<ModelInfo> {
  const url = `${baseUrl ?? 'http://localhost:11434'}/api/show`;

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: model }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Ollama show error: ${response.status} ${body}`);
  }

  const info = (await response.json()) as Record<string, unknown>;

  // Extract parameter size from modelinfo or details
  let parameterSize = 'unknown';
  const details = info['details'] as Record<string, unknown> | undefined;
  const modelinfo = info['model_info'] as Record<string, unknown> | undefined;

  if (details?.['parameter_size'] && typeof details['parameter_size'] === 'string') {
    parameterSize = details['parameter_size'];
  } else if (modelinfo?.['general.parameter_count'] !== undefined) {
    const count = Number(modelinfo['general.parameter_count']);
    parameterSize = `${(count / 1e9).toFixed(1)}B`;
  }

  // Extract context length
  let contextLength = 32768; // default
  if (typeof modelinfo?.['llama.context_length'] === 'number') {
    contextLength = modelinfo['llama.context_length'] as number;
  } else if (details?.['context_length'] !== undefined) {
    contextLength = Number(details['context_length']);
  }

  return { parameterSize, contextLength };
}
