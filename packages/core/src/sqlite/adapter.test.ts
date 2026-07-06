import { describe, test, expect, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createDatabase, detectSqliteBackend } from './adapter.js';

describe('SQLite adapter', () => {
  const tmpDirs: string[] = [];

  function freshDbPath(): string {
    const dir = mkdtempSync(join(tmpdir(), 'sqlite-adapter-'));
    tmpDirs.push(dir);
    return join(dir, 'test.sqlite');
  }

  afterEach(() => {
    while (tmpDirs.length) {
      const dir = tmpDirs.pop();
      if (dir) rmSync(dir, { recursive: true, force: true });
    }
  });

  test('detectSqliteBackend returns an available backend on Node 22.5+', () => {
    const backend = detectSqliteBackend();
    // On Node 22.5+ this should be 'node:sqlite'; on older with better-sqlite3
    // installed it is 'better-sqlite3'. In this repo one of them is present.
    expect(backend === 'node:sqlite' || backend === 'better-sqlite3').toBe(true);
  });

  test('createDatabase reports the selected backend', () => {
    const { db, backend } = createDatabase(':memory:');
    expect(backend === 'node:sqlite' || backend === 'better-sqlite3').toBe(true);
    db.close();
  });

  test('basic CRUD: exec, prepare, run, all, get', () => {
    const { db } = createDatabase(freshDbPath());
    db.exec('CREATE TABLE items (id INTEGER PRIMARY KEY, value TEXT)');

    const insert = db.prepare('INSERT INTO items (id, value) VALUES (?, ?)');
    insert.run(1, 'alpha');
    insert.run(2, 'beta');

    const all = db.prepare('SELECT * FROM items ORDER BY id').all() as Array<{
      id: number;
      value: string;
    }>;
    expect(all).toEqual([
      { id: 1, value: 'alpha' },
      { id: 2, value: 'beta' },
    ]);

    const one = db.prepare('SELECT value FROM items WHERE id = ?').get(2) as
      | { value: string }
      | undefined;
    expect(one?.value).toBe('beta');

    db.close();
  });

  test('pragma directive is applied without throwing', () => {
    const { db } = createDatabase(freshDbPath());
    expect(() => db.pragma('journal_mode = DELETE')).not.toThrow();
    expect(() => db.pragma('busy_timeout = 5000')).not.toThrow();
    db.close();
  });

  test('transaction commits all statements on success', () => {
    const { db } = createDatabase(freshDbPath());
    db.exec('CREATE TABLE t (n INTEGER)');
    const insert = db.prepare('INSERT INTO t (n) VALUES (?)');

    const insertMany = db.transaction((nums: number[]) => {
      for (const n of nums) insert.run(n);
    });
    insertMany([1, 2, 3]);

    const rows = db.prepare('SELECT n FROM t ORDER BY n').all() as Array<{ n: number }>;
    expect(rows.map((r) => r.n)).toEqual([1, 2, 3]);
    db.close();
  });

  test('transaction rolls back all statements on error', () => {
    const { db } = createDatabase(freshDbPath());
    db.exec('CREATE TABLE t (n INTEGER)');
    const insert = db.prepare('INSERT INTO t (n) VALUES (?)');

    const failing = db.transaction((nums: number[]) => {
      for (const n of nums) {
        insert.run(n);
        if (n === 2) throw new Error('boom');
      }
    });

    expect(() => failing([1, 2, 3])).toThrow('boom');

    const rows = db.prepare('SELECT n FROM t').all() as Array<{ n: number }>;
    // Rolled back — no rows should have been committed.
    expect(rows.length).toBe(0);
    db.close();
  });

  test('named-parameter object binding works', () => {
    const { db } = createDatabase(freshDbPath());
    db.exec('CREATE TABLE users (id TEXT, name TEXT)');
    const stmt = db.prepare('INSERT INTO users (id, name) VALUES (@id, @name)');
    stmt.run({ id: 'u1', name: 'Alice' });

    const row = db.prepare('SELECT name FROM users WHERE id = ?').get('u1') as
      | { name: string }
      | undefined;
    expect(row?.name).toBe('Alice');
    db.close();
  });
});
