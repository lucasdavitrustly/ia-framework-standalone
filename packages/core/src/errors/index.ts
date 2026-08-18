export { EmbeddingConfigurationError } from '../embedding/contract.js';

export type RetrievalStatus = 'ok' | 'empty' | 'low_confidence' | 'unavailable' | 'refused';

function actionableMessage(reason: string, suggestion: string): string {
  return `${reason}\nSuggestion: ${suggestion}`;
}

export class EmbeddingResponseError extends Error {
  constructor(
    public readonly provider: string,
    public readonly model: string,
    public readonly configuredDimension: number,
    public readonly actualDimension: number | string,
  ) {
    super(
      actionableMessage(
        `Embedding response from ${provider}/${model} has dimension ${String(actualDimension)}; ` +
          `configured dimension is ${configuredDimension}.`,
        'verify the provider model and embedding contract before indexing or searching',
      ),
    );
    this.name = 'EmbeddingResponseError';
  }
}

export class EmbeddingContractMismatchError extends Error {
  constructor(
    public readonly collectionName: string,
    public readonly activeContract: unknown,
    public readonly persistedContract: unknown,
  ) {
    super(
      actionableMessage(
        `Embedding contract mismatch for collection "${collectionName}": active=${formatValue(activeContract)}, ` +
          `persisted=${formatValue(persistedContract)}.`,
        'run ia index --force to rebuild the collection with the active embedding contract',
      ),
    );
    this.name = 'EmbeddingContractMismatchError';
  }
}

export class UnknownContractError extends Error {
  constructor(public readonly collectionName: string) {
    super(
      actionableMessage(
        `Embedding contract is unknown for collection "${collectionName}"; no persisted contract was found.`,
        'run ia index --force to create the embedding contract before searching',
      ),
    );
    this.name = 'UnknownContractError';
  }
}

export class CollectionSchemaError extends Error {
  constructor(
    public readonly collectionName: string,
    public readonly field: string,
    public readonly expectedDimension: number,
    public readonly actualDimension: number | string,
  ) {
    super(
      actionableMessage(
        `Collection schema mismatch for "${collectionName}" field "${field}": ` +
          `expected dimension ${expectedDimension}, got ${String(actualDimension)}.`,
        'inspect the collection schema and use ia index --force only when destructive recreation is intended',
      ),
    );
    this.name = 'CollectionSchemaError';
  }
}

export class PayloadIndexError extends Error {
  constructor(public readonly field: string, public readonly reason: string) {
    super(
      actionableMessage(
        `Payload index creation failed for field "${field}": ${reason}.`,
        'check Qdrant permissions and retry collection initialization',
      ),
    );
    this.name = 'PayloadIndexError';
  }
}

export class FilterOnlyRetrievalError extends Error {
  constructor(
    public readonly collectionName: string,
    public readonly operation: string,
    public readonly reason: string,
  ) {
    super(
      actionableMessage(
        `Filter-only retrieval failed for collection "${collectionName}" during ${operation}: ${reason}.`,
        'verify Qdrant availability and the required payload indexes; no similarity fallback was used',
      ),
    );
    this.name = 'FilterOnlyRetrievalError';
  }
}

export class QueryPlanError extends Error {
  constructor(public readonly query: string, public readonly reason: string) {
    super(
      actionableMessage(
        `Query plan could not be produced for "${query}": ${reason}.`,
        'check the query and preserve its explicit filters and retrieval settings before retrying',
      ),
    );
    this.name = 'QueryPlanError';
  }
}

export class OversizedInputError extends Error {
  constructor(
    public readonly repoId: string,
    public readonly relativePath: string,
    public readonly symbol: string,
    public readonly startLine: number,
    public readonly endLine: number,
  ) {
    super(
      actionableMessage(
        `Input is oversized and cannot be safely embedded: ${repoId}/${relativePath} ` +
          `${symbol} (${startLine}-${endLine}).`,
        'split the construct at a semantic boundary or reduce the provider input before retrying',
      ),
    );
    this.name = 'OversizedInputError';
  }
}

function formatValue(value: unknown): string {
  if (typeof value === 'string') return value;
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}
