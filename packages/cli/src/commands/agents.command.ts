import { Command } from 'commander';
import { readFile, writeFile, access } from 'node:fs/promises';
import { join } from 'node:path';
import { loadConfig } from '@ia-framework/core';

export const RAG_MARKER_START = '<!-- ia-framework:rag-start -->';
export const RAG_MARKER_END = '<!-- ia-framework:rag-end -->';

export const RAG_CONTENT = `## Codebase RAG Tools (ia-framework)

This project is indexed by ia-framework. The following MCP tools provide
codebase context during AI-assisted development:

- \`search_codebase\` — Semantic search across the indexed codebase. Use for
  finding architectural patterns, existing interfaces, and related code.
  Parameters: \`query\` (required), \`limit\` (default 10), \`score_threshold\` (default 0.5),
  \`expand_hops\` (0=no expansion, 1=direct imports, 2=transitive)
- \`get_file\` — Retrieve all indexed content for a specific file by path.
  Use when you need the full context of a file before modifying it.
- \`get_dependencies\` — Get imports and exports for a file. Use before
  modifying a file to understand its dependency surface.
- \`query_database\` — Execute SQL against the connected database (if configured).

### When to use

- **Before modifying code:** search for related files and understand dependencies
- **Before planning features:** search for existing patterns and interfaces
- **Before refactoring:** get_dependencies to understand the impact surface

### Token-conscious usage

- Use \`limit: 3-5\` for quick lookups, \`limit: 10\` for deep exploration
- Raise \`score_threshold\` to 0.7 for precise matches
- Skip RAG for tasks that don't need codebase context (doc updates, config changes)

### RAG quality — MRR

ia-framework tracks **Mean Reciprocal Rank (MRR)** to measure retrieval quality.
MRR is the average of 1/rank for the first relevant result across benchmark queries:

- **MRR 1.0** — correct chunk is always the top result
- **MRR 0.5** — correct chunk is typically ranked 2nd
- **MRR < 0.3** — retrieval needs tuning (re-index, adjust score_threshold, or improve query phrasing)

Run \`ia-framework benchmark run\` after re-indexing or config changes to track MRR
over time. Results are stored in \`.ia-framework/metrics.sqlite\` and visible in the
dashboard. Use \`ia-framework benchmark compare <run-a> <run-b>\` to compare runs.`;

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
        // Auto-detect: AGENTS.md first, then CLAUDE.md
        const agentsPath = join(config.targetProjectPath, 'AGENTS.md');
        const claudePath = join(config.targetProjectPath, 'CLAUDE.md');

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

      for (const name of candidates) {
        const filePath = join(config.targetProjectPath, name);
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
