#!/usr/bin/env node
/**
 * detect-project.mjs — Called by init-config.sh to auto-detect a target project's
 * tech stack and write a ProjectProfile into project.json.
 *
 * Usage: node detect-project.mjs <targetPath> <configPath> [embedModel] [embedDims]
 *
 * Exit code 0 = success (config written), non-zero = detection failed.
 */

const [targetPath, configPath, embedModel, embedDims] = process.argv.slice(2);

if (!targetPath || !configPath) {
  console.error('Usage: node detect-project.mjs <targetPath> <configPath> [embedModel] [embedDims]');
  process.exit(1);
}

try {
  const { detectProject, confirmProfile, persistProfile } = await import(
    '../packages/project-detector/dist/index.js'
  );

  const detected = await detectProject(targetPath);

  // Auto-confirm with no overrides (non-interactive install)
  const profile = confirmProfile(detected, {});

  // Build persist options with optional model/dimensions from install-ollama.sh
  const persistOptions = { targetProjectPath: targetPath };
  if (embedModel) {
    persistOptions.embeddingModel = embedModel;
    persistOptions.embeddingProvider = 'ollama';
  }
  if (embedDims) {
    persistOptions.embeddingDimensions = parseInt(embedDims, 10);
  }

  // Persist profile into project.json, setting targetProjectPath and embedding options
  await persistProfile(profile, configPath, persistOptions);

  // Display what was detected
  console.log(`    Languages:       ${profile.languages.join(', ') || '(none)'}`);
  console.log(`    Frameworks:      ${profile.frameworks.join(', ') || '(none)'}`);
  console.log(`    Package manager: ${profile.packageManager ?? '(unknown)'}`);
  console.log(`    Test runner:     ${profile.testRunner ?? '(unknown)'}`);
  console.log(`    Build command:   ${profile.buildCommand ?? '(unknown)'}`);
  console.log(`    Dev command:     ${profile.devCommand ?? '(unknown)'}`);
  if (embedModel) {
    console.log(`    Embed model:     ${embedModel}${embedDims ? ` (${embedDims}d)` : ''}`);
  }
} catch (err) {
  console.error(`Detection error: ${err.message ?? err}`);
  process.exit(1);
}
