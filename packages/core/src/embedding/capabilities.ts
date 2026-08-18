export interface ModelCapabilities {
  supportsDimensionParam: boolean;
  nativeDimension?: number;
  maxInputTokens: number;
  maxBatchItems?: number;
  maxRequestTokens?: number;
  disableServerTruncation: boolean;
}

const OPENAI_LIMITS = {
  maxInputTokens: 8192,
  maxBatchItems: 2048,
  maxRequestTokens: 300000,
} as const;

const KNOWN_DIMENSIONS: Record<string, number> = {
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

const CONSERVATIVE_DEFAULTS: ModelCapabilities = {
  supportsDimensionParam: false,
  maxInputTokens: 2048,
  maxBatchItems: 128,
  maxRequestTokens: 100000,
  disableServerTruncation: false,
};

export function capabilitiesFor(provider: 'openai' | 'ollama', model: string): ModelCapabilities {
  const normalizedModel = model.replace(/:latest$/, '');
  const nativeDimension = KNOWN_DIMENSIONS[model] ?? KNOWN_DIMENSIONS[normalizedModel];

  if (provider === 'ollama') {
    return {
      supportsDimensionParam: true,
      ...(nativeDimension === undefined ? {} : { nativeDimension }),
      maxInputTokens: 4096,
      maxBatchItems: 256,
      maxRequestTokens: 100000,
      disableServerTruncation: true,
    };
  }

  if (model.startsWith('text-embedding-3')) {
    return {
      supportsDimensionParam: true,
      ...(nativeDimension === undefined ? {} : { nativeDimension }),
      ...OPENAI_LIMITS,
      disableServerTruncation: false,
    };
  }

  if (normalizedModel === 'text-embedding-ada-002') {
    return {
      supportsDimensionParam: false,
      ...(nativeDimension === undefined ? {} : { nativeDimension }),
      ...OPENAI_LIMITS,
      disableServerTruncation: false,
    };
  }

  return { ...CONSERVATIVE_DEFAULTS };
}
