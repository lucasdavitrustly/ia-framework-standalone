import type { EmbeddingProviderConfig } from '../types/index.js';
import { SPARSE_HASH_VERSION } from '../lexical/sparse.js';
import { TOKENIZER_VERSION } from '../lexical/tokenizer.js';
import { capabilitiesFor } from './capabilities.js';

export interface EmbeddingPrefixes {
  document: string;
  query: string;
}

export interface EmbeddingContract {
  provider: 'openai' | 'ollama';
  model: string;
  dimension: number;
  prefixes?: EmbeddingPrefixes;
  tokenizerVersion: number;
  sparseHashVersion: number;
  /** Runtime instruction for providers whose native dimension already matches. */
  omitDimensionParam?: boolean;
}

export class EmbeddingConfigurationError extends Error {
  constructor(
    public readonly provider: 'openai' | 'ollama',
    public readonly model: string,
    public readonly configuredDimension?: number,
    public readonly nativeDimension?: number,
  ) {
    const dimension = configuredDimension === undefined ? 'missing' : String(configuredDimension);
    const behavior = nativeDimension === undefined
      ? 'has no known native dimension'
      : `has native dimension ${nativeDimension}`;
    super(
      `Embedding configuration is invalid for ${provider}/${model}: configured dimension ${dimension}; ` +
        `model does not support configurable dimensions and ${behavior}.\n` +
        'Suggestion: use ia index --force after correcting the embedding configuration.',
    );
    this.name = 'EmbeddingConfigurationError';
  }
}

export type ContractField =
  | 'provider'
  | 'model'
  | 'dimension'
  | 'prefixes'
  | 'tokenizerVersion'
  | 'sparseHashVersion';

export interface ContractDiff {
  fields: ContractField[];
  values: Partial<Record<ContractField, { active: unknown; persisted: unknown }>>;
}

export function resolveContract(config: EmbeddingProviderConfig): EmbeddingContract {
  const capabilities = capabilitiesFor(config.provider, config.model);
  const dimension = config.dimensions ?? capabilities.nativeDimension;

  if (dimension === undefined) {
    throw new EmbeddingConfigurationError(config.provider, config.model);
  }

  if (
    config.dimensions !== undefined &&
    !capabilities.supportsDimensionParam &&
    capabilities.nativeDimension !== undefined &&
    config.dimensions !== capabilities.nativeDimension
  ) {
    throw new EmbeddingConfigurationError(
      config.provider,
      config.model,
      config.dimensions,
      capabilities.nativeDimension,
    );
  }

  return {
    provider: config.provider,
    model: config.model,
    dimension,
    ...(config.prefixes === undefined ? {} : { prefixes: config.prefixes }),
    tokenizerVersion: TOKENIZER_VERSION,
    sparseHashVersion: SPARSE_HASH_VERSION,
    ...(capabilities.supportsDimensionParam || config.dimensions !== capabilities.nativeDimension
      ? {}
      : { omitDimensionParam: true }),
  };
}

export function contractsMatch(
  active: EmbeddingContract,
  persisted: EmbeddingContract,
): ContractDiff | null {
  const fields: ContractField[] = [];
  const values: Partial<Record<ContractField, { active: unknown; persisted: unknown }>> = {};
  const compare = (field: ContractField, left: unknown, right: unknown): void => {
    if (JSON.stringify(left) === JSON.stringify(right)) return;
    fields.push(field);
    values[field] = { active: left, persisted: right };
  };

  compare('provider', active.provider, persisted.provider);
  compare('model', active.model, persisted.model);
  compare('dimension', active.dimension, persisted.dimension);
  compare('prefixes', active.prefixes, persisted.prefixes);
  compare('tokenizerVersion', active.tokenizerVersion, persisted.tokenizerVersion);
  compare('sparseHashVersion', active.sparseHashVersion, persisted.sparseHashVersion);

  return fields.length === 0 ? null : { fields, values };
}

export function contractFingerprint(contract: EmbeddingContract): string {
  const canonical = JSON.stringify({
    provider: contract.provider,
    model: contract.model,
    dimension: contract.dimension,
    prefixes: contract.prefixes ?? null,
    tokenizerVersion: contract.tokenizerVersion,
    sparseHashVersion: contract.sparseHashVersion,
  });

  let hash = 2166136261;
  for (const character of canonical) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16777619) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
}
