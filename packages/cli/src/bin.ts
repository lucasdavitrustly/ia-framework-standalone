#!/usr/bin/env node
import { Command } from 'commander';
import { indexCommand } from './commands/index.command.js';
import { searchCommand } from './commands/search.command.js';
import { statusCommand } from './commands/status.command.js';
import { benchmarkCommand } from './commands/benchmark.command.js';
import { dbCommand } from './commands/db.command.js';
import { agentsCommand } from './commands/agents.command.js';

const program = new Command('ia-framework')
  .version('0.1.0')
  .description('AI codebase context framework — index your codebase for AI understanding');

program.addCommand(indexCommand());
program.addCommand(searchCommand());
program.addCommand(statusCommand());
program.addCommand(benchmarkCommand());
program.addCommand(dbCommand());
program.addCommand(agentsCommand());

program.parseAsync(process.argv).catch((err: unknown) => {
  process.stderr.write(`CLI error: ${String(err)}\n`);
  process.exit(1);
});
