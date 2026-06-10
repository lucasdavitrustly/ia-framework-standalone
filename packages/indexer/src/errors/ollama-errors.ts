/**
 * Ollama error formatting utility.
 * Categorizes Ollama API errors and provides actionable guidance.
 */

export const MAX_ERROR_BODY_LENGTH = 2048;

export type OllamaErrorCategory =
  | 'connection'
  | 'model-not-found'
  | 'parse-failure'
  | 'server-error'
  | 'unknown';

export interface OllamaErrorContext {
  /** HTTP status code (undefined for connection/network errors) */
  status?: number;
  /** Response body text or error message */
  body: string;
  /** Model name used in the call */
  model: string;
  /** Ollama base URL */
  baseUrl: string;
  /** Pipeline phase where the error occurred */
  phase: 'enrichment' | 'embedding';
  /** Whether this was a JSON parse failure on a 200 OK response */
  parseFailure?: boolean;
}

/**
 * Truncate a response body to MAX_ERROR_BODY_LENGTH bytes.
 * Returns the original string if within limit, otherwise truncates with a marker.
 */
export function truncateBody(body: string, maxLength: number = MAX_ERROR_BODY_LENGTH): string {
  if (body.length <= maxLength) {
    return body;
  }
  return `${body.slice(0, maxLength)}... [truncated, full response was ${body.length} bytes]`;
}

/**
 * Categorize an Ollama error by detecting known patterns in the body/status.
 */
export function categorizeOllamaError(ctx: OllamaErrorContext): OllamaErrorCategory {
  const bodyLower = ctx.body.toLowerCase();

  // Parse failure explicitly flagged
  if (ctx.parseFailure) {
    return 'parse-failure';
  }

  // Connection errors: ECONNREFUSED, ETIMEDOUT, fetch failed
  if (
    bodyLower.includes('econnrefused') ||
    bodyLower.includes('etimedout') ||
    bodyLower.includes('und_err_connect_timeout') ||
    bodyLower.includes('fetch failed')
  ) {
    return 'connection';
  }

  // Model not found (case-insensitive)
  if (bodyLower.includes('not found')) {
    return 'model-not-found';
  }

  // Server error (5xx status with a body)
  if (ctx.status && ctx.status >= 500 && ctx.status < 600) {
    return 'server-error';
  }

  return 'unknown';
}

/**
 * Format an Ollama error into a human-readable message with context and guidance.
 */
export function formatOllamaError(ctx: OllamaErrorContext): string {
  const category = categorizeOllamaError(ctx);
  const truncatedBody = truncateBody(ctx.body);
  const suggestion = getSuggestion(category, ctx);

  const parts: string[] = [];

  if (category === 'connection') {
    parts.push(`Ollama ${ctx.phase} error (${category}): Cannot reach Ollama at ${ctx.baseUrl}`);
    parts.push(`  Model: ${ctx.model}`);
    parts.push(`  Error: ${truncatedBody}`);
  } else {
    const statusStr = ctx.status ? `${ctx.status} — ` : '';
    parts.push(
      `Ollama ${ctx.phase} error (${category}): ${statusStr}${extractErrorMessage(ctx.body)}`,
    );
    parts.push(`  Model: ${ctx.model}`);
    parts.push(`  URL: ${ctx.baseUrl}`);
    parts.push(`  Response: ${truncatedBody}`);
  }

  if (suggestion) {
    parts.push(`  Suggestion: ${suggestion}`);
  }

  return parts.join('\n');
}

/**
 * Get an actionable suggestion for a known error category.
 */
function getSuggestion(category: OllamaErrorCategory, ctx: OllamaErrorContext): string | null {
  switch (category) {
    case 'connection':
      return `Ensure Ollama is running: ollama serve (expected at ${ctx.baseUrl})`;
    case 'model-not-found':
      return `Try running: ollama pull ${ctx.model}`;
    case 'parse-failure':
      return 'Ollama returned invalid JSON — check server logs or restart Ollama';
    case 'server-error':
      return 'Ollama internal error — check server logs or restart Ollama';
    case 'unknown':
      return null;
  }
}

/**
 * Attempt to extract the "error" field from a JSON response body.
 * Falls back to the raw body if not JSON or no "error" field.
 */
function extractErrorMessage(body: string): string {
  try {
    const parsed = JSON.parse(body) as { error?: string };
    if (parsed.error) {
      return parsed.error;
    }
  } catch {
    // Not JSON — use raw body
  }
  return body.slice(0, 200);
}
