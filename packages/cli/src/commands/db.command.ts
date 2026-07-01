import { Command } from 'commander';
import { createInterface } from 'node:readline';
import { writeFile, mkdir } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { loadConfig, createLogger } from '@ia-framework/core';
import {
  loadDbConfig,
  PostgresSource,
  DbConfigNotFoundError,
  DatabaseConfigSchema,
} from '@ia-framework/db-context';
import type { DatabaseConfig } from '@ia-framework/db-context';
import { createEmbeddingProvider } from '@ia-framework/embedding';
import { QdrantVectorStore } from '@ia-framework/vector-store';
import { IndexingPipeline } from '@ia-framework/indexer';

const logger = createLogger('cli:db');

function resolveFrameworkDir(configPath: string): string {
  return dirname(configPath);
}

function resolveDbConfigPath(configPath: string): string {
  return join(resolveFrameworkDir(configPath), 'db.json');
}

/**
 * Write the database config to db.json, creating the parent directory
 * (e.g. `.ia-framework/`) if it does not yet exist. This is the single
 * writer of db.json, shared by the CLI and the installer flow.
 */
export async function writeDbConfig(dbConfigPath: string, config: DatabaseConfig): Promise<void> {
  await mkdir(dirname(dbConfigPath), { recursive: true });
  await writeFile(dbConfigPath, JSON.stringify(config, null, 2));
}

function getConfigPath(options: { config?: string }): string {
  return (
    options.config ||
    process.env['IA_FRAMEWORK_CONFIG'] ||
    join(process.cwd(), '.ia-framework', 'project.json')
  );
}

// ── configure subcommand ──────────────────────────────────────────────────────

function configureSubcommand(): Command {
  return new Command('configure')
    .description('Interactively configure database connection and save to db.json')
    .option('-c, --config <path>', 'Path to project.json config', '')
    .action(async (options: { config: string }) => {
      const configPath = getConfigPath(options);
      const dbConfigPath = resolveDbConfigPath(configPath);

      const rl = createInterface({ input: process.stdin, output: process.stdout });
      const prompt = (question: string): Promise<string> =>
        new Promise((resolve) => rl.question(question, resolve));

      try {
        const host = (await prompt('Host [localhost]: ')).trim() || 'localhost';
        const portStr = (await prompt('Port [5432]: ')).trim() || '5432';
        const port = parseInt(portStr, 10);
        const database = (await prompt('Database name: ')).trim();
        const user = (await prompt('User: ')).trim();

        // Disable echo for password
        process.stdout.write('Password: ');
        const password = await new Promise<string>((resolve) => {
          rl.once('line', resolve);
        });

        const sslAnswer = (await prompt('Use SSL? [y/N]: ')).trim().toLowerCase();
        const ssl = sslAnswer === 'y' || sslAnswer === 'yes';

        rl.close();

        const config = DatabaseConfigSchema.parse({ host, port, database, user, password, ssl });
        await writeDbConfig(dbConfigPath, config);
        console.log(`✓ Database config saved to .ia-framework/db.json`);
      } catch (err) {
        rl.close();
        console.error(`✗ Configuration failed: ${String(err)}`);
        process.exit(1);
      }
    });
}

// ── connect subcommand ────────────────────────────────────────────────────────

function connectSubcommand(): Command {
  return new Command('connect')
    .description('Test the database connection configured in db.json')
    .option('-c, --config <path>', 'Path to project.json config', '')
    .action(async (options: { config: string }) => {
      const configPath = getConfigPath(options);
      const dbConfigPath = resolveDbConfigPath(configPath);

      let config;
      try {
        config = await loadDbConfig(dbConfigPath);
      } catch (err) {
        if (err instanceof DbConfigNotFoundError) {
          console.log('Not configured. Run: ia-framework db configure');
        } else {
          console.error(`✗ Config error: ${String(err)}`);
        }
        return;
      }

      const source = new PostgresSource(config);
      try {
        const result = await source.testConnection();
        if (result.connected) {
          console.log(
            `✓ Connected to ${config.database}@${config.host}:${config.port} — ${result.tableCount} tables found`,
          );
        } else {
          console.error(`✗ Connection failed`);
          process.exit(1);
        }
      } catch (err) {
        console.error(`✗ Connection failed: ${String(err instanceof Error ? err.message : err)}`);
        process.exit(1);
      } finally {
        await source.close();
      }
    });
}

