#!/usr/bin/env node
/**
 * MCP server binary — wires config, SearchEngine, and StdioTransport.
 * Run via: node dist/bin.js
 * OpenCode configures this as an MCP server in its config.
 *
 * Config is loaded from .ia-framework/project.json relative to cwd,
 * or from the IA_FRAMEWORK_CONFIG environment variable if set.
 */
import { join } from 'node:path';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { loadConfig, createLogger } from '@ia-framework/core';
import { createEmbeddingProvider } from '@ia-framework/embedding';
import { QdrantVectorStore } from '@ia-framework/vector-store';
import { SearchEngine } from '@ia-framework/retrieval';
import { createMcpServer } from './server.js';

const logger = createLogger('mcp-server');

async function main(): Promise<void> {
  // Load config from .ia-framework/project.json (searches from cwd)
  const configPath =
    process.env['IA_FRAMEWORK_CONFIG'] ??
    join(process.cwd(), '.ia-framework', 'project.json');

  const config = await loadConfig(configPath);

  const embeddingProvider = createEmbeddingProvider(config.embedding);
  const vectorStore = new QdrantVectorStore({
    host: config.vectorStore.host,
    port: config.vectorStore.port,
    collectionName: config.vectorStore.collectionName,
    apiKey: config.vectorStore.apiKey,
  });

  const searchEngine = new SearchEngine({ embeddingProvider, vectorStore });
  const server = createMcpServer({ searchEngine });

  const transport = new StdioServerTransport();
  await server.connect(transport);

  logger.info('MCP server started (stdio transport)');
}

main().catch((err: unknown) => {
  process.stderr.write(`MCP server fatal error: ${String(err)}\n`);
  process.exit(1);
});
