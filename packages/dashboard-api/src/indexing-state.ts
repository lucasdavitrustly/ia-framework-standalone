import type { IndexingProgress } from '@ia-framework/indexer';

export interface IndexingState {
  running: boolean;
  stage: string | null;
  filesTotal: number;
  filesProcessed: number;
  chunksTotal: number;
  chunksIndexed: number;
  currentFile: string | null;
  startedAt: string | null;
  completedAt: string | null;
  error: string | null;
}

const defaultState: IndexingState = {
  running: false,
  stage: null,
  filesTotal: 0,
  filesProcessed: 0,
  chunksTotal: 0,
  chunksIndexed: 0,
  currentFile: null,
  startedAt: null,
  completedAt: null,
  error: null,
};

export class IndexingStateManager {
  private state: IndexingState = { ...defaultState };

  getState(): IndexingState {
    return { ...this.state };
  }

  start(startedAt: string): void {
    this.state = {
      ...defaultState,
      running: true,
      startedAt,
    };
  }

  update(progress: IndexingProgress): void {
    this.state.stage = progress.stage;
    this.state.filesTotal = progress.filesTotal;
    this.state.filesProcessed = progress.filesProcessed;
    this.state.chunksTotal = progress.chunksTotal;
    this.state.chunksIndexed = progress.chunksIndexed;
    this.state.currentFile = progress.currentFile ?? null;
  }

  complete(completedAt: string): void {
    this.state.running = false;
    this.state.stage = 'done';
    this.state.completedAt = completedAt;
  }

  fail(error: string): void {
    this.state.running = false;
    this.state.error = error;
    this.state.completedAt = new Date().toISOString();
  }
}
