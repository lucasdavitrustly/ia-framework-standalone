import type { ProjectProfile } from '@ia-framework/core';

export interface ProfileOverrides {
  languages?: string[] | undefined;
  frameworks?: string[] | undefined;
  packageManager?: string | undefined;
  testRunner?: string | undefined;
  buildCommand?: string | undefined;
  devCommand?: string | undefined;
  /** Languages to add to the detected list */
  extraLanguages?: string[] | undefined;
  /** Languages to remove from the detected list */
  removeLanguages?: string[] | undefined;
}

export function confirmProfile(
  detected: ProjectProfile,
  overrides: ProfileOverrides,
): ProjectProfile {
  let languages = overrides.languages ?? [...detected.languages];

  if (overrides.extraLanguages) {
    const toAdd = overrides.extraLanguages.filter((l) => !languages.includes(l));
    languages = [...languages, ...toAdd];
  }

  if (overrides.removeLanguages) {
    const toRemove = new Set(overrides.removeLanguages);
    languages = languages.filter((l) => !toRemove.has(l));
  }

  return {
    languages,
    frameworks: overrides.frameworks ?? [...detected.frameworks],
    packageManager: overrides.packageManager ?? detected.packageManager,
    testRunner: overrides.testRunner ?? detected.testRunner,
    buildCommand: overrides.buildCommand ?? detected.buildCommand,
    devCommand: overrides.devCommand ?? detected.devCommand,
  };
}
