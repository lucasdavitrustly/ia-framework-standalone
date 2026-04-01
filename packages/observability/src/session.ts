/**
 * Generates a stable session ID for the current process.
 * Format: YYYY-MM-DD-{pid}
 * Stable: same value for the entire duration of the process.
 */
export function generateSessionId(): string {
  const date = new Date().toISOString().slice(0, 10);
  return `${date}-${process.pid}`;
}
