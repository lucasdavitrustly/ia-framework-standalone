import { Command } from 'commander';
import { join } from 'node:path';
import {
  detectProject,
  confirmProfile,
  persistProfile,
  readPersistedProfile,
} from '@ia-framework/project-detector';
import type { PersistOptions } from '@ia-framework/project-detector';

export function initCommand(): Command {
  return new Command('init')
    .description('Detect target project stack and initialize configuration')
    .argument('<targetPath>', 'Absolute path to the target project')
    .option('-c, --config <path>', 'Path to project.json config', '')
    .option('-f, --force', 'Overwrite existing configuration')
    .option('--embed-model <model>', 'Embedding model name')
    .option('--embed-dims <dims>', 'Embedding dimensions')
    .option('--llm-model <model>', 'Ollama model for LLM chunking (e.g. llama3.2:latest)')
    .option('--llm-url <url>', 'Ollama URL for LLM chunking (default: http://localhost:11434)')
    .action(
      async (
        targetPath: string,
        options: {
          config: string;
          force?: boolean;
          embedModel?: string;
          embedDims?: string;
          llmModel?: string;
          llmUrl?: string;
        },
      ) => {
        const configPath =
          options.config ||
          process.env['IA_FRAMEWORK_CONFIG'] ||
          join(process.cwd(), '.ia-framework', 'project.json');

        try {
          // Check for existing config unless --force
          if (!options.force) {
            const existing = await readPersistedProfile(configPath);
            if (existing) {
              console.log(`Config already configured at: ${configPath}`);
              console.log('  Use --force to re-detect and overwrite.');
              return;
            }
          }

          console.log(`Detecting project stack at: ${targetPath}\n`);

          const detected = await detectProject(targetPath);
          const profile = confirmProfile(detected, {});

          // Build persist options
          const persistOptions: PersistOptions = {
            targetProjectPath: targetPath,
          };

          if (options.embedModel) {
            persistOptions.embeddingModel = options.embedModel;
            persistOptions.embeddingProvider = 'ollama';
          }

          if (options.embedDims) {
            persistOptions.embeddingDimensions = parseInt(options.embedDims, 10);
          }

          if (options.llmModel) {
            persistOptions.llmModel = options.llmModel;
          }
          if (options.llmUrl) {
            persistOptions.llmUrl = options.llmUrl;
          }

          await persistProfile(profile, configPath, persistOptions);

          console.log('Detected profile:');
          console.log(`  Languages:       ${profile.languages.join(', ') || '(none)'}`);
          console.log(`  Frameworks:      ${profile.frameworks.join(', ') || '(none)'}`);
          console.log(`  Package manager: ${profile.packageManager ?? '(unknown)'}`);
          console.log(`  Test runner:     ${profile.testRunner ?? '(unknown)'}`);
          console.log(`  Build command:   ${profile.buildCommand ?? '(unknown)'}`);
          console.log(`  Dev command:     ${profile.devCommand ?? '(unknown)'}`);

          if (options.embedModel) {
            console.log(
              `  Embed model:     ${options.embedModel}${options.embedDims ? ` (${options.embedDims}d)` : ''}`,
            );
          }

          if (options.llmModel) {
            console.log(`  LLM chunking:    ${options.llmModel}`);
          }

          console.log(`\nConfig written to: ${configPath}`);
        } catch (error) {
          console.error(`Init failed: ${String(error)}`);
          process.exit(1);
        }
      },
    );
}
