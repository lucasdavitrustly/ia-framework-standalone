import { describe, it, expect } from 'vitest';
import { indexCommand } from './commands/index.command.js';
import { searchCommand } from './commands/search.command.js';
import { statusCommand } from './commands/status.command.js';

describe('CLI commands', () => {
  it('indexCommand() returns a Command named "index"', () => {
    const cmd = indexCommand();
    expect(cmd.name()).toBe('index');
    expect(cmd.description()).toContain('Index');
  });

  it('searchCommand() returns a Command named "search"', () => {
    const cmd = searchCommand();
    expect(cmd.name()).toBe('search');
    expect(cmd.description()).toContain('Search');
  });

  it('statusCommand() returns a Command named "status"', () => {
    const cmd = statusCommand();
    expect(cmd.name()).toBe('status');
    expect(cmd.description()).toContain('status');
  });

  it('indexCommand() has --force option', () => {
    const cmd = indexCommand();
    const options = cmd.options.map((o) => o.long);
    expect(options).toContain('--force');
  });

  it('searchCommand() has --limit and --threshold options', () => {
    const cmd = searchCommand();
    const options = cmd.options.map((o) => o.long);
    expect(options).toContain('--limit');
    expect(options).toContain('--threshold');
  });

  it('statusCommand() has --config option', () => {
    const cmd = statusCommand();
    const options = cmd.options.map((o) => o.long);
    expect(options).toContain('--config');
  });
});
