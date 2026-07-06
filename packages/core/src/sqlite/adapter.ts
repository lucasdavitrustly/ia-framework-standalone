/**
 * SQLite backend adapter.
 *
 * Provides a backend-agnostic SQLite interface so the rest of the codebase does
 * not depend directly on `better-sqlite3` (a native addon that only supports
 * Node 20-25). On Node 22.5+, the runtime's built-in `node:sqlite` module
 * (`DatabaseSync`) is used as the primary backend — this works on Node 26+ with
 * no native compilation. On older runtimes (Node 22.0-22.4) where `node:sqlite`
 * is unavailable, the adapter falls back to `better-sqlite3`.
 *
 * The two backends expose nearly identical synchronous APIs. This module
 * normalizes the three real differences:
 *  1. Pragmas: better-sqlite3 has `db.pragma(str)`; node:sqlite uses `exec('PRAGMA ...')`.
 *  2. Transactions: better-sqlite3 has `db.transaction(fn)`; node:sqlite uses
 *     manual BEGIN/COMMIT/ROLLBACK.
 *  3. Named parameters: both accept object binding; node:sqlite requires
 *     `allowBareNamedParameters` (default true) for unprefixed keys.
 */

import { createRequire } from 'node:module';

// Synchronous module loader usable from ESM. Both SQLite backends expose
// synchronous constructors, so we resolve them via require() (through
// createRequire) rather than async import() to keep createDatabase() sync.
const requireModule = createRequire(import.meta.url);

/** A prepared statement, backend-agnostic. */
export interface SqliteStatement {
  /** Execute with bound params; no result set. */
  run(...params: unknown[]): void;
  /** Execute and return all result rows. */
  all(...params: unknown[]): unknown[];
  /** Execute and return the first result row (or undefined). */
  get(...params: unknown[]): unknown;
}

/** A SQLite database connection, backend-agnostic. */
export interface SqliteDatabase {
  /** The database path/name (":memory:" for in-memory, "" for anonymous disk). */
  readonly name: string;
  /** Execute one or more raw SQL statements. */
  exec(sql: string): void;
  /** Prepare a statement for repeated execution. */
  prepare(sql: string): SqliteStatement;
  /** Apply or read a pragma. Write form: "journal_mode = DELETE". Read form: "journal_mode". */
  pragma(directive: string): unknown;
  /**
   * Run `fn` inside a transaction. Returns a callable that, when invoked with
   * arguments, executes `fn(...args)` wrapped in BEGIN/COMMIT (ROLLBACK on error).
   * Mirrors better-sqlite3's `db.transaction()` deferred-callable semantics.
   */
  transaction<A extends unknown[]>(fn: (...args: A) => void): (...args: A) => void;
  /** Close the connection. Idempotent — safe to call more than once. */
  close(): void;
}

/** Which backend an adapter instance is using. */
export type SqliteBackend = 'node:sqlite' | 'better-sqlite3';

/** Result of constructing a database, including which backend was selected. */
export interface SqliteDatabaseHandle {
  db: SqliteDatabase;
  backend: SqliteBackend;
}

// ---------------------------------------------------------------------------
// node:sqlite adapter
// ---------------------------------------------------------------------------

interface NodeSqliteStatement {
  run(...params: unknown[]): unknown;
  all(...params: unknown[]): unknown[];
  get(...params: unknown[]): unknown;
}

interface NodeSqliteDatabase {
  exec(sql: string): void;
  prepare(sql: string): NodeSqliteStatement;
  close(): void;
}

class NodeSqliteAdapter implements SqliteDatabase {
  readonly name: string;
  private readonly db: NodeSqliteDatabase;
  private closed = false;

  constructor(db: NodeSqliteDatabase, name: string) {
    this.db = db;
    this.name = name;
  }

  exec(sql: string): void {
    this.db.exec(sql);
  }

  prepare(sql: string): SqliteStatement {
    const stmt = this.db.prepare(sql);
    return {
      run: (...params: unknown[]): void => {
        stmt.run(...params);
      },
      all: (...params: unknown[]): unknown[] => stmt.all(...params),
      get: (...params: unknown[]): unknown => stmt.get(...params),
    };
  }

  pragma(directive: string): unknown {
    // node:sqlite has no dedicated pragma() method.
    // Write form ("key = value"): execute as a statement, no result.
    // Read form ("key"): query the pragma and return rows in the same shape
    // better-sqlite3 produces (array of row objects).
    if (directive.includes('=')) {
      this.db.exec(`PRAGMA ${directive}`);
      return undefined;
    }
    return this.db.prepare(`PRAGMA ${directive}`).all();
  }

