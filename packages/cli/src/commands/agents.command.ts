import { Command } from 'commander';
import { readFile, writeFile, access } from 'node:fs/promises';
import { join } from 'node:path';
import { loadConfig } from '@ia-framework/core';

export const RAG_MARKER_START = '<!-- ia-framework:rag-start -->';
export const RAG_MARKER_END = '<!-- ia-framework:rag-end -->';

export const RAG_CONTENT = `## Codebase RAG Tools (ia-framework)

This project is indexed by ia-framework. The following MCP tools provide
codebase context during AI-assisted development:

- \`search_codebase\` — Semantic search across the indexed codebase using
  query auto-classification (semantic / keyword / existence / aggregation).
  Results include live file content for the top-5 matches and metadata-only
  for results 6-10. Stale results (file changed since indexing) are flagged.
  Parameters: \`query\` (required), \`limit\` (default 10), \`score_threshold\`
  (default 0.5), \`expand_hops\` (0=no expansion, 1=direct imports, 2=transitive),
  \`fallback\` (default true), \`repo\`, \`stereotype\`, \`archLayer\`, \`module\`,
  \`language\` — optional filters for precise retrieval.
- \`get_file\` — Retrieve a file's content and indexed chunk metadata by path.
  Reads live content from the filesystem first; falls back to stored Qdrant
  content if the file is not accessible. Also returns chunk-level metadata
  (imports, exports, dependency edges).
  Parameters: \`path\` (required).
- \`get_dependencies\` — Get dependency graph for a file or module.
  Supports \`path\` (file-level) OR \`module\` (module-level with BFS traversal).
  Returns \`imports\`, \`exports\`, and full \`dependencyEdges\` for graph navigation.
  Parameters: \`path\` OR \`module\` (one required), \`depth\` (BFS hops, default 1).

### When to use

- **Before modifying code:** \`search_codebase\` to find related files, then
  \`get_file\` to read the target before editing
- **Before planning features:** \`search_codebase\` with \`archLayer\` or
  \`stereotype\` filters to find patterns (e.g., \`stereotype: "service"\`)
- **Before refactoring:** \`get_dependencies\` to understand the impact surface
- **Finding all implementations of an interface:** \`search_codebase\` with
  \`expand_hops: 2\` to follow the dependency graph transitively

### Filter examples

- Services in payments module: \`{ stereotype: "service", module: "payments" }\`
- All controllers: \`{ archLayer: "presentation" }\`
- Java only: \`{ language: "java" }\`

### Token-conscious usage

- Use \`limit: 3-5\` for quick lookups, \`limit: 10\` for deep exploration
- Raise \`score_threshold\` to 0.7 for precise matches
- Skip RAG for tasks that don't need codebase context (doc updates, config changes)
- Top-5 results include live code; results 6-10 are metadata-only to save tokens`;

function getConfigPath(options: { config?: string }): string {
  return (
    options.config ||
    process.env['IA_FRAMEWORK_CONFIG'] ||
    join(process.cwd(), '.ia-framework', 'project.json')
  );
}

/**
 * Inject RAG guidance content into a file using marker-based idempotency.
 * If markers already exist, replaces content between them.
 * If no markers exist, appends to end of file.
 * If file doesn't exist, creates it with the content.
 */
async function injectIntoFile(filePath: string): Promise<void> {
  const block = `${RAG_MARKER_START}\n${RAG_CONTENT}\n${RAG_MARKER_END}`;

  let existing = '';
  try {
    existing = await readFile(filePath, 'utf-8');
  } catch {
    // File doesn't exist — create with just the block
    await writeFile(filePath, `${block}\n`);
    return;
  }

  // Check for existing markers — replace if found
  const startIdx = existing.indexOf(RAG_MARKER_START);
  const endIdx = existing.indexOf(RAG_MARKER_END);

  if (startIdx !== -1 && endIdx !== -1) {
    // Replace between markers (inclusive)
    const before = existing.slice(0, startIdx);
    const after = existing.slice(endIdx + RAG_MARKER_END.length);
    await writeFile(filePath, `${before}${block}${after}`);
  } else {
    // Append to end
    const separator = existing.endsWith('\n') ? '\n' : '\n\n';
    await writeFile(filePath, `${existing}${separator}${block}\n`);
  }
}

/**
 * Check if a file exists.
 */
async function fileExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

// ── inject subcommand ─────────────────────────────────────────────────────────

function injectSubcommand(): Command {
  return new Command('inject')
    .description('Inject RAG tools guidance into target project agent documentation')
    .option('-c, --config <path>', 'Path to project.json config', '')
    .option('--file <path>', 'Target file path (overrides auto-detection)')
    .action(async (options: { config: string; file?: string }) => {
      const configPath = getConfigPath(options);

      let config;
      try {
        config = await loadConfig(configPath);
      } catch (err) {
        console.error(`Failed to load config: ${String(err)}`);
        process.exit(1);
        return;
      }

      let targetFile: string;

      if (options.file) {
        targetFile = options.file;
      } else {
        // Resolve project root: support both new repos[] format and legacy targetProjectPath
        const projectRoot = config.targetProjectPath ?? config.repos?.[0]?.path ?? process.cwd();
        // Auto-detect: AGENTS.md first, then CLAUDE.md
        const agentsPath = join(projectRoot, 'AGENTS.md');
        const claudePath = join(projectRoot, 'CLAUDE.md');

        if (await fileExists(agentsPath)) {
          targetFile = agentsPath;
        } else if (await fileExists(claudePath)) {
          targetFile = claudePath;
        } else {
          // Default to creating AGENTS.md
          targetFile = agentsPath;
        }
      }

      try {
        await injectIntoFile(targetFile);
        console.log(`RAG guidance injected into ${targetFile}`);
      } catch (err) {
        console.error(`Failed to inject: ${String(err)}`);
        process.exit(1);
      }
    });
}

// ── check subcommand ──────────────────────────────────────────────────────────

function checkSubcommand(): Command {
  return new Command('check')
    .description('Check if RAG tools guidance is present in target project agent docs')
    .option('-c, --config <path>', 'Path to project.json config', '')
    .action(async (options: { config: string }) => {
      const configPath = getConfigPath(options);

      let config;
      try {
        config = await loadConfig(configPath);
      } catch (err) {
        console.error(`Failed to load config: ${String(err)}`);
        process.exit(1);
        return;
      }

      const candidates = ['AGENTS.md', 'CLAUDE.md'];
      const found: string[] = [];

      // Resolve project root: support both new repos[] format and legacy targetProjectPath
      const projectRoot = config.targetProjectPath ?? config.repos?.[0]?.path ?? process.cwd();

      for (const name of candidates) {
        const filePath = join(projectRoot, name);
        try {
          const content = await readFile(filePath, 'utf-8');
          if (content.includes(RAG_MARKER_START)) {
            found.push(name);
          }
        } catch {
          // File doesn't exist — skip
        }
      }

      if (found.length > 0) {
        console.log(`RAG guidance found in: ${found.join(', ')}`);
      } else {
        console.log('RAG guidance not found. Run: ia-framework agents inject');
      }
    });
}

// ── top-level agents command ──────────────────────────────────────────────────

export function agentsCommand(): Command {
  const cmd = new Command('agents').description('Target project agent documentation commands');
  cmd.addCommand(injectSubcommand());
  cmd.addCommand(checkSubcommand());
  return cmd;
}
