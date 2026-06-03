// API client for the logs endpoint

export interface LogEntry {
  timestamp: string;
  level: number;
  levelLabel: string;
  component: string;
  msg: string;
  metadata: Record<string, unknown>;
}

export interface LogsResponse {
  entries: LogEntry[];
  total: number;
  file: string;
}

export type LogLevel = 'debug' | 'info' | 'warn' | 'error' | 'fatal';

const BASE = '';

export async function fetchLogs(params?: {
  level?: LogLevel;
  limit?: number;
}): Promise<LogsResponse> {
  const qs = new URLSearchParams();
  if (params?.level) qs.set('level', params.level);
  if (params?.limit !== undefined) qs.set('limit', String(params.limit));
  const q = qs.toString();
  const res = await fetch(`${BASE}/api/logs${q ? `?${q}` : ''}`);
  if (!res.ok) throw new Error(`Logs API error ${res.status}`);
  return res.json() as Promise<LogsResponse>;
}
