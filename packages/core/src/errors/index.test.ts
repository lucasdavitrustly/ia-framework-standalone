import { describe, expect, it } from 'vitest';
import {
  CollectionSchemaError,
  EmbeddingConfigurationError,
  EmbeddingContractMismatchError,
  EmbeddingResponseError,
  FilterOnlyRetrievalError,
  OversizedInputError,
  PayloadIndexError,
  QueryPlanError,
  UnknownContractError,
  type RetrievalStatus,
} from './index.js';

const errorCases = [
  {
    name: 'EmbeddingConfigurationError',
    create: () => new EmbeddingConfigurationError('openai', 'ada-002', 512, 1536),
    context: ['openai', 'ada-002', '512'],
    fields: [
      ['provider', 'openai'],
      ['model', 'ada-002'],
      ['configuredDimension', 512],
      ['nativeDimension', 1536],
    ],
  },
  {
    name: 'EmbeddingResponseError',
    create: () => new EmbeddingResponseError('openai', 'text-embedding-3-small', 512, 256),
    context: ['openai', 'text-embedding-3-small', '512', '256'],
    fields: [
      ['provider', 'openai'],
      ['model', 'text-embedding-3-small'],
      ['configuredDimension', 512],
      ['actualDimension', 256],
    ],
  },
  {
    name: 'EmbeddingContractMismatchError',
    create: () => new EmbeddingContractMismatchError('collection', 'active-contract', 'stored-contract'),
    context: ['collection', 'active-contract', 'stored-contract'],
    fields: [
      ['collectionName', 'collection'],
      ['activeContract', 'active-contract'],
      ['persistedContract', 'stored-contract'],
    ],
  },
  {
    name: 'UnknownContractError',
    create: () => new UnknownContractError('collection'),
    context: ['collection'],
    fields: [['collectionName', 'collection']],
  },
  {
    name: 'CollectionSchemaError',
    create: () => new CollectionSchemaError('collection', 'semantic', 512, 768),
    context: ['collection', 'semantic', '512', '768'],
    fields: [
      ['collectionName', 'collection'],
      ['field', 'semantic'],
      ['expectedDimension', 512],
      ['actualDimension', 768],
    ],
  },
  {
    name: 'PayloadIndexError',
    create: () => new PayloadIndexError('repoId', 'permission denied'),
    context: ['repoId', 'permission denied'],
    fields: [
      ['field', 'repoId'],
      ['reason', 'permission denied'],
    ],
  },
  {
    name: 'FilterOnlyRetrievalError',
    create: () => new FilterOnlyRetrievalError('collection', 'scroll', 'timeout'),
    context: ['collection', 'scroll', 'timeout'],
    fields: [
      ['collectionName', 'collection'],
      ['operation', 'scroll'],
      ['reason', 'timeout'],
    ],
  },
  {
    name: 'QueryPlanError',
    create: () => new QueryPlanError('PaymentService.refund', 'missing capability'),
    context: ['PaymentService.refund', 'missing capability'],
    fields: [
      ['query', 'PaymentService.refund'],
      ['reason', 'missing capability'],
    ],
  },
  {
    name: 'OversizedInputError',
    create: () => new OversizedInputError('repo', 'src/payment.ts', 'refund', 10, 80),
    context: ['repo', 'src/payment.ts', 'refund', '10', '80'],
    fields: [
      ['repoId', 'repo'],
      ['relativePath', 'src/payment.ts'],
      ['symbol', 'refund'],
      ['startLine', 10],
      ['endLine', 80],
    ],
  },
] as const;

describe('RetrievalStatus', () => {
  it('exports the closed status union through a typed assignment', async () => {
    const statuses: RetrievalStatus[] = ['ok', 'empty', 'low_confidence', 'unavailable', 'refused'];
    const core = await import('../index.js');

    expect(statuses).toEqual(['ok', 'empty', 'low_confidence', 'unavailable', 'refused']);
    expect(core).toHaveProperty('EmbeddingConfigurationError');
  });
});

describe('error taxonomy', () => {
  it.each(errorCases)('$name has its own name, context, and remediation', ({ name, create, context, fields }) => {
    const error = create();

    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe(name);
    for (const value of context) {
      expect(error.message).toContain(value);
    }
    for (const [field, value] of fields) {
      expect(error).toHaveProperty(field, value);
    }
    expect(error.message).toMatch(/Suggestion: .+/);
  });

  it('names ia index --force in both contract remediation messages', () => {
    const mismatch = new EmbeddingContractMismatchError('collection', 'active', 'stored');
    const unknown = new UnknownContractError('collection');

    expect(mismatch.message).toContain('ia index --force');
    expect(unknown.message).toContain('ia index --force');
  });

  it('keeps every taxonomy class distinguishable by instanceof', () => {
    const errors = errorCases.map(({ create }) => create());

    for (const [index, error] of errors.entries()) {
      expect(error).toBeInstanceOf(Error);
      for (const [otherIndex, other] of errors.entries()) {
        expect(error instanceof (other.constructor as typeof Error)).toBe(index === otherIndex);
      }
    }
  });

  it('exports all classes from the core barrel', async () => {
    const core = await import('../index.js');

    for (const { name } of errorCases) {
      expect(core).toHaveProperty(name);
    }
  });

  it('exposes readonly context values on the typed errors', () => {
    const responseError = new EmbeddingResponseError('openai', 'model', 512, 256);
    const oversizedError = new OversizedInputError('repo', 'path', 'symbol', 1, 2);

    expect(responseError.provider).toBe('openai');
    expect(responseError.configuredDimension).toBe(512);
    expect(responseError.actualDimension).toBe(256);
    expect(oversizedError.relativePath).toBe('path');
    expect(oversizedError.startLine).toBe(1);
    expect(oversizedError.endLine).toBe(2);
  });
});