  transaction<A extends unknown[]>(fn: (...args: A) => void): (...args: A) => void {
    return (...args: A): void => {
      this.db.exec('BEGIN');
      try {
        fn(...args);
        this.db.exec('COMMIT');
      } catch (err) {
        this.db.exec('ROLLBACK');
        throw err;
      }
    };
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    this.db.close();
  }
}

// ---------------------------------------------------------------------------
// better-sqlite3 adapter
// ---------------------------------------------------------------------------

interface BetterSqliteStatement {
  run(...params: unknown[]): unknown;
  all(...params: unknown[]): unknown[];
  get(...params: unknown[]): unknown;
}

interface BetterSqliteDatabase {
  readonly name: string;
  exec(sql: string): unknown;
  prepare(sql: string): BetterSqliteStatement;
  pragma(source: string): unknown;
  transaction<A extends unknown[]>(fn: (...args: A) => void): (...args: A) => void;
  close(): unknown;
}

class BetterSqliteAdapter implements SqliteDatabase {
  readonly name: string;
  private readonly db: BetterSqliteDatabase;
  private closed = false;

  constructor(db: BetterSqliteDatabase) {
    this.db = db;
    this.name = db.name;
  }

  exec(sql: string): void {
    this.db.exec(sql);
  }

  prepare(sql: string): SqliteStatement {
    const stmt = this.db.prepare(sql);
    return {
      run: (...params: unknown[]): void => {
        stmt.run(...params);
      },
      all: (...params: unknown[]): unknown[] => stmt.all(...params),
      get: (...params: unknown[]): unknown => stmt.get(...params),
    };
  }

  pragma(directive: string): unknown {
    return this.db.pragma(directive);
  }

  transaction<A extends unknown[]>(fn: (...args: A) => void): (...args: A) => void {
    return this.db.transaction(fn);
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    this.db.close();
  }
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/**
 * Attempt to construct a node:sqlite-backed database.
 * Returns undefined if the module is unavailable (Node < 22.5).
 */
function tryCreateNodeSqlite(path: string): SqliteDatabase | undefined {
  let mod: { DatabaseSync: new (p: string) => NodeSqliteDatabase } | undefined;
  try {
    // Use createRequire so a missing built-in on old runtimes is a catchable
    // error rather than a static import failure. node:sqlite is only present
    // on Node 22.5+.
    mod = requireModule('node:sqlite') as { DatabaseSync: new (p: string) => NodeSqliteDatabase };
  } catch {
    return undefined;
  }
  if (!mod || typeof mod.DatabaseSync !== 'function') return undefined;
  const db = new mod.DatabaseSync(path);
  return new NodeSqliteAdapter(db, path);
}

/**
 * Attempt to construct a better-sqlite3-backed database.
 * Returns undefined if the native addon is unavailable/incompatible.
 */
function tryCreateBetterSqlite(path: string): SqliteDatabase | undefined {
  let Ctor: (new (p: string) => BetterSqliteDatabase) | undefined;
  try {
    const mod = requireModule('better-sqlite3') as
      | (new (p: string) => BetterSqliteDatabase)
      | { default: new (p: string) => BetterSqliteDatabase };
    Ctor = typeof mod === 'function' ? mod : mod.default;
  } catch {
    return undefined;
  }
  if (typeof Ctor !== 'function') return undefined;
  const db = new Ctor(path);
  return new BetterSqliteAdapter(db);
}

/**
 * Create a SQLite database using the best available backend.
 *
 * Backend selection order:
 *  1. `node:sqlite` (built-in, Node 22.5+) — works on Node 26+ with no native addon.
 *  2. `better-sqlite3` (native addon) — fallback for Node 22.0-22.4.
 *
 * @throws Error if neither backend is available.
 */
export function createDatabase(path: string): SqliteDatabaseHandle {
  const viaNode = tryCreateNodeSqlite(path);
  if (viaNode) {
    return { db: viaNode, backend: 'node:sqlite' };
  }

  const viaBetter = tryCreateBetterSqlite(path);
  if (viaBetter) {
    return { db: viaBetter, backend: 'better-sqlite3' };
  }

  throw new Error(
    'No SQLite backend available. The built-in "node:sqlite" module requires ' +
      'Node 22.5+, and the "better-sqlite3" native addon failed to load ' +
      '(it supports Node 20-25 only). Upgrade to Node 22.5+ to use the built-in ' +
      'backend, or install a compatible "better-sqlite3" build.',
  );
}

/**
 * Detect which SQLite backend would be selected without opening a file.
 * Uses an in-memory probe. Returns undefined if none available.
 */
export function detectSqliteBackend(): SqliteBackend | undefined {
  const probe = tryCreateNodeSqlite(':memory:');
  if (probe) {
    probe.close();
    return 'node:sqlite';
  }
  const better = tryCreateBetterSqlite(':memory:');
  if (better) {
    better.close();
    return 'better-sqlite3';
  }
  return undefined;
}
