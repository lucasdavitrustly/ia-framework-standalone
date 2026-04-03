import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Hoist all mocks ───────────────────────────────────────────────────────────
const { mockDetectProject, mockConfirmProfile, mockPersistProfile, mockReadPersistedProfile } =
  vi.hoisted(() => {
    const mockDetectProject = vi.fn();
    const mockConfirmProfile = vi.fn();
    const mockPersistProfile = vi.fn().mockResolvedValue(undefined);
    const mockReadPersistedProfile = vi.fn();
    return { mockDetectProject, mockConfirmProfile, mockPersistProfile, mockReadPersistedProfile };
  });

vi.mock('@ia-framework/project-detector', () => ({
  detectProject: mockDetectProject,
  confirmProfile: mockConfirmProfile,
  persistProfile: mockPersistProfile,
  readPersistedProfile: mockReadPersistedProfile,
  DetectionError: class DetectionError extends Error {
    constructor(
      public readonly projectPath: string,
      cause: unknown,
    ) {
      super(`Cannot detect project at path: ${projectPath}`);
      this.name = 'DetectionError';
      this.cause = cause;
    }
  },
}));

// ── Import the command factory after mocks ────────────────────────────────────
import { initCommand } from './init.command.js';

const baseProfile = {
  languages: ['typescript', 'javascript'],
  frameworks: ['react', 'next.js'],
  packageManager: 'pnpm',
  testRunner: 'vitest',
  buildCommand: 'pnpm build',
  devCommand: 'pnpm dev',
};

const baseDetectionResult = {
  ...baseProfile,
  scannedPath: '/target/project',
};

// Helper: capture stdout/stderr from console.log/error
function captureOutput(fn: () => Promise<void>): Promise<{ out: string[]; err: string[] }> {
  const out: string[] = [];
  const err: string[] = [];
  const originalLog = console.log;
  const originalError = console.error;
  console.log = (...args: unknown[]) => out.push(args.map(String).join(' '));
  console.error = (...args: unknown[]) => err.push(args.map(String).join(' '));
  return fn().then(
    () => {
      console.log = originalLog;
      console.error = originalError;
      return { out, err };
    },
    (e: unknown) => {
      console.log = originalLog;
      console.error = originalError;
      throw e;
    },
  );
}

// Helper: parse and run the init command
async function runInit(
  args: string[],
): Promise<{ out: string[]; err: string[]; exitCode: number | undefined }> {
  const cmd = initCommand();
  let exitCode: number | undefined;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mockExit = vi.spyOn(process, 'exit').mockImplementation(((code?: any) => {
    exitCode = typeof code === 'number' ? code : 0;
    throw new Error(`process.exit(${exitCode})`);
  }) as never);

  const { out, err } = await captureOutput(async () => {
    try {
      await cmd.parseAsync(['node', 'init', ...args]);
    } catch (e: unknown) {
      if (!(e instanceof Error) || !e.message.startsWith('process.exit')) {
        throw e;
      }
    }
  });

  mockExit.mockRestore();
  return { out, err, exitCode };
}

describe('init command', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDetectProject.mockResolvedValue(baseDetectionResult);
    mockConfirmProfile.mockReturnValue(baseProfile);
    mockReadPersistedProfile.mockResolvedValue(undefined);
  });

  // Test 1: Calls detectProject with the provided target path
  it('calls detectProject with the provided target path', async () => {
    await runInit(['/target/project']);

    expect(mockDetectProject).toHaveBeenCalledWith('/target/project');
  });

  // Test 2: Calls confirmProfile with detection result and empty overrides
  it('calls confirmProfile with detection result and empty overrides', async () => {
    await runInit(['/target/project']);

    expect(mockConfirmProfile).toHaveBeenCalledWith(baseDetectionResult, {});
  });

  // Test 3: Calls persistProfile with confirmed profile and config path
  it('calls persistProfile with confirmed profile and config path', async () => {
    await runInit(['/target/project', '--config', '/custom/project.json']);

    expect(mockPersistProfile).toHaveBeenCalledWith(
      baseProfile,
      '/custom/project.json',
      expect.objectContaining({ targetProjectPath: '/target/project' }),
    );
  });

  // Test 4: Passes embed-model and embed-dims to persist options
  it('passes embed-model and embed-dims to persist options', async () => {
    await runInit([
      '/target/project',
      '--embed-model',
      'mxbai-embed-large',
      '--embed-dims',
      '1024',
    ]);

    expect(mockPersistProfile).toHaveBeenCalledWith(
      baseProfile,
      expect.any(String),
      expect.objectContaining({
        embeddingModel: 'mxbai-embed-large',
        embeddingProvider: 'ollama',
        embeddingDimensions: 1024,
      }),
    );
  });

  // Test 5: Prints detected profile information
  it('prints detected profile information', async () => {
    const { out } = await runInit(['/target/project']);

    const output = out.join('\n');
    expect(output).toContain('typescript');
    expect(output).toContain('react');
    expect(output).toContain('pnpm');
    expect(output).toContain('vitest');
  });

  // Test 6: Skips existing config without --force
  it('skips when config already exists and --force not given', async () => {
    mockReadPersistedProfile.mockResolvedValue(baseProfile);

    const { out } = await runInit(['/target/project', '--config', '/existing/project.json']);

    const output = out.join('\n');
    expect(output).toMatch(/already configured|--force/i);
    expect(mockDetectProject).not.toHaveBeenCalled();
  });

  // Test 7: Re-detects when --force is used with existing config
  it('re-detects when --force is used with existing config', async () => {
    mockReadPersistedProfile.mockResolvedValue(baseProfile);

    await runInit(['/target/project', '--config', '/existing/project.json', '--force']);

    expect(mockDetectProject).toHaveBeenCalledWith('/target/project');
    expect(mockPersistProfile).toHaveBeenCalled();
  });

  // Test 8: Exits 1 on detection failure
  it('exits 1 on detection failure', async () => {
    mockDetectProject.mockRejectedValue(new Error('Path not found'));

    const { exitCode } = await runInit(['/nonexistent/path']);

    expect(exitCode).toBe(1);
  });

  // Test 9: Prints error message on detection failure
  it('prints error message on detection failure', async () => {
    mockDetectProject.mockRejectedValue(new Error('Path not found'));

    const { err } = await runInit(['/nonexistent/path']);

    expect(err.join('\n')).toMatch(/failed|error|Path not found/i);
  });
});
