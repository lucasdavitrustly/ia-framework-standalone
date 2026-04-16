import { readFile, writeFile } from 'node:fs/promises';
import type { ProjectProfile, ProjectConfig } from '@ia-framework/core';

export interface PersistOptions {
  targetProjectPath?: string | undefined;
  embeddingProvider?: 'openai' | 'ollama' | undefined;
  embeddingModel?: string | undefined;
  embeddingDimensions?: number | undefined;
  llmModel?: string | undefined;
  llmUrl?: string | undefined;
}

const DEFAULT_VECTOR_STORE = {
  host: 'qdrant',
  port: 6333,
  collectionName: 'codebase',
} as const;

const DEFAULT_EMBEDDING = {
  provider: 'ollama' as const,
  model: 'nomic-embed-text',
  baseUrl: 'http://localhost:11434',
} as const;

export async function persistProfile(
  profile: ProjectProfile,
  configPath: string,
  options: PersistOptions = {},
): Promise<void> {
  let existing: Partial<ProjectConfig> = {};

  try {
    const raw = await readFile(configPath, 'utf-8');
    existing = JSON.parse(raw) as Partial<ProjectConfig>;
  } catch {
    // File doesn't exist — create from options
  }

  const merged: ProjectConfig = {
    targetProjectPath: existing.targetProjectPath ?? options.targetProjectPath ?? '',
    embedding: existing.embedding ?? {
      provider: options.embeddingProvider ?? DEFAULT_EMBEDDING.provider,
      model: options.embeddingModel ?? DEFAULT_EMBEDDING.model,
      baseUrl: DEFAULT_EMBEDDING.baseUrl,
      ...(options.embeddingDimensions ? { dimensions: options.embeddingDimensions } : {}),
    },
    vectorStore: existing.vectorStore ?? DEFAULT_VECTOR_STORE,
    ...(existing.indexing || options.llmModel
      ? {
          indexing: {
            ...existing.indexing,
            ...(options.llmModel
              ? {
                  llm: {
                    model: options.llmModel,
                    ollamaUrl: options.llmUrl ?? 'http://localhost:11434',
                  },
                }
              : existing.indexing?.llm
                ? { llm: existing.indexing.llm }
                : {}),
          } as NonNullable<ProjectConfig['indexing']>,
        }
      : {}),
    profile,
  };

  await writeFile(configPath, JSON.stringify(merged, null, 2), 'utf-8');
}

export async function readPersistedProfile(
  configPath: string,
): Promise<ProjectProfile | undefined> {
  try {
    const raw = await readFile(configPath, 'utf-8');
    const config = JSON.parse(raw) as Partial<ProjectConfig>;
    return config.profile;
  } catch {
    return undefined;
  }
}
