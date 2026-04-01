import { readFile } from 'node:fs/promises';
import { DatabaseConfigSchema } from './types.js';
import type { DatabaseConfig } from './types.js';

export class DbConfigNotFoundError extends Error {
  constructor(public readonly path: string) {
    super(`Database config file not found: ${path}`);
    this.name = 'DbConfigNotFoundError';
  }
}

export async function loadDbConfig(configPath: string): Promise<DatabaseConfig> {
  let raw: string;
  try {
    raw = await readFile(configPath, 'utf-8');
  } catch {
    throw new DbConfigNotFoundError(configPath);
  }
  const parsed: unknown = JSON.parse(raw);
  return DatabaseConfigSchema.parse(parsed);
}
