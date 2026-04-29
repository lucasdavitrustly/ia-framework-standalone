import { watch, type FSWatcher, type ChokidarOptions } from 'chokidar';
import { loadConfig } from '@ia-framework/core';
import type { ProjectConfig } from '@ia-framework/core';
import { EventEmitter } from 'node:events';
import { createLogger } from '@ia-framework/core';

const logger = createLogger('config-watcher');

const WATCH_OPTIONS: ChokidarOptions = { persistent: false };

export class ConfigWatcher extends EventEmitter {
  private config: ProjectConfig | null = null;
  private watcher: FSWatcher | null = null;

  constructor(private readonly configPath: string) {
    super();
  }

  async start(): Promise<void> {
    // Initial load — tolerate missing config (dashboard runs in "unconfigured" mode)
    try {
      this.config = await loadConfig(this.configPath);
    } catch (err: unknown) {
      const isNotFound = err instanceof Error && err.constructor.name === 'ConfigNotFoundError';
      if (isNotFound) {
        logger.warn(
          { path: this.configPath },
          'project.json not found — dashboard running in unconfigured mode',
        );
        this.config = null;
      } else {
        throw err;
      }
    }

    // Watch for changes (and for the file to be created)
    this.watcher = watch(this.configPath, { ...WATCH_OPTIONS, ignoreInitial: true });
    this.watcher.on('add', () => {
      void (async () => {
        try {
          this.config = await loadConfig(this.configPath);
          this.emit('updated', this.config);
          logger.info({ path: this.configPath }, 'project.json created — config loaded');
        } catch (err) {
          logger.warn({ err }, 'Failed to load config on add');
        }
      })();
    });
    this.watcher.on('change', () => {
      void (async () => {
        try {
          this.config = await loadConfig(this.configPath);
          this.emit('updated', this.config);
        } catch (err) {
          logger.warn({ err }, 'Failed to reload config on change');
        }
      })();
    });
  }

  getConfig(): ProjectConfig | null {
    return this.config;
  }

  stop(): void {
    void this.watcher?.close();
  }
}
