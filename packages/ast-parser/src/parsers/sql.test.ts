import { describe, it, expect } from 'vitest';
import { parseSql } from './sql.js';

/**
 * T048: Tests for SQL chunker.
 * Given a Flyway migration file (V*__*.sql), entire file is one chunk with chunkType 'migration'.
 */
describe('parseSql', () => {
  it('produces a single migration chunk for a Flyway migration file', () => {
    const content = `-- Flyway migration V1__Create_payment_table.sql
CREATE TABLE payment (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  order_id VARCHAR(50) NOT NULL,
  amount DECIMAL(19,4) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'PENDING',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_payment_order ON payment(order_id);`;

    const filePath = '/repo/src/main/resources/db/migration/V1__Create_payment_table.sql';
    const relativePath = 'src/main/resources/db/migration/V1__Create_payment_table.sql';

    const chunks = parseSql(content, filePath, relativePath);
    expect(chunks).toHaveLength(1);
    expect(chunks[0]!.chunkType).toBe('migration');
    expect(chunks[0]!.language).toBe('sql');
  });

  it('includes the entire file content in the migration chunk', () => {
    const content = `ALTER TABLE payment ADD COLUMN currency VARCHAR(3) NOT NULL DEFAULT 'USD';`;
    const filePath = '/repo/db/V2__Add_currency_column.sql';
    const relativePath = 'db/V2__Add_currency_column.sql';

    const chunks = parseSql(content, filePath, relativePath);
    expect(chunks[0]!.content).toBe(content);
  });

  it('uses the filename as the chunk name', () => {
    const content = `CREATE TABLE users (id INT PRIMARY KEY);`;
    const filePath = '/repo/db/V3__Create_users_table.sql';
    const relativePath = 'db/V3__Create_users_table.sql';

    const chunks = parseSql(content, filePath, relativePath);
    expect(chunks[0]!.name).toBe('V3__Create_users_table.sql');
  });

  it('assigns correct filePath and relativePath', () => {
    const content = `SELECT 1;`;
    const filePath = '/repo/migrations/V10__Sample.sql';
    const relativePath = 'migrations/V10__Sample.sql';

    const chunks = parseSql(content, filePath, relativePath);
    expect(chunks[0]!.filePath).toBe(filePath);
    expect(chunks[0]!.relativePath).toBe(relativePath);
  });

  it('assigns startLine=1 and endLine=total lines for the migration chunk', () => {
    const content = `CREATE TABLE foo (id INT);\nCREATE TABLE bar (id INT);`;
    const filePath = '/repo/db/V5__Multi_statement.sql';
    const relativePath = 'db/V5__Multi_statement.sql';

    const chunks = parseSql(content, filePath, relativePath);
    expect(chunks[0]!.startLine).toBe(1);
    expect(chunks[0]!.endLine).toBe(2);
  });

  it('produces a migration chunk for an empty SQL file', () => {
    const chunks = parseSql('', '/repo/db/V6__Empty.sql', 'db/V6__Empty.sql');
    expect(chunks).toHaveLength(1);
    expect(chunks[0]!.chunkType).toBe('migration');
  });

  it('assigns chunkIndex=0 and totalChunks=1', () => {
    const content = `DROP TABLE IF EXISTS legacy;`;
    const chunks = parseSql(content, '/repo/db/V7__Drop_legacy.sql', 'db/V7__Drop_legacy.sql');
    expect(chunks[0]!.chunkIndex).toBe(0);
    expect(chunks[0]!.totalChunks).toBe(1);
  });

  it('generates a deterministic id from filePath + startLine + endLine', () => {
    const content = `CREATE TABLE t (id INT);`;
    const filePath = '/repo/db/V8__Create_t.sql';
    const relativePath = 'db/V8__Create_t.sql';

    const [c1] = parseSql(content, filePath, relativePath);
    const [c2] = parseSql(content, filePath, relativePath);
    expect(c1!.id).toBe(c2!.id);
  });
});
