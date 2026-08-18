import { afterEach, describe, expect, it, vi } from 'vitest';
import { EmbeddingResponseError } from '@ia-framework/core';
import { OpenAIEmbeddingProvider } from './openai.js';

const BASE_CONFIG = {
  apiKey: 'test-key',
  baseUrl: 'https://openai.test',
} as const;

function vector(length: number, value = 0.1): number[] {
  return Array.from({ length }, () => value);
}

function responseFor(
  data: unknown,
  status = 200,
): Response {
  return new Response(JSON.stringify({ data, usage: { prompt_tokens: 1, total_tokens: 1 } }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function makeProvider(
  model = 'text-embedding-3-small',
  dimensions = 3,
  prefixes?: { document: string; query: string },
): OpenAIEmbeddingProvider {
  return new OpenAIEmbeddingProvider({
    ...BASE_CONFIG,
    model,
    dimensions,
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

describe('OpenAIEmbeddingProvider contract enforcement', () => {
  it('includes configured dimensions for text-embedding-3 models', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      responseFor([{ embedding: vector(3), index: 0 }]),
    );

    await makeProvider('text-embedding-3-small', 3).embedBatch(['hello']);

    expect(requestBody(fetchMock)).toMatchObject({
      model: 'text-embedding-3-small',
      dimensions: 3,
    });
  });

  it('omits dimensions for ada-002', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      responseFor([{ embedding: vector(1536), index: 0 }]),
    );

    await makeProvider('text-embedding-ada-002', 1536).embedBatch(['hello']);

    expect(requestBody(fetchMock)).not.toHaveProperty('dimensions');
  });

  it('throws EmbeddingResponseError for a wrong-length vector before returning it', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      responseFor([{ embedding: vector(2), index: 0 }]),
    );

    const error = await makeProvider('text-embedding-3-small', 3)
      .embedBatch(['hello'])
      .catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(EmbeddingResponseError);
    expect(error).toMatchObject({
      provider: 'openai',
      model: 'text-embedding-3-small',
      configuredDimension: 3,
      actualDimension: 2,
    });
    expect((error as Error).message).toContain('configured dimension is 3');
  });

  it('rejects an empty vector as an embedding response error', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      responseFor([{ embedding: [], index: 0 }]),
    );

    await expect(makeProvider().embedBatch(['hello'])).rejects.toMatchObject({
      actualDimension: 0,
    });
  });

  it('rejects a non-array vector as an embedding response error', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      responseFor([{ embedding: 'not-a-vector', index: 0 }]),
    );

    await expect(makeProvider().embedBatch(['hello'])).rejects.toMatchObject({
      actualDimension: 'malformed',
    });
  });

  it('rejects a vector containing non-numeric values', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      responseFor([{ embedding: [0.1, 'bad', 0.3], index: 0 }]),
    );

    await expect(makeProvider().embedBatch(['hello'])).rejects.toMatchObject({
      actualDimension: 'malformed',
    });
  });

  it('rejects fewer returned embeddings instead of shifting positions', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      responseFor([{ embedding: vector(3), index: 0 }]),
    );

    await expect(makeProvider().embedBatch(['first', 'second'])).rejects.toThrow(
      /returned 1 embeddings for 2 inputs/,
    );
  });

  it('re-establishes input order from response indexes', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      responseFor([
        { embedding: vector(3, 0.2), index: 1 },
        { embedding: vector(3, 0.1), index: 0 },
      ]),
    );

    const result = await makeProvider().embedBatch(['first', 'second']);

    expect(result.vectors).toEqual([vector(3, 0.1), vector(3, 0.2)]);
    expect(result.failures).toEqual([]);
  });

  it('does not send an empty string and reports blank input at its original index', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      responseFor([{ embedding: vector(3), index: 0 }]),
    );

    const result = await makeProvider().embedBatch(['   ', 'hello']);

    expect(requestBody(fetchMock).input).toEqual(['hello']);
    expect(result.vectors).toEqual([null, vector(3)]);
    expect(result.failures).toEqual([
      { index: 0, reason: 'embedding input is empty or whitespace-only', retryable: false },
    ]);
  });

  it('handles an all-blank batch without issuing a provider request', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch');

    const result = await makeProvider().embedBatch(['', '\t']);

    expect(fetchMock).not.toHaveBeenCalled();
    expect(result.vectors).toEqual([null, null]);
    expect(result.failures).toHaveLength(2);
  });

  it('applies the document prefix to document requests', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      responseFor([{ embedding: vector(3), index: 0 }]),
    );

    await makeProvider('text-embedding-3-small', 3, {
      document: 'doc: ',
      query: 'query: ',
    }).embedBatch(['hello'], 'document');

    expect(requestBody(fetchMock).input).toEqual(['doc: hello']);
  });

  it('applies the query prefix to query requests', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      responseFor([{ embedding: vector(3), index: 0 }]),
    );

    await makeProvider('text-embedding-3-small', 3, {
      document: 'doc: ',
      query: 'query: ',
    }).embedBatch(['hello'], 'query');

    expect(requestBody(fetchMock).input).toEqual(['query: hello']);
  });

  it('retries a 429 response once and marks the exhausted error retryable', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response('rate limited', { status: 429 }))
      .mockResolvedValueOnce(responseFor([{ embedding: vector(3), index: 0 }]));

    const result = await makeProvider().embedBatch(['hello']);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result.vectors[0]).toEqual(vector(3));
  });

  it('reports an exhausted 5xx response as retryable after one retry', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation(() => Promise.resolve(new Response('server error', { status: 503 })));

    const error = await makeProvider()
      .embedBatch(['hello'])
      .catch((caught: unknown) => caught);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(error).toMatchObject({ status: 503, retryable: true });
  });

  it('does not retry a non-retryable 400 response', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('bad request', { status: 400 }),
    );

    const error = await makeProvider()
      .embedBatch(['hello'])
      .catch((caught: unknown) => caught);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(error).toMatchObject({ status: 400, retryable: false });
  });

  it('does not retry a non-retryable 401 response', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('unauthorized', { status: 401 }),
    );

    const error = await makeProvider()
      .embedBatch(['hello'])
      .catch((caught: unknown) => caught);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(error).toMatchObject({ status: 401, retryable: false });
  });
});
