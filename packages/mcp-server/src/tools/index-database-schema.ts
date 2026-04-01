import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { dirname } from 'node:path';
import { loadConfig, ConfigNotFoundError, createLogger } from '@ia-framework/core';
import { loadDbConfig, PostgresSource, DbConfigNotFoundError } from '@ia-framework/db-context';
import { createEmbeddingProvider } from '@ia-framework/embedding';
import { QdrantVectorStore } from '@ia-framework/vector-store';
import { IndexingPipeline } from '@ia-framework/indexer';

const logger = createLogger('mcp-server:index-db-schema');

export type ToolOutput = CallToolResult;

/**
 * Handle the index_database_schema tool call.
 * Triggers IndexingPipeline with PostgresSource to embed DB schema into Qdrant.
 * Requires both project.json and db.json to be present.
 */
export async function indexDatabaseSchemaHandler(
  configPath: string,
  dbConfigPath: string,
): Promise<ToolOutput> {
  // Check project config
  let config;
  try {
    config = await loadConfig(configPath);
  } catch (err) {
    if (err instanceof ConfigNotFoundError) {
      return { content: [{ type: 'text', text: 'No project configured.' }] };
    }
    return { content: [{ type: 'text', text: `Config error: ${String(err)}` }] };
  }

  // Check db config
  let dbConfig;
  try {
    dbConfig = await loadDbConfig(dbConfigPath);
  } catch (err) {
    if (err instanceof DbConfigNotFoundError) {
      return {
        content: [{ type: 'text', text: 'Database not configured. Run: ia-framework db configure' }],
      };
    }
    return { content: [{ type: 'text', text: `Database config error: ${String(err)}` }] };
  }

  const postgresSource = new PostgresSource(dbConfig);
  try {
    const embeddingProvider = createEmbeddingProvider(config.embedding);
    const vectorStore = new QdrantVectorStore({
      host: config.vectorStore.host,
      port: config.vectorStore.port,
      collectionName: config.vectorStore.collectionName,
      apiKey: config.vectorStore.apiKey,
    });

    const pipeline = new IndexingPipeline();
    const result = await pipeline.run({
      targetProjectPath: config.targetProjectPath,
      frameworkDir: dirname(configPath),
      collectionName: config.vectorStore.collectionName,
      embeddingProvider,
      vectorStore,
      contextSources: [postgresSource],
      includePatterns: [],
      excludePatterns: ['**/*'],
    });

    logger.info({ chunksIndexed: result.chunksIndexed }, 'Database schema indexed');

    return {
      content: [{ type: 'text', text: `Indexed ${result.chunksIndexed} database schema chunks into Qdrant.` }],
    };
  } catch (err) {
    return { content: [{ type: 'text', text: String(err instanceof Error ? err.message : err) }] };
  } finally {
    await postgresSource.close();
  }
}

/**
 * Register the index_database_schema tool on an MCP server.
 */
export function registerIndexDatabaseSchemaTool(
  server: McpServer,
  configPath: string,
  dbConfigPath: string,
): void {
  server.registerTool(
    'index_database_schema',
    {
      description:
        'Index the PostgreSQL database schema into Qdrant for semantic search. Queries information_schema to build schema context.',
      inputSchema: {},
    },
    async () => {
      return indexDatabaseSchemaHandler(configPath, dbConfigPath);
    },
  );
}
