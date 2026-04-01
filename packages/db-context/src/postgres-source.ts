import { createHash } from 'node:crypto';
import { Pool } from 'pg';
import type { ChunkMetadata, ContextSource } from '@ia-framework/core';
import type { DatabaseConfig, QueryResult } from './types.js';

function tableChunkId(tableName: string): string {
  return createHash('sha256').update(`db:${tableName}`).digest('hex').slice(0, 32);
}

interface TableRow {
  table_name: string;
  table_type: string;
}

interface ColumnRow {
  column_name: string;
  data_type: string;
  is_nullable: string;
  column_default: string | null;
  character_maximum_length: number | null;
}

interface ForeignKeyRow {
  table_name: string;
  column_name: string;
  foreign_table_name: string;
  foreign_column_name: string;
}

export class PostgresSource implements ContextSource {
  readonly name = 'postgres';
  private readonly pool: Pool;

  constructor(config: DatabaseConfig, pool?: Pool) {
    if (pool) {
      this.pool = pool;
    } else {
      this.pool = new Pool({
        host: config.host,
        port: config.port,
        database: config.database,
        user: config.user,
        password: config.password,
        ssl: config.ssl ? { rejectUnauthorized: false } : false,
      });
    }
  }

  async testConnection(): Promise<{ connected: boolean; tableCount: number }> {
    try {
      const result = await this.pool.query<{ count: string }>(
        `SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'public'`,
      );
      const count = parseInt(result.rows[0]?.count ?? '0', 10);
      return { connected: true, tableCount: count };
    } catch {
      return { connected: false, tableCount: 0 };
    }
  }

  async getChunks(): Promise<ChunkMetadata[]> {
    // Fetch all tables and views
    const tablesResult = await this.pool.query<TableRow>(
      `SELECT table_name, table_type
       FROM information_schema.tables
       WHERE table_schema = 'public'
       ORDER BY table_name`,
    );

    if (tablesResult.rows.length === 0) {
      return [];
    }

    // Fetch all foreign keys in a single query
    const fkResult = await this.pool.query<ForeignKeyRow>(
      `SELECT
        tc.table_name,
        kcu.column_name,
        ccu.table_name AS foreign_table_name,
        ccu.column_name AS foreign_column_name
       FROM information_schema.table_constraints AS tc
       JOIN information_schema.key_column_usage AS kcu
         ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema
       JOIN information_schema.constraint_column_usage AS ccu
         ON ccu.constraint_name = tc.constraint_name AND ccu.table_schema = tc.table_schema
       WHERE tc.constraint_type = 'FOREIGN KEY' AND tc.table_schema = 'public'`,
    );

    // Group FKs by table
    const fksByTable = new Map<string, ForeignKeyRow[]>();
    for (const fk of fkResult.rows) {
      const existing = fksByTable.get(fk.table_name) ?? [];
      existing.push(fk);
      fksByTable.set(fk.table_name, existing);
    }

    const chunks: ChunkMetadata[] = [];
    const indexedAt = new Date().toISOString();

    for (const table of tablesResult.rows) {
      const tableName = table.table_name;
      const chunkType: ChunkMetadata['chunkType'] = table.table_type === 'VIEW' ? 'view' : 'table';

      // Fetch columns for this table
      const colResult = await this.pool.query<ColumnRow>(
        `SELECT column_name, data_type, is_nullable, column_default, character_maximum_length
         FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name = $1
         ORDER BY ordinal_position`,
        [tableName],
      );

      // Format content
      const lines: string[] = [`Table: ${tableName}`, 'Columns:'];
      for (const col of colResult.rows) {
        const nullable = col.is_nullable === 'YES' ? '' : ' NOT NULL';
        lines.push(`  ${col.column_name}: ${col.data_type}${nullable}`);
      }

      const tableFks = fksByTable.get(tableName) ?? [];
      if (tableFks.length > 0) {
        lines.push('Foreign keys:');
        for (const fk of tableFks) {
          lines.push(`  ${fk.table_name}.${fk.column_name} → ${fk.foreign_table_name}.${fk.foreign_column_name}`);
        }
      }

      chunks.push({
        id: tableChunkId(tableName),
        filePath: '__db__',
        relativePath: tableName,
        language: 'sql',
        chunkType,
        name: tableName,
        content: lines.join('\n'),
        startLine: 0,
        endLine: 0,
        imports: [],
        exports: [],
        indexedAt,
      });
    }

    return chunks;
  }

  async executeQuery(sql: string): Promise<QueryResult> {
    const result = await this.pool.query(sql);
    return {
      rows: result.rows as unknown[],
      rowCount: result.rowCount ?? 0,
    };
  }

  async close(): Promise<void> {
    await this.pool.end();
  }
}
