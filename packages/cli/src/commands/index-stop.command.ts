import { Command } from 'commander';
import { join, dirname } from 'node:path';
import { writeFile } from 'node:fs/promises';

function resolveFrameworkDir(configPath: string): string {
  return dirname(configPath);
}

export function indexStopCommand(): Command {
  return new Command('index-stop')
    .description('Request cancellation of a running indexing job')
    .option('-c, --config <path>', 'Path to project.json config', '')
    .action(async (options: { config: string }) => {
      const configPath =
        options.config ||
        process.env['IA_FRAMEWORK_CONFIG'] ||
        join(process.cwd(), '.ia-framework', 'project.json');
      const frameworkDir = resolveFrameworkDir(configPath);
      const sentinelPath = join(frameworkDir, 'indexing-stop-requested');

      try {
        await writeFile(sentinelPath, '', 'utf-8');
        console.log('✓ Stop requested — indexing will halt after the current batch');
      } catch (err) {
        console.error(`✗ Failed to write stop sentinel: ${String(err)}`);
        process.exit(1);
      }
    });
}
