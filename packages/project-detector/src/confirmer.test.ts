import { describe, it, expect } from 'vitest';
import { confirmProfile } from './confirmer.js';
import type { ProjectProfile } from '@ia-framework/core';

const detected: ProjectProfile = {
  languages: ['typescript', 'javascript'],
  frameworks: ['react', 'next.js'],
  packageManager: 'pnpm',
  testRunner: 'vitest',
  buildCommand: 'pnpm build',
  devCommand: 'pnpm dev',
};

describe('confirmProfile', () => {
  it('returns profile unchanged when no overrides', () => {
    const result = confirmProfile(detected, {});
    expect(result).toEqual(detected);
  });

  it('overrides packageManager', () => {
    const result = confirmProfile(detected, { packageManager: 'yarn' });
    expect(result.packageManager).toBe('yarn');
    expect(result.frameworks).toEqual(detected.frameworks); // unchanged
  });

  it('replaces frameworks array', () => {
    const result = confirmProfile(detected, { frameworks: ['express'] });
    expect(result.frameworks).toEqual(['express']);
  });

  it('overrides testRunner', () => {
    const result = confirmProfile(detected, { testRunner: 'jest' });
    expect(result.testRunner).toBe('jest');
  });

  it('merges extra languages', () => {
    const result = confirmProfile(detected, { extraLanguages: ['python'] });
    expect(result.languages).toContain('typescript');
    expect(result.languages).toContain('python');
  });

  it('removes specified languages', () => {
    const result = confirmProfile(detected, { removeLanguages: ['javascript'] });
    expect(result.languages).not.toContain('javascript');
    expect(result.languages).toContain('typescript');
  });
});
