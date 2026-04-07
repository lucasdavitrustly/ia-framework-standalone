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
  const config = DatabaseConfigSchema.parse(parsed);

  // Allow the host to be overridden via environment variable.
  // This is used by the Docker dashboard container, which cannot reach
  // 'localhost' (the host machine) and must use 'host.docker.internal' instead.
  if (process.env.DB_HOST) {
    config.host = process.env.DB_HOST;
  }

  return config;
}
