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
    // Initial load
    this.config = await loadConfig(this.configPath);

    // Watch for changes
    this.watcher = watch(this.configPath, WATCH_OPTIONS);
    this.watcher.on('change', async () => {
      try {
        this.config = await loadConfig(this.configPath);
        this.emit('updated', this.config);
      } catch (err) {
        logger.warn({ err }, 'Failed to reload config on change');
      }
    });
  }

  getConfig(): ProjectConfig | null {
    return this.config;
  }

  stop(): void {
    this.watcher?.close();
  }
}
