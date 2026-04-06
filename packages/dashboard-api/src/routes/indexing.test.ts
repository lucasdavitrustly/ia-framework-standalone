import { describe, it, expect, vi, beforeEach } from 'vitest';
import { IndexingStateManager } from '../indexing-state.js';
import type { IndexingState, IndexingObserver } from '../indexing-state.js';
import { indexingRouter } from './indexing.js';
import type { TriggerFn } from './indexing.js';
import type { IndexingProgress } from '@ia-framework/indexer';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeProgress(overrides: Partial<IndexingProgress> = {}): IndexingProgress {
  return {
    stage: 'parsing',
    filesTotal: 10,
    filesProcessed: 5,
    chunksTotal: 100,
    chunksIndexed: 50,
    ...overrides,
  };
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

describe('indexingRouter — stop route', () => {
  let indexingState: IndexingStateManager;

  beforeEach(() => {
    indexingState = new IndexingStateManager();
  });

  function makeRouter(triggerFn?: TriggerFn) {
    return indexingRouter({
      indexingState,
      triggerIndexing: triggerFn ?? vi.fn().mockReturnValue(new Promise(() => {})),
      frameworkDir: '/tmp/no-such-dir',
    });
  }

  // T14: POST /stop when running → 200 { message: 'Stop requested' }
  it('T14: POST /stop when running → 200 { message: Stop requested }', async () => {
    indexingState.start(new Date().toISOString());
    const router = makeRouter();
    const res = await router.request('/stop', { method: 'POST' });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { message: string };
    expect(body.message).toBe('Stop requested');
  });

  // T15: POST /stop when NOT running → still 200 (idempotent)
  it('T15: POST /stop when not running → still 200 (idempotent)', async () => {
    // indexingState is fresh — not running
    const router = makeRouter();
    const res = await router.request('/stop', { method: 'POST' });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { message: string };
    expect(body.message).toBe('Stop requested');
  });

  // T16: POST /stop → indexingState.cancel() is called → state.running becomes false
  it('T16: POST /stop → indexingState.cancel() called → state.running=false', async () => {
    indexingState.start(new Date().toISOString());
    expect(indexingState.getState().running).toBe(true);
    const router = makeRouter();
    await router.request('/stop', { method: 'POST' });
    expect(indexingState.getState().running).toBe(false);
    expect(indexingState.getState().error).toBe('Indexing cancelled');
  });
});

describe('indexingRouter — stage-aware status route', () => {
  let indexingState: IndexingStateManager;

  beforeEach(() => {
    indexingState = new IndexingStateManager();
  });

  function makeRouter(triggerFn?: TriggerFn) {
    return indexingRouter({
      indexingState,
      triggerIndexing: triggerFn ?? vi.fn().mockReturnValue(new Promise(() => {})),
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

  // T9: POST /trigger → triggerIndexing mock receives a progress callback; calling it updates state
  it('T9: POST /trigger → triggerIndexing receives callback; calling it updates state', async () => {
    let capturedCallback: ((p: IndexingProgress) => void) | null = null;

    const triggerFn: TriggerFn = vi.fn().mockImplementation((onProgress) => {
      capturedCallback = onProgress;
      return new Promise(() => {}); // never resolves during test
    });

    const router = makeRouter(triggerFn);
    const res = await router.request('/trigger', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });

    expect(res.status).toBe(202);
    expect(capturedCallback).toBeDefined();

    // Simulate progress callback firing
    capturedCallback!(makeProgress({ stage: 'embedding', chunksIndexed: 25, chunksTotal: 100 }));

    const state = indexingState.getState();
    expect(state.stage).toBe('embedding');
    expect(state.chunksIndexed).toBe(25);
    expect(state.chunksTotal).toBe(100);
  });

  // T10: POST /trigger → observer registered before trigger fires is notified when progress callback invoked
  it('T10: observer registered before trigger is notified when progress callback fires', async () => {
    let capturedCallback: ((p: IndexingProgress) => void) | null = null;

    const triggerFn: TriggerFn = vi.fn().mockImplementation((onProgress) => {
      capturedCallback = onProgress;
      return new Promise(() => {});
    });

    const observer = vi.fn() as unknown as IndexingObserver;

    // Register observer BEFORE trigger
    indexingState.subscribe(observer);

    const router = makeRouter(triggerFn);
    await router.request('/trigger', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });

    expect(capturedCallback).toBeDefined();

    // Observer should NOT have been called yet (start() does not notify)
    expect(observer).not.toHaveBeenCalled();

    // Invoke captured callback → should notify observer
    capturedCallback!(makeProgress({ stage: 'parsing', filesProcessed: 7, filesTotal: 20 }));

    expect(observer).toHaveBeenCalledOnce();
    const calls10 = (observer as ReturnType<typeof vi.fn>).mock.calls;
    const snapshot10 = calls10[0]?.[0] as IndexingState;
    expect(snapshot10.stage).toBe('parsing');
    expect(snapshot10.filesProcessed).toBe(7);
  });
});