// ── index subcommand ──────────────────────────────────────────────────────────

function indexSubcommand(): Command {
  return new Command('index')
    .description('Index database schema into Qdrant for semantic search')
    .option('-c, --config <path>', 'Path to project.json config', '')
    .action(async (options: { config: string }) => {
      const configPath = getConfigPath(options);
      const dbConfigPath = resolveDbConfigPath(configPath);

      let config;
      try {
        config = await loadConfig(configPath);
      } catch (err) {
        console.error(`✗ Project not configured: ${String(err)}`);
        process.exit(1);
        return;
      }

      let dbConfig;
      try {
        dbConfig = await loadDbConfig(dbConfigPath);
      } catch (err) {
        if (err instanceof DbConfigNotFoundError) {
          console.error('✗ Database not configured. Run: ia-framework db configure');
        } else {
          console.error(`✗ Database config error: ${String(err)}`);
        }
        process.exit(1);
        return;
      }

      const source = new PostgresSource(dbConfig);
      try {
        console.log('Indexing database schema...');

        const embeddingProvider = createEmbeddingProvider(config.embedding);
        const vectorStore = new QdrantVectorStore({
          host: config.vectorStore.host,
          port: config.vectorStore.port,
          collectionName: config.vectorStore.collectionName,
          apiKey: config.vectorStore.apiKey,
        });

        const pipeline = new IndexingPipeline();
        // DB-only indexing does not scan files (excludePatterns: ['**/*']),
        // so the target path is just a base. Fall back to the first repo path
        // or the framework dir when the legacy targetProjectPath is absent.
        const targetProjectPath =
          config.targetProjectPath ?? config.repos?.[0]?.path ?? resolveFrameworkDir(configPath);
        const result = await pipeline.run({
          targetProjectPath,
          frameworkDir: resolveFrameworkDir(configPath),
          collectionName: config.vectorStore.collectionName,
          embeddingProvider,
          vectorStore,
          contextSources: [source],
          includePatterns: [],
          excludePatterns: ['**/*'],
        });

        console.log(`✓ Indexed ${result.chunksIndexed} schema chunks`);
      } catch (err) {
        logger.error({ err }, 'DB index failed');
        console.error(`✗ Indexing failed: ${String(err)}`);
        process.exit(1);
      } finally {
        await source.close();
      }
    });
}

// ── status subcommand ─────────────────────────────────────────────────────────

function statusSubcommand(): Command {
  return new Command('status')
    .description('Show database configuration and connection status')
    .option('-c, --config <path>', 'Path to project.json config', '')
    .action(async (options: { config: string }) => {
      const configPath = getConfigPath(options);
      const dbConfigPath = resolveDbConfigPath(configPath);

      let config;
      try {
        config = await loadDbConfig(dbConfigPath);
      } catch {
        console.log('Database: not configured');
        return;
      }

      console.log('Database: configured');
      console.log(
        `Config: ${config.host}:${config.port}/${config.database} (user: ${config.user})`,
      );

      const source = new PostgresSource(config);
      try {
        const result = await source.testConnection();
        if (result.connected) {
          console.log('Connection: ✓ connected');
          console.log(`Tables: ${result.tableCount}`);
        } else {
          console.log('Connection: ✗ failed');
          console.log('Tables: —');
        }
      } catch (err) {
        console.log(`Connection: ✗ failed (${String(err instanceof Error ? err.message : err)})`);
        console.log('Tables: —');
      } finally {
        await source.close();
      }
    });
}

// ── top-level db command ──────────────────────────────────────────────────────

export function dbCommand(): Command {
  const cmd = new Command('db').description('Database context commands');
  cmd.addCommand(configureSubcommand());
  cmd.addCommand(connectSubcommand());
  cmd.addCommand(indexSubcommand());
  cmd.addCommand(statusSubcommand());
  return cmd;
}
