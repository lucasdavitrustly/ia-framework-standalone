import { access } from 'node:fs/promises';
import type { ProjectProfile } from '@ia-framework/core';
import { detectLanguages } from './detectors/language.js';
import { detectPackageManager } from './detectors/package-manager.js';
import { detectFrameworks } from './detectors/framework.js';
import { detectTestRunner } from './detectors/test-runner.js';
import { detectCommands } from './detectors/commands.js';

export class DetectionError extends Error {
  constructor(
    public readonly projectPath: string,
    cause: unknown,
  ) {
    super(`Cannot detect project at path: ${projectPath}`);
    this.name = 'DetectionError';
    this.cause = cause;
  }
}

export interface DetectionResult extends ProjectProfile {
  /** Absolute path that was scanned */
  scannedPath: string;
}

export async function detectProject(projectPath: string): Promise<DetectionResult> {
  // Verify path exists
  try {
    await access(projectPath);
  } catch (err) {
    throw new DetectionError(projectPath, err);
  }

  const [languages, packageManager, frameworks, testRunner, { buildCommand, devCommand }] =
    await Promise.all([
      detectLanguages(projectPath),
      detectPackageManager(projectPath),
      detectFrameworks(projectPath),
      detectTestRunner(projectPath),
      detectCommands(projectPath),
    ]);

  return {
    scannedPath: projectPath,
    languages,
    packageManager,
    frameworks,
    testRunner,
    buildCommand,
    devCommand,
  };
}
