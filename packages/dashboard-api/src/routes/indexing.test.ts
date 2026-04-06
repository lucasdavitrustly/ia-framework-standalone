import { describe, it, expect, vi, beforeEach } from 'vitest';
import { IndexingStateManager } from '../indexing-state.js';
import type { IndexingState, IndexingObserver } from '../indexing-state.js';
import type { IndexingProgress } from '@ia-framework/indexer';
import { indexingRouter } from './indexing.js';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeProgress(overrides: Partial<IndexingProgress> = {}): IndexingProgress {
  return {
    stage: 'parsing',
    filesTotal: 10,
    filesProcessed: 5,
    chunksTotal: 100,
    chunksIndexed: 50,
    ...overrides,
  } as IndexingProgress;
}

// ─── Observer unit tests ──────────────────────────────────────────────────────

describe('IndexingStateManager — observer pattern', () => {
  let stateManager: IndexingStateManager;

  beforeEach(() => {
    stateManager = new IndexingStateManager();
    stateManager.start(new Date().toISOString());
  });

  // T1: subscribe() — registered observer is called when update() fires
  it('T1: registered observer is called when update() fires', () => {
    const observer = vi.fn() as unknown as IndexingObserver;
    stateManager.subscribe(observer);
    stateManager.update(makeProgress({ stage: 'walking' }));
    expect(observer).toHaveBeenCalledOnce();
    const calls = (observer as ReturnType<typeof vi.fn>).mock.calls;
    const snapshot = calls[0]?.[0] as IndexingState;
    expect(snapshot.stage).toBe('walking');
  });

  // T2: subscribe() — registered observer is called when complete() fires (stage='done')
  it('T2: registered observer is called when complete() fires', () => {
    const observer = vi.fn() as unknown as IndexingObserver;
    stateManager.subscribe(observer);
    stateManager.complete(new Date().toISOString());
    expect(observer).toHaveBeenCalledOnce();
    const calls2 = (observer as ReturnType<typeof vi.fn>).mock.calls;
    const snapshot2 = calls2[0]?.[0] as IndexingState;
    expect(snapshot2.stage).toBe('done');
    expect(snapshot2.running).toBe(false);
  });

  // T3: subscribe() — registered observer is called when fail() fires
  it('T3: registered observer is called when fail() fires', () => {
    const observer = vi.fn() as unknown as IndexingObserver;
    stateManager.subscribe(observer);
    stateManager.fail('Something went wrong');
    expect(observer).toHaveBeenCalledOnce();
    const calls3 = (observer as ReturnType<typeof vi.fn>).mock.calls;
    const snapshot3 = calls3[0]?.[0] as IndexingState;
    expect(snapshot3.error).toBe('Something went wrong');
    expect(snapshot3.running).toBe(false);
  });

  // T4: unsubscribe() — removed observer is NOT called after unsubscription
  it('T4: unsubscribed observer is NOT called after unsubscription', () => {
    const observer = vi.fn() as unknown as IndexingObserver;
    stateManager.subscribe(observer);
    stateManager.unsubscribe(observer);
    stateManager.update(makeProgress({ stage: 'embedding' }));
    expect(observer).not.toHaveBeenCalled();
  });

  // T5: multiple observers — all observers are notified on update()
  it('T5: multiple observers are all notified on update()', () => {
    const obs1 = vi.fn() as unknown as IndexingObserver;
    const obs2 = vi.fn() as unknown as IndexingObserver;
    const obs3 = vi.fn() as unknown as IndexingObserver;
    stateManager.subscribe(obs1);
    stateManager.subscribe(obs2);
    stateManager.subscribe(obs3);
    stateManager.update(makeProgress({ stage: 'storing' }));
    expect(obs1).toHaveBeenCalledOnce();
    expect(obs2).toHaveBeenCalledOnce();
    expect(obs3).toHaveBeenCalledOnce();
  });
});

// ─── Cancel unit tests ───────────────────────────────────────────────────────

describe('IndexingStateManager — cancel()', () => {
  let stateManager: IndexingStateManager;

  beforeEach(() => {
    stateManager = new IndexingStateManager();
    stateManager.start(new Date().toISOString());
  });

  // T11: cancel() sets running=false and error='Indexing cancelled'
  it('T11: cancel() sets running=false and error=Indexing cancelled', () => {
    stateManager.cancel();
    const state = stateManager.getState();
    expect(state.running).toBe(false);
    expect(state.error).toBe('Indexing cancelled');
  });

  // T12: cancel() notifies observers
  it('T12: cancel() notifies observers', () => {
    const observer = vi.fn() as unknown as IndexingObserver;
    stateManager.subscribe(observer);
    stateManager.cancel();
    expect(observer).toHaveBeenCalledOnce();
    const calls = (observer as ReturnType<typeof vi.fn>).mock.calls;
    const snapshot = calls[0]?.[0] as IndexingState;
    expect(snapshot.running).toBe(false);
    expect(snapshot.error).toBe('Indexing cancelled');
  });

  // T13: start() resets cancelled flag so isCancelled() returns false after re-start
  it('T13: start() resets cancelled flag', () => {
    stateManager.cancel();
    expect(stateManager.isCancelled()).toBe(true);
    stateManager.start(new Date().toISOString());
    expect(stateManager.isCancelled()).toBe(false);
  });
});

// ─── Route integration tests ─────────────────────────────────────────────────

describe('indexingRouter — stage-aware status route', () => {
  let indexingState: IndexingStateManager;

  beforeEach(() => {
    indexingState = new IndexingStateManager();
  });

  function makeRouter() {
    return indexingRouter({
      indexingState,
      frameworkDir: '/tmp/no-such-dir', // readProgressFile returns null when dir missing
    });
  }

  // T6: GET /status with stage='walking' → correct response
  it('T6: GET /status with stage=walking → { stage: walking, filesTotal: 0 }', async () => {
    indexingState.start(new Date().toISOString());
    indexingState.update(makeProgress({ stage: 'walking', filesTotal: 0, filesProcessed: 0 }));
    const router = makeRouter();
    const res = await router.request('/status');
    expect(res.status).toBe(200);
    const body = (await res.json()) as { stage: string; filesTotal: number };
    expect(body.stage).toBe('walking');
    expect(body.filesTotal).toBe(0);
  });

  // T7: GET /status with stage='parsing', filesProcessed=3, filesTotal=10 → correct counts
  it('T7: GET /status with stage=parsing → correct file counts', async () => {
    indexingState.start(new Date().toISOString());
    indexingState.update(makeProgress({ stage: 'parsing', filesTotal: 10, filesProcessed: 3 }));
    const router = makeRouter();
    const res = await router.request('/status');
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      stage: string;
      filesTotal: number;
      filesProcessed: number;
    };
    expect(body.stage).toBe('parsing');
    expect(body.filesTotal).toBe(10);
    expect(body.filesProcessed).toBe(3);
  });

  // T8: GET /status with stage='embedding', chunksIndexed=50, chunksTotal=200 → correct counts
  it('T8: GET /status with stage=embedding → correct chunk counts', async () => {
    indexingState.start(new Date().toISOString());
    indexingState.update(makeProgress({ stage: 'embedding', chunksTotal: 200, chunksIndexed: 50 }));
    const router = makeRouter();
    const res = await router.request('/status');
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      stage: string;
      chunksTotal: number;
      chunksIndexed: number;
    };
    expect(body.stage).toBe('embedding');
    expect(body.chunksTotal).toBe(200);
    expect(body.chunksIndexed).toBe(50);
  });
});
