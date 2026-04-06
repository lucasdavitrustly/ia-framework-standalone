import { Command } from 'commander';

export function helloCommand(): Command {
  return new Command('hello')
    .description('Verify the ia-framework CLI is installed and working')
    .action(() => {
      console.log('ia-framework is installed and working!');
      console.log('');
      console.log('Available commands:');
      console.log('  ia-framework index    — Index your codebase into Qdrant');
      console.log('  ia-framework search   — Search your codebase');
      console.log('  ia-framework status   — Check indexing and Qdrant status');
      console.log('');
      console.log('Dashboard: http://localhost:3000');
    });
}
