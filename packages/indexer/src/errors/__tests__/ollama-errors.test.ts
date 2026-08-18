import { describe, it, expect } from 'vitest';
import {
  formatOllamaError,
  truncateBody,
  categorizeOllamaError,
  MAX_ERROR_BODY_LENGTH,
  type OllamaErrorContext,
} from '../ollama-errors.js';

describe('truncateBody', () => {
  it('returns strings under 2048 bytes unchanged', () => {
    const body = 'Short error message';
    expect(truncateBody(body)).toBe(body);
  });

  it('truncates strings exceeding 2048 bytes with marker', () => {
    const body = 'x'.repeat(3000);
    const result = truncateBody(body);
    expect(result.length).toBeLessThan(body.length);
    expect(result).toContain('... [truncated, full response was 3000 bytes]');
    expect(result.startsWith('x'.repeat(MAX_ERROR_BODY_LENGTH))).toBe(true);
  });

  it('handles empty string', () => {
    expect(truncateBody('')).toBe('');
  });

  it('handles exactly 2048 bytes (boundary)', () => {
    const body = 'y'.repeat(MAX_ERROR_BODY_LENGTH);
    expect(truncateBody(body)).toBe(body);
  });
});

describe('categorizeOllamaError', () => {
  it('returns "connection" for ECONNREFUSED errors', () => {
    const ctx: OllamaErrorContext = {
      body: 'fetch failed: connect ECONNREFUSED 127.0.0.1:11434',
      model: 'qwen3:8b',
      baseUrl: 'http://localhost:11434',
      phase: 'enrichment',
    };
    expect(categorizeOllamaError(ctx)).toBe('connection');
  });

  it('returns "connection" for ETIMEDOUT errors', () => {
    const ctx: OllamaErrorContext = {
      body: 'connect ETIMEDOUT 127.0.0.1:11434',
      model: 'qwen3:8b',
      baseUrl: 'http://localhost:11434',
      phase: 'enrichment',
    };
    expect(categorizeOllamaError(ctx)).toBe('connection');
  });

  it('returns "model-not-found" when body contains "not found"', () => {
    const ctx: OllamaErrorContext = {
      status: 404,
      body: '{"error":"model \'qwen3:8b\' not found, try pulling it first"}',
      model: 'qwen3:8b',
      baseUrl: 'http://localhost:11434',
      phase: 'enrichment',
    };
    expect(categorizeOllamaError(ctx)).toBe('model-not-found');
  });

  it('returns "model-not-found" case-insensitively', () => {
    const ctx: OllamaErrorContext = {
      status: 500,
      body: 'Model Not Found in registry',
      model: 'qwen3:8b',
      baseUrl: 'http://localhost:11434',
      phase: 'embedding',
    };
    expect(categorizeOllamaError(ctx)).toBe('model-not-found');
  });

  it('returns "server-error" for 5xx with parseable body', () => {
    const ctx: OllamaErrorContext = {
      status: 500,
      body: '{"error":"llama runner process no longer running: unknown"}',
      model: 'qwen3:8b',
      baseUrl: 'http://localhost:11434',
      phase: 'enrichment',
    };
    expect(categorizeOllamaError(ctx)).toBe('server-error');
  });

  it('returns "unknown" when no patterns match', () => {
    const ctx: OllamaErrorContext = {
      status: 418,
      body: 'I am a teapot',
      model: 'qwen3:8b',
      baseUrl: 'http://localhost:11434',
      phase: 'enrichment',
    };
    expect(categorizeOllamaError(ctx)).toBe('unknown');
  });

  it('returns "parse-failure" when phase indicates parse error', () => {
    const ctx: OllamaErrorContext = {
      status: 200,
      body: '<html>not json</html>',
      model: 'qwen3:8b',
      baseUrl: 'http://localhost:11434',
      phase: 'enrichment',
      parseFailure: true,
    };
    expect(categorizeOllamaError(ctx)).toBe('parse-failure');
  });

  it('returns "truncation" when truncated flag is set (even over parseFailure)', () => {
    const ctx: OllamaErrorContext = {
      status: 200,
      body: '[{"description":"cut off mid',
      model: 'qwen2.5-coder:1.5b',
      baseUrl: 'http://localhost:11434',
      phase: 'enrichment',
      truncated: true,
      parseFailure: true,
    };
    expect(categorizeOllamaError(ctx)).toBe('truncation');
  });
});

describe('formatOllamaError', () => {
  it('returns status code and response body for HTTP errors', () => {
    const ctx: OllamaErrorContext = {
      status: 500,
      body: '{"error":"internal server error"}',
      model: 'qwen3:8b',
      baseUrl: 'http://localhost:11434',
      phase: 'enrichment',
    };
    const result = formatOllamaError(ctx);
    expect(result).toContain('500');
    expect(result).toContain('internal server error');
  });

  it('includes model name and baseUrl in output', () => {
    const ctx: OllamaErrorContext = {
      status: 404,
      body: '{"error":"model not found"}',
      model: 'qwen3:8b',
      baseUrl: 'http://localhost:11434',
      phase: 'enrichment',
    };
    const result = formatOllamaError(ctx);
    expect(result).toContain('qwen3:8b');
    expect(result).toContain('http://localhost:11434');
  });

  it('includes actionable suggestion for "model-not-found" category', () => {
    const ctx: OllamaErrorContext = {
      status: 404,
      body: '{"error":"model \'qwen3:8b\' not found"}',
      model: 'qwen3:8b',
      baseUrl: 'http://localhost:11434',
      phase: 'enrichment',
    };
    const result = formatOllamaError(ctx);
    expect(result).toContain('ollama pull qwen3:8b');
  });

  it('includes actionable suggestion for "connection" category', () => {
    const ctx: OllamaErrorContext = {
      body: 'connect ECONNREFUSED 127.0.0.1:11434',
      model: 'qwen3:8b',
      baseUrl: 'http://localhost:11434',
      phase: 'enrichment',
    };
    const result = formatOllamaError(ctx);
    expect(result).toContain('ollama serve');
    expect(result).toContain('http://localhost:11434');
  });

  it('shows raw response without suggestion for "unknown" category', () => {
    const ctx: OllamaErrorContext = {
      status: 418,
      body: 'unexpected response body',
      model: 'qwen3:8b',
      baseUrl: 'http://localhost:11434',
      phase: 'enrichment',
    };
    const result = formatOllamaError(ctx);
    expect(result).toContain('unexpected response body');
    expect(result).not.toContain('Suggestion:');
  });

  it('includes phase in output', () => {
    const ctx: OllamaErrorContext = {
      status: 500,
      body: 'error',
      model: 'qwen3:8b',
      baseUrl: 'http://localhost:11434',
      phase: 'embedding',
    };
    const result = formatOllamaError(ctx);
    expect(result).toContain('embedding');
  });

  it('truncates large response bodies', () => {
    const ctx: OllamaErrorContext = {
      status: 500,
      body: 'e'.repeat(5000),
      model: 'qwen3:8b',
      baseUrl: 'http://localhost:11434',
      phase: 'enrichment',
    };
    const result = formatOllamaError(ctx);
    expect(result).toContain('[truncated, full response was 5000 bytes]');
  });
});
