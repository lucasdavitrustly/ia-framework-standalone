import { afterEach, describe, expect, it, vi } from 'vitest';
import { EmbeddingResponseError } from '@ia-framework/core';
import { OllamaEmbeddingProvider } from './ollama.js';

const BASE_CONFIG = {
  model: 'nomic-embed-text',
  baseUrl: 'http://ollama.test',
  dimensions: 3,
} as const;

function vector(length: number, value = 0.1): number[] {
  return Array.from({ length }, () => value);
}

function responseFor(embeddings: unknown, status = 200): Response {
  return new Response(JSON.stringify({ embeddings }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function makeProvider(
  prefixes?: { document: string; query: string },
): OllamaEmbeddingProvider {
  return new OllamaEmbeddingProvider({
    ...BASE_CONFIG,
    ...(prefixes === undefined ? {} : { prefixes }),
  });
}

function requestBody(fetchMock: ReturnType<typeof vi.fn>): Record<string, unknown> {
  const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
  if (typeof init.body !== 'string') throw new Error('request body was not serialized');
  return JSON.parse(init.body) as Record<string, unknown>;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('OllamaEmbeddingProvider contract enforcement', () => {
  it('always disables server-side truncation', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      responseFor([vector(3)]),
    );

    await makeProvider().embedBatch(['hello']);

    expect(requestBody(fetchMock).truncate).toBe(false);
  });

  it('sends keep_alive and an explicit num_ctx', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(responseFor([vector(3)]));

    await makeProvider().embedBatch(['hello']);

    const body = requestBody(fetchMock);
    expect(body.keep_alive).toBeDefined();
    expect((body.options as { num_ctx?: number }).num_ctx).toBeGreaterThan(0);
  });

  it('passes an AbortSignal on the request (timeout guard)', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(responseFor([vector(3)]));

    await makeProvider().embedBatch(['hello']);

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });

  it('includes the configured dimensions in the request', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      responseFor([vector(3)]),
    );

    await makeProvider().embedBatch(['hello']);

    expect(requestBody(fetchMock)).toMatchObject({
      model: 'nomic-embed-text',
      dimensions: 3,
    });
  });

  it('rejects a short response instead of shifting positional results', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(responseFor([vector(3)]));

    await expect(makeProvider().embedBatch(['first', 'second'])).rejects.toThrow(
      /returned 1 embeddings for 2 inputs/,
    );
  });

  it('rejects a wrong-length vector with configured and actual dimensions', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(responseFor([vector(2)]));

    const error = await makeProvider()
      .embedBatch(['hello'])
      .catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(EmbeddingResponseError);
    expect(error).toMatchObject({
      provider: 'ollama',
      model: 'nomic-embed-text',
      configuredDimension: 3,
      actualDimension: 2,
    });
  });

  it('rejects an empty vector', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(responseFor([[]]));

    await expect(makeProvider().embedBatch(['hello'])).rejects.toMatchObject({
      actualDimension: 0,
    });
  });

  it('rejects a non-array vector', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(responseFor(['not-a-vector']));

    await expect(makeProvider().embedBatch(['hello'])).rejects.toMatchObject({
      actualDimension: 'malformed',
    });
  });

  it('rejects a vector containing a non-numeric value', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(responseFor([[0.1, 'bad', 0.3]]));

    await expect(makeProvider().embedBatch(['hello'])).rejects.toMatchObject({
      actualDimension: 'malformed',
    });
  });

  it('applies the document prefix to document input', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      responseFor([vector(3)]),
    );

    await makeProvider({ document: 'doc: ', query: 'query: ' }).embedBatch(['hello'], 'document');

    expect(requestBody(fetchMock).input).toEqual(['doc: hello']);
  });

  it('applies the query prefix to query input', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      responseFor([vector(3)]),
    );

    await makeProvider({ document: 'doc: ', query: 'query: ' }).embedBatch(['hello'], 'query');

    expect(requestBody(fetchMock).input).toEqual(['query: hello']);
  });

  it('makes an oversized input a loud failure while sending truncate false', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ error: 'context length exceeded' }), { status: 400 }),
    );

    await expect(makeProvider().embedBatch(['oversized input'])).rejects.toThrow(
      /Suggestion:/,
    );
    expect(requestBody(fetchMock).truncate).toBe(false);
  });

  it('formats provider failures with the embedding phase and a remediation suggestion', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ error: 'model unavailable' }), { status: 500 }),
    );

    const error = await makeProvider()
      .embedBatch(['hello'])
      .catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toContain('Ollama embedding error');
    expect((error as Error).message).toContain('embedding');
    expect((error as Error).message).toContain('Suggestion:');
    expect((error as Error).message).toContain('nomic-embed-text');
  });

  it('returns vectors in input order with no failures for a valid batch', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      responseFor([vector(3, 0.1), vector(3, 0.2)]),
    );

    const result = await makeProvider().embedBatch(['first', 'second']);

    expect(result.vectors).toEqual([vector(3, 0.1), vector(3, 0.2)]);
    expect(result.failures).toEqual([]);
  });
});
