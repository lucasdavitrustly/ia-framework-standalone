import { readFile } from 'node:fs/promises';
import { ProjectConfigSchema } from './schema.js';
import type { ProjectConfig } from '../types/index.js';

export class ConfigNotFoundError extends Error {
  constructor(public readonly path: string) {
    super(`Config file not found: ${path}`);
    this.name = 'ConfigNotFoundError';
  }
}

export async function loadConfig(configPath: string): Promise<ProjectConfig> {
  let raw: string;
  try {
    raw = await readFile(configPath, 'utf-8');
  } catch {
    throw new ConfigNotFoundError(configPath);
  }
  const parsed: unknown = JSON.parse(raw);
  return validateConfig(parsed);
}

export function validateConfig(data: unknown): ProjectConfig {
  return ProjectConfigSchema.parse(data) as ProjectConfig;
}
