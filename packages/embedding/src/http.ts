import { EMBEDDING_REQUEST_TIMEOUT_MS } from './interface.js';

/**
 * Build an AbortSignal that fires on either a per-request timeout or the
 * caller's cancellation signal. Used by every embedding provider fetch so a
 * wedged request cannot hang the run and `--stop` interrupts in-flight calls.
 */
export function requestSignal(
  caller?: AbortSignal,
  timeoutMs: number = EMBEDDING_REQUEST_TIMEOUT_MS,
): AbortSignal {
  const timeout = AbortSignal.timeout(timeoutMs);
  if (!caller) return timeout;
  // AbortSignal.any aborts as soon as any input aborts (Node 20.3+/22+).
  return AbortSignal.any([caller, timeout]);
}
