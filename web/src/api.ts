// Typed client for the backend. Types come straight from the server modules (type-only imports).
import type { DayInfo, WeekType } from '../../server/src/calendar/kidWeeks';
import type { PeriodWithTarget, Race } from '../../server/src/calendar/service';
import type { DailyLog, DailyLogPatch } from '../../server/src/log/repo';

export type { DailyLog, DayInfo, PeriodWithTarget, Race, WeekType };

export interface Today {
  date: string;
  log: DailyLog;
  calendar: { day: DayInfo; period: PeriodWithTarget | null } | null;
  nextRace: (Race & { inDays: number }) | null;
}

export class ApiError extends Error {
  constructor(public status: number, public code: string) {
    super(code);
  }
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: init?.body ? { 'Content-Type': 'application/json' } : undefined,
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, body.error ?? res.statusText);
  return body as T;
}

export const api = {
  today: () => request<Today>('/api/today'),
  googleStatus: () => request<{ configured: boolean; connected: boolean }>('/api/auth/google/status'),
  calendarDays: (from: string, to: string, refresh = false) =>
    request<{ days: DayInfo[]; periods: PeriodWithTarget[] }>(`/api/calendar/days?from=${from}&to=${to}${refresh ? '&refresh=true' : ''}`),
  races: (from: string, to: string) => request<{ races: Race[] }>(`/api/calendar/races?from=${from}&to=${to}`),
  logs: (from: string, to: string) => request<{ logs: DailyLog[] }>(`/api/log?from=${from}&to=${to}`),
  saveLog: (date: string, patch: DailyLogPatch) =>
    request<DailyLog>(`/api/log/${date}`, { method: 'PUT', body: JSON.stringify(patch) }),
};
