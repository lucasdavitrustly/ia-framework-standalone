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

export type IndexingObserver = (state: IndexingState) => void;

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
  private observers: Set<IndexingObserver> = new Set();

  getState(): IndexingState {
    return { ...this.state };
  }

  subscribe(observer: IndexingObserver): void {
    this.observers.add(observer);
  }

  unsubscribe(observer: IndexingObserver): void {
    this.observers.delete(observer);
  }

  private notifyObservers(): void {
    const snapshot = { ...this.state };
    this.observers.forEach((observer) => observer(snapshot));
  }

  start(startedAt: string): void {
    this.state = {
      ...defaultState,
      running: true,
      startedAt,
    };
    // No observer notification on start — frontend will see running=true on next poll
  }

  update(progress: IndexingProgress): void {
    this.state.stage = progress.stage;
    this.state.filesTotal = progress.filesTotal;
    this.state.filesProcessed = progress.filesProcessed;
    this.state.chunksTotal = progress.chunksTotal;
    this.state.chunksIndexed = progress.chunksIndexed;
    this.state.currentFile = progress.currentFile ?? null;
    this.notifyObservers();
  }

  complete(completedAt: string): void {
    this.state.running = false;
    this.state.stage = 'done';
    this.state.completedAt = completedAt;
    this.notifyObservers();
  }

  fail(error: string): void {
    this.state.running = false;
    this.state.error = error;
    this.state.completedAt = new Date().toISOString();
    this.notifyObservers();
  }
}
