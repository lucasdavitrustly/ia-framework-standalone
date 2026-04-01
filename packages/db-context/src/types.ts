import { z } from 'zod';

export const DatabaseConfigSchema = z.object({
  host: z.string().min(1),
  port: z.number().int().min(1).max(65535).default(5432),
  database: z.string().min(1),
  user: z.string().min(1),
  password: z.string(),
  ssl: z.boolean().optional(),
});

export type DatabaseConfig = z.infer<typeof DatabaseConfigSchema>;

export interface QueryResult {
  rows: unknown[];
  rowCount: number;
}
